import type { Match } from '../types';
import type { OcrAliasModel } from './ocrAliasEngine';
import { normalizeOcrName } from './stringUtils';
import { resolvePlayerProfileDisplayName } from '../store/slices/createMappingSlice';

type CounterMap = Record<string, number>;

interface AnalyticsPlayerProfileLike {
  id?: string;
  name?: string;
  sightings?: number;
  firstSeen?: number;
  lastSeen?: number;
  teamsObserved?: CounterMap;
  playedWith?: CounterMap;
  playedAgainst?: CounterMap;
  shipsObserved?: CounterMap;
  ocrSightings?: number;
  manualSightings?: number;
  lastOcrConfidence?: number;
}

export interface AnalyticsIdentityInputs {
  pilotRegistry?: string[];
  pilotAliases?: Record<string, string[]>;
  knownMappings?: Record<string, string>;
  playerProfiles?: Record<string, AnalyticsPlayerProfileLike>;
  aliasModel?: OcrAliasModel;
}

export interface AnalyticsIdentityResolver {
  resolveName: (rawName: string | null | undefined) => string;
  canonicalizeNames: (values: Array<string | null | undefined>) => string[];
  canonicalizeMatch: (match: Match) => Match;
  canonicalizeMatches: (matches: Match[]) => Match[];
  canonicalizePlayerProfiles: (
    playerProfiles?: Record<string, AnalyticsPlayerProfileLike>
  ) => Record<string, AnalyticsPlayerProfileLike>;
}

const toNameKey = (value: string | null | undefined): string =>
  normalizeOcrName(String(value || '')).toLowerCase();

const toPositiveNumber = (value: unknown): number => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const mergeCounterMaps = (...maps: Array<CounterMap | undefined>): CounterMap => {
  const merged: CounterMap = {};
  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([key, value]) => {
      const numeric = Number(value || 0);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      merged[key] = (merged[key] || 0) + numeric;
    });
  });
  return merged;
};

const mergeRelationshipMap = (
  map: CounterMap | undefined,
  resolveName: (rawName: string | null | undefined) => string
): CounterMap => {
  const merged: CounterMap = {};
  Object.entries(map || {}).forEach(([rawName, value]) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const canonicalName = resolveName(rawName) || normalizeOcrName(rawName || '') || String(rawName || '').trim();
    const key = canonicalName.trim();
    if (!key) return;
    merged[key] = (merged[key] || 0) + numeric;
  });
  return merged;
};

const mergePlayerProfiles = (
  existing: AnalyticsPlayerProfileLike | undefined,
  incoming: AnalyticsPlayerProfileLike,
  canonicalName: string
): AnalyticsPlayerProfileLike => {
  const firstSeenCandidates = [
    toPositiveNumber(existing?.firstSeen),
    toPositiveNumber(incoming.firstSeen),
  ].filter((value) => value > 0);
  const latestExistingConfidence = toPositiveNumber(existing?.lastOcrConfidence);
  const latestIncomingConfidence = toPositiveNumber(incoming.lastOcrConfidence);

  return {
    id: canonicalName,
    name: canonicalName,
    sightings: toPositiveNumber(existing?.sightings) + toPositiveNumber(incoming.sightings),
    firstSeen: firstSeenCandidates.length > 0 ? Math.min(...firstSeenCandidates) : 0,
    lastSeen: Math.max(toPositiveNumber(existing?.lastSeen), toPositiveNumber(incoming.lastSeen)),
    teamsObserved: mergeCounterMaps(existing?.teamsObserved, incoming.teamsObserved),
    playedWith: mergeCounterMaps(existing?.playedWith, incoming.playedWith),
    playedAgainst: mergeCounterMaps(existing?.playedAgainst, incoming.playedAgainst),
    shipsObserved: mergeCounterMaps(existing?.shipsObserved, incoming.shipsObserved),
    ocrSightings: toPositiveNumber(existing?.ocrSightings) + toPositiveNumber(incoming.ocrSightings),
    manualSightings: toPositiveNumber(existing?.manualSightings) + toPositiveNumber(incoming.manualSightings),
    lastOcrConfidence: Math.max(latestExistingConfidence, latestIncomingConfidence) || undefined,
  };
};

const toProfileNameSource = (
  profileId: string,
  profile: AnalyticsPlayerProfileLike | undefined
): { id: string; name?: string } => ({
  id: String(profile?.id || profileId || '').trim(),
  ...(typeof profile?.name === 'string' && profile.name.trim()
    ? { name: profile.name.trim() }
    : {}),
});

export const buildAnalyticsIdentityResolver = ({
  pilotRegistry = [],
  pilotAliases = {},
  knownMappings = {},
  playerProfiles = {},
  aliasModel,
}: AnalyticsIdentityInputs): AnalyticsIdentityResolver => {
  const canonicalNames = new Map<string, { name: string; priority: number }>();
  const exactAliasMap = new Map<string, { name: string; priority: number }>();
  const learnedAliasMap = new Map<string, string>();

  const registerCanonicalName = (value: string | null | undefined, priority: number): string => {
    const normalized = normalizeOcrName(String(value || ''));
    const key = normalized.toLowerCase();
    if (!key) return '';
    const existing = canonicalNames.get(key);
    if (!existing || priority > existing.priority) {
      canonicalNames.set(key, { name: normalized, priority });
      return normalized;
    }
    return existing.name;
  };

  const getKnownCanonicalName = (value: string | null | undefined): string => {
    const key = toNameKey(value);
    if (!key) return '';
    return exactAliasMap.get(key)?.name || canonicalNames.get(key)?.name || '';
  };

  const registerExactAlias = (
    alias: string | null | undefined,
    canonicalTarget: string | null | undefined,
    priority: number
  ) => {
    const aliasKey = toNameKey(alias);
    if (!aliasKey) return;
    const target = getKnownCanonicalName(canonicalTarget) || registerCanonicalName(canonicalTarget, priority);
    if (!target) return;
    const existing = exactAliasMap.get(aliasKey);
    if (!existing || priority > existing.priority) {
      exactAliasMap.set(aliasKey, { name: target, priority });
    }
  };

  pilotRegistry.forEach((name) => registerCanonicalName(name, 5));
  Object.keys(pilotAliases || {}).forEach((name) => registerCanonicalName(name, 4));
  Object.values(knownMappings || {}).forEach((name) => registerCanonicalName(name, 3));
  Object.entries(playerProfiles || {}).forEach(([profileId, profile]) => {
    const displayName = resolvePlayerProfileDisplayName(
      profileId,
      toProfileNameSource(profileId, profile),
      knownMappings
    );
    if (displayName) registerCanonicalName(displayName, 2);
  });

  canonicalNames.forEach(({ name, priority }) => {
    registerExactAlias(name, name, priority);
  });

  Object.entries(pilotAliases || {}).forEach(([canonicalName, aliases]) => {
    const resolvedCanonical = getKnownCanonicalName(canonicalName) || registerCanonicalName(canonicalName, 4);
    registerExactAlias(canonicalName, resolvedCanonical, 4);
    (aliases || []).forEach((alias) => {
      registerExactAlias(alias, resolvedCanonical, 4);
    });
  });

  Object.entries(aliasModel?.entries || {}).forEach(([normalizedKey, entries]) => {
    const canonicalTargets = new Map<string, string>();
    (entries || []).forEach((entry) => {
      const canonicalTarget = getKnownCanonicalName(entry?.targetName || '');
      const targetKey = toNameKey(canonicalTarget);
      if (!canonicalTarget || !targetKey) return;
      canonicalTargets.set(targetKey, canonicalTarget);
    });
    if (canonicalTargets.size !== 1) return;
    const canonicalTarget = Array.from(canonicalTargets.values())[0];
    const candidateKeys = new Set<string>();
    candidateKeys.add(toNameKey(normalizedKey));
    (entries || []).forEach((entry) => {
      candidateKeys.add(toNameKey(entry?.rawKey || ''));
      candidateKeys.add(toNameKey(entry?.normalizedKey || ''));
    });
    candidateKeys.forEach((key) => {
      if (!key || exactAliasMap.has(key)) return;
      learnedAliasMap.set(key, canonicalTarget);
    });
  });

  const resolveName = (rawName: string | null | undefined): string => {
    const normalized = normalizeOcrName(String(rawName || ''));
    const key = normalized.toLowerCase();
    if (!key) return '';
    return exactAliasMap.get(key)?.name || learnedAliasMap.get(key) || normalized;
  };

  const canonicalizeNames = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
      const canonicalName = resolveName(value);
      const key = toNameKey(canonicalName);
      if (!key || seen.has(key)) return;
      seen.add(key);
      next.push(canonicalName);
    });
    return next;
  };

  const canonicalizeMatch = (match: Match): Match => {
    const player = resolveName(match.player) || normalizeOcrName(match.player || '') || String(match.player || '').trim();
    const teammates = canonicalizeNames(match.teammates || []);
    const normalizedOpponentTeams = Array.isArray(match.opponentTeams)
      ? match.opponentTeams.map((team) => ({
        ...team,
        players: canonicalizeNames(team.players || []),
      }))
      : match.opponentTeams;
    const opponentsFromTeams = Array.isArray(normalizedOpponentTeams)
      ? normalizedOpponentTeams.flatMap((team) => team.players || [])
      : [];
    const opponents = canonicalizeNames([
      ...(match.opponents || []),
      ...opponentsFromTeams,
    ]);

    return {
      ...match,
      player,
      teammates,
      opponents,
      opponentTeams: normalizedOpponentTeams,
    };
  };

  const canonicalizeMatches = (matches: Match[]): Match[] => (
    (matches || []).map((match) => canonicalizeMatch(match))
  );

  const canonicalizePlayerProfiles = (
    profiles: Record<string, AnalyticsPlayerProfileLike> = {}
  ): Record<string, AnalyticsPlayerProfileLike> => {
    const canonicalProfiles: Record<string, AnalyticsPlayerProfileLike> = {};
    Object.entries(profiles || {}).forEach(([profileId, profile]) => {
      const displayName = resolvePlayerProfileDisplayName(
        profileId,
        toProfileNameSource(profileId, profile),
        knownMappings
      );
      const canonicalName = resolveName(displayName || profile?.name || profileId)
        || normalizeOcrName(displayName || profile?.name || profileId || '')
        || String(profileId || '').trim();
      if (!canonicalName) return;
      const normalizedProfile: AnalyticsPlayerProfileLike = {
        id: canonicalName,
        name: canonicalName,
        sightings: toPositiveNumber(profile?.sightings),
        firstSeen: toPositiveNumber(profile?.firstSeen),
        lastSeen: toPositiveNumber(profile?.lastSeen),
        teamsObserved: mergeCounterMaps(profile?.teamsObserved),
        playedWith: mergeRelationshipMap(profile?.playedWith, resolveName),
        playedAgainst: mergeRelationshipMap(profile?.playedAgainst, resolveName),
        shipsObserved: mergeCounterMaps(profile?.shipsObserved),
        ocrSightings: toPositiveNumber(profile?.ocrSightings),
        manualSightings: toPositiveNumber(profile?.manualSightings),
        lastOcrConfidence: toPositiveNumber(profile?.lastOcrConfidence) || undefined,
      };
      canonicalProfiles[canonicalName] = mergePlayerProfiles(
        canonicalProfiles[canonicalName],
        normalizedProfile,
        canonicalName
      );
    });
    return canonicalProfiles;
  };

  return {
    resolveName,
    canonicalizeNames,
    canonicalizeMatch,
    canonicalizeMatches,
    canonicalizePlayerProfiles,
  };
};
