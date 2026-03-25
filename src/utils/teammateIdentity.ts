import { normalizeOcrName } from './stringUtils';

export type TeammateIdentityStatus = 'learning' | 'auto_linked' | 'confirmed' | 'conflicted';
export type TeammateIdentitySource = 'crew_hub' | 'social' | 'matchstats' | 'telemetry_direct' | 'manual' | 'unknown';

export interface TeammateIdentityPlayerProfile {
  playedWith?: Record<string, number>;
}

export interface TeammateIdentityCandidate {
  displayName: string;
  sampleCount: number;
  weightedScore: number;
  maxOcrConfidence: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sourceCounts: Record<TeammateIdentitySource, number>;
}

export interface TeammateIdentityRecord {
  playerId: string;
  status: TeammateIdentityStatus;
  currentName?: string;
  lockedByUser?: boolean;
  autoLinkedAt?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sampleCount: number;
  candidates: Record<string, TeammateIdentityCandidate>;
  recentObservations?: string[];
}

export interface ObservedTeammateName {
  name: string;
  confidence?: number | null;
  source?: TeammateIdentitySource;
}

export interface TeammateIdentityAssignment {
  playerId: string;
  displayName: string;
  confidence: number;
  source: TeammateIdentitySource;
}

export interface TeammateIdentityPromotion {
  playerId: string;
  previousName?: string;
  nextName: string;
  status: TeammateIdentityStatus;
  autoCorrected?: boolean;
}

export interface TeammateIdentityObservationInput {
  friendlyPlayerIds: string[];
  observedNames: ObservedTeammateName[];
  activeUser?: string | null;
  knownMappings?: Record<string, string>;
  playerIdMap?: Record<string, string>;
  playerProfiles?: Record<string, TeammateIdentityPlayerProfile>;
  pilotRegistry?: string[];
  now?: number;
}

export interface TeammateIdentityObservationResult {
  assignments: Record<string, string>;
  promotions: TeammateIdentityPromotion[];
}

interface ScoredCandidate extends ObservedTeammateName {
  normalizedName: string;
  displayName: string;
  confidenceValue: number;
  index: number;
  source: TeammateIdentitySource;
}

interface ScoredAssignment {
  playerId: string;
  candidate: ScoredCandidate;
  score: number;
}

const GUID_HEX_PATTERN = /^[A-F0-9]{32}$/i;

const normalizeGuidLikeId = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.replace(/[{}-]/g, '');
  if (GUID_HEX_PATTERN.test(direct)) return direct.toUpperCase();

  const segments = raw.split(/[|/\\:.]/g).map((part) => part.trim()).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index].replace(/[{}-]/g, '');
    if (GUID_HEX_PATTERN.test(candidate)) return candidate.toUpperCase();
  }
  return raw;
};

const normalizeNameKey = (value: string | null | undefined): string =>
  normalizeOcrName(value || '').toLowerCase();

export const normalizeTeammatePlayerId = (value: unknown): string =>
  normalizeGuidLikeId(value || '');

const emptySourceCounts = (): Record<TeammateIdentitySource, number> => ({
  crew_hub: 0,
  social: 0,
  matchstats: 0,
  telemetry_direct: 0,
  manual: 0,
  unknown: 0,
});

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeConfidence = (value: unknown, fallback = 0.78): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return clamp(normalized, 0.2, 1.1);
};

const dedupeIds = (values: string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((rawValue) => {
    const normalized = normalizeTeammatePlayerId(rawValue);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
};

const dedupeObservedNames = (
  values: ObservedTeammateName[],
  activeUser?: string | null,
): ScoredCandidate[] => {
  const activeUserKey = normalizeNameKey(activeUser || '');
  const next = new Map<string, ScoredCandidate>();

  values.forEach((entry, index) => {
    const normalizedName = normalizeNameKey(entry.name);
    if (!normalizedName || normalizedName === activeUserKey) return;
    const confidenceValue = normalizeConfidence(entry.confidence, entry.source === 'manual' ? 1 : 0.78);
    const candidate: ScoredCandidate = {
      ...entry,
      normalizedName,
      displayName: normalizeOcrName(entry.name || ''),
      confidenceValue,
      index,
      source: entry.source || 'unknown',
    };
    const existing = next.get(normalizedName);
    if (!existing || candidate.confidenceValue >= existing.confidenceValue) {
      next.set(normalizedName, candidate);
    }
  });

  return Array.from(next.values());
};

const getCurrentCandidate = (
  record: TeammateIdentityRecord | undefined,
): { key: string; candidate: TeammateIdentityCandidate } | null => {
  if (!record?.currentName) return null;
  const key = normalizeNameKey(record.currentName);
  if (!key) return null;
  const candidate = record.candidates[key];
  if (!candidate) return null;
  return { key, candidate };
};

const getCandidateNormalizedScore = (
  candidate: TeammateIdentityCandidate | undefined,
): number => {
  if (!candidate || candidate.sampleCount <= 0) return 0;
  return clamp(candidate.weightedScore / candidate.sampleCount, 0, 1.2);
};

const getResolvedAnchorKeys = (
  candidates: ScoredCandidate[],
  pilotRegistry: string[],
  reservedAssignments: Record<string, string>,
): string[] => {
  const registryKeys = new Set((pilotRegistry || []).map((name) => normalizeNameKey(name)).filter(Boolean));
  const reservedKeys = Object.values(reservedAssignments).map((name) => normalizeNameKey(name)).filter(Boolean);
  const observedRegistryKeys = candidates
    .map((candidate) => candidate.normalizedName)
    .filter((key) => registryKeys.has(key));
  return Array.from(new Set([...reservedKeys, ...observedRegistryKeys]));
};

const hasCoplayAnchorSupport = (
  candidateName: string,
  anchorKeys: string[],
  playerProfiles: Record<string, TeammateIdentityPlayerProfile>,
): boolean => {
  if (anchorKeys.length < 2) return false;
  const normalizedCandidateName = normalizeNameKey(candidateName);
  if (!normalizedCandidateName) return false;
  const profileEntry = Object.entries(playerProfiles || {}).find(([profileName]) => (
    normalizeNameKey(profileName) === normalizedCandidateName
  ));
  const profile = profileEntry?.[1];
  if (!profile?.playedWith) return false;
  const playedWithKeys = new Map<string, number>();
  Object.entries(profile.playedWith).forEach(([name, count]) => {
    const normalizedName = normalizeNameKey(name);
    if (!normalizedName) return;
    playedWithKeys.set(normalizedName, Number.isFinite(count) ? Number(count) : 0);
  });
  const supported = anchorKeys.filter((anchorKey) => (playedWithKeys.get(anchorKey) || 0) >= 1);
  return supported.length >= 2;
};

const scorePair = ({
  record,
  playerId,
  playerIdIndex,
  candidate,
  anchorKeys,
  knownMappings,
  playerIdMap,
  playerProfiles,
}: {
  record?: TeammateIdentityRecord;
  playerId: string;
  playerIdIndex: number;
  candidate: ScoredCandidate;
  anchorKeys: string[];
  knownMappings: Record<string, string>;
  playerIdMap: Record<string, string>;
  playerProfiles: Record<string, TeammateIdentityPlayerProfile>;
}): number => {
  const previousCandidate = record?.candidates?.[candidate.normalizedName];
  const previousScore = getCandidateNormalizedScore(previousCandidate);
  const currentNameKey = normalizeNameKey(record?.currentName || '');
  const mappedNameKey = normalizeNameKey(knownMappings[playerId] || playerIdMap[playerId] || '');
  const exactMappedBoost = mappedNameKey && mappedNameKey === candidate.normalizedName ? 0.28 : 0;
  const currentNameBoost = currentNameKey && currentNameKey === candidate.normalizedName ? 0.24 : 0;
  const contradictionPenalty = currentNameKey && currentNameKey !== candidate.normalizedName ? 0.18 : 0;
  const recentPenalty = (record?.recentObservations || []).slice(-3).some((entry) => (
    entry && entry !== candidate.normalizedName
  )) ? 0.08 : 0;
  const positionBoost = Math.max(0, 0.12 - (Math.abs(playerIdIndex - candidate.index) * 0.05));
  const socialBoost = hasCoplayAnchorSupport(candidate.displayName, anchorKeys, playerProfiles) ? 0.1 : 0;
  const sourceBoost = candidate.source === 'manual'
    ? 0.18
    : candidate.source === 'telemetry_direct'
      ? 0.24
      : candidate.source === 'social'
        ? 0.06
        : 0;

  return clamp(
    (candidate.confidenceValue * 0.7)
      + (previousScore * 0.28)
      + exactMappedBoost
      + currentNameBoost
      + positionBoost
      + socialBoost
      + sourceBoost
      - contradictionPenalty
      - recentPenalty,
    0,
    1.2,
  );
};

const enumerateAssignments = (
  playerIds: string[],
  candidates: ScoredCandidate[],
  scorer: (playerId: string, playerIdIndex: number, candidate: ScoredCandidate) => number,
): Array<{ total: number; min: number; assignments: ScoredAssignment[] }> => {
  if (playerIds.length === 0) return [{ total: 0, min: 0, assignments: [] }];
  if (candidates.length < playerIds.length) return [];

  const permutations: Array<{ total: number; min: number; assignments: ScoredAssignment[] }> = [];
  const used = new Set<number>();

  const walk = (index: number, current: ScoredAssignment[], total: number, minScore: number) => {
    if (index >= playerIds.length) {
      permutations.push({ total, min: minScore, assignments: [...current] });
      return;
    }

    candidates.forEach((candidate) => {
      if (used.has(candidate.index)) return;
      used.add(candidate.index);
      const playerId = playerIds[index];
      const score = scorer(playerId, index, candidate);
      current.push({ playerId, candidate, score });
      walk(index + 1, current, total + score, Math.min(minScore, score));
      current.pop();
      used.delete(candidate.index);
    });
  };

  walk(0, [], 0, Number.POSITIVE_INFINITY);
  return permutations.sort((left, right) => right.total - left.total);
};

const createEmptyRecord = (playerId: string, now: number): TeammateIdentityRecord => ({
  playerId,
  status: 'learning',
  firstSeenAt: now,
  lastSeenAt: now,
  sampleCount: 0,
  candidates: {},
  recentObservations: [],
});

const evaluatePromotion = (
  record: TeammateIdentityRecord,
  now: number,
): TeammateIdentityPromotion | null => {
  const sortedCandidates = Object.entries(record.candidates || {})
    .map(([key, candidate]) => ({ key, candidate, normalizedScore: getCandidateNormalizedScore(candidate) }))
    .sort((left, right) => {
      if (right.candidate.weightedScore !== left.candidate.weightedScore) {
        return right.candidate.weightedScore - left.candidate.weightedScore;
      }
      return right.candidate.lastSeenAt - left.candidate.lastSeenAt;
    });
  const top = sortedCandidates[0];
  if (!top) return null;
  const runnerUp = sortedCandidates[1];
  const margin = top.normalizedScore - (runnerUp?.normalizedScore || 0);
  const recentObservations = (record.recentObservations || []).slice(-3).filter(Boolean);
  const noRecentContradiction = recentObservations.length === 0
    || recentObservations.every((entry) => entry === top.key);

  if (record.lockedByUser) {
    if (record.currentName && normalizeNameKey(record.currentName) !== top.key && margin >= 0.12) {
      record.status = 'conflicted';
    }
    return null;
  }

  if (!record.currentName || record.status === 'learning' || record.status === 'conflicted') {
    if (
      record.sampleCount >= 4
      && top.candidate.weightedScore >= 3.5
      && top.normalizedScore >= 0.97
      && margin >= 0.18
      && noRecentContradiction
    ) {
      const previousName = record.currentName;
      record.currentName = top.candidate.displayName;
      record.status = 'auto_linked';
      record.autoLinkedAt = now;
      return {
        playerId: record.playerId,
        previousName,
        nextName: top.candidate.displayName,
        status: 'auto_linked',
      };
    }
    return null;
  }

  if (record.status !== 'auto_linked') return null;

  const current = getCurrentCandidate(record);
  if (!current || current.key === top.key) return null;
  const currentScore = getCandidateNormalizedScore(current.candidate);
  const scoreRatio = current.candidate.weightedScore > 0
    ? top.candidate.weightedScore / current.candidate.weightedScore
    : Number.POSITIVE_INFINITY;
  if (
    record.sampleCount >= 6
    && top.normalizedScore >= 0.97
    && margin >= 0.25
    && scoreRatio >= 2
    && noRecentContradiction
  ) {
    const previousName = record.currentName;
    record.currentName = top.candidate.displayName;
    record.status = 'auto_linked';
    record.autoLinkedAt = now;
    return {
      playerId: record.playerId,
      previousName,
      nextName: top.candidate.displayName,
      status: 'auto_linked',
      autoCorrected: currentScore > 0,
    };
  }

  if (recentObservations.length === 3 && !recentObservations.every((entry) => entry === normalizeNameKey(record.currentName || ''))) {
    record.status = 'conflicted';
  }

  return null;
};

export const buildTeammateIdentityObservation = (
  records: Record<string, TeammateIdentityRecord>,
  input: TeammateIdentityObservationInput,
): TeammateIdentityObservationResult => {
  const now = Number.isFinite(input.now as number) ? Number(input.now) : Date.now();
  const knownMappings = input.knownMappings || {};
  const playerIdMap = input.playerIdMap || {};
  const playerProfiles = input.playerProfiles || {};
  const pilotRegistry = input.pilotRegistry || [];
  const friendlyPlayerIds = dedupeIds(input.friendlyPlayerIds || []);
  const observedNames = dedupeObservedNames(input.observedNames || [], input.activeUser);

  if (friendlyPlayerIds.length === 0 || observedNames.length === 0) {
    return { assignments: {}, promotions: [] };
  }

  const nextRecords = records;
  friendlyPlayerIds.forEach((playerId) => {
    if (!nextRecords[playerId]) {
      nextRecords[playerId] = createEmptyRecord(playerId, now);
    } else {
      nextRecords[playerId].lastSeenAt = now;
    }
  });

  const reservedAssignments: Record<string, string> = {};
  const reservedNameKeys = new Set<string>();
  const unlockedPlayerIds: string[] = [];

  friendlyPlayerIds.forEach((playerId) => {
    const record = nextRecords[playerId];
    if ((record.status === 'confirmed' || record.lockedByUser) && record.currentName) {
      const currentKey = normalizeNameKey(record.currentName);
      const observedCandidate = observedNames.find((candidate) => candidate.normalizedName === currentKey);
      if (observedCandidate) {
        reservedAssignments[playerId] = observedCandidate.displayName;
        reservedNameKeys.add(currentKey);
        return;
      }
    }
    unlockedPlayerIds.push(playerId);
  });

  const remainingCandidates = observedNames.filter((candidate) => !reservedNameKeys.has(candidate.normalizedName));
  const anchorKeys = getResolvedAnchorKeys(observedNames, pilotRegistry, reservedAssignments);
  const permutations = enumerateAssignments(
    unlockedPlayerIds,
    remainingCandidates,
    (playerId, playerIdIndex, candidate) => scorePair({
      record: nextRecords[playerId],
      playerId,
      playerIdIndex,
      candidate,
      anchorKeys,
      knownMappings,
      playerIdMap,
      playerProfiles,
    }),
  );

  const best = permutations[0];
  const runnerUp = permutations[1];
  const consistent = !!best
    && best.min >= 0.42
    && (permutations.length === 1 || (best.total - (runnerUp?.total || 0)) >= 0.25);

  const assignments: Record<string, string> = { ...reservedAssignments };
  const promotions: TeammateIdentityPromotion[] = [];

  const selectedAssignments = consistent ? best.assignments : [];
  selectedAssignments.forEach(({ playerId, candidate, score }) => {
    assignments[playerId] = candidate.displayName;
    const record = nextRecords[playerId] || createEmptyRecord(playerId, now);
    const candidateKey = candidate.normalizedName;
    const existingCandidate = record.candidates[candidateKey];
    record.lastSeenAt = now;
    record.sampleCount += 1;
    record.recentObservations = [...(record.recentObservations || []), candidateKey].slice(-6);
    record.candidates[candidateKey] = {
      displayName: candidate.displayName,
      sampleCount: (existingCandidate?.sampleCount || 0) + 1,
      weightedScore: (existingCandidate?.weightedScore || 0) + score,
      maxOcrConfidence: Math.max(existingCandidate?.maxOcrConfidence || 0, candidate.confidenceValue),
      firstSeenAt: existingCandidate?.firstSeenAt || now,
      lastSeenAt: now,
      sourceCounts: {
        ...(existingCandidate?.sourceCounts || emptySourceCounts()),
        [candidate.source]: ((existingCandidate?.sourceCounts || emptySourceCounts())[candidate.source] || 0) + 1,
      },
    };
    const promotion = evaluatePromotion(record, now);
    if (promotion) promotions.push(promotion);
    nextRecords[playerId] = record;
  });

  return { assignments, promotions };
};

export const confirmTeammateIdentityRecord = (
  records: Record<string, TeammateIdentityRecord>,
  playerId: string,
  displayName: string,
  opts: {
    source?: TeammateIdentitySource;
    lockedByUser?: boolean;
    now?: number;
  } = {},
): TeammateIdentityPromotion | null => {
  const normalizedPlayerId = normalizeTeammatePlayerId(playerId);
  const normalizedName = normalizeOcrName(displayName || '');
  if (!normalizedPlayerId || !normalizedName) return null;

  const now = Number.isFinite(opts.now as number) ? Number(opts.now) : Date.now();
  const source = opts.source || 'telemetry_direct';
  const record = records[normalizedPlayerId] || createEmptyRecord(normalizedPlayerId, now);
  const candidateKey = normalizeNameKey(normalizedName);
  const existingCandidate = record.candidates[candidateKey];

  record.lastSeenAt = now;
  record.sampleCount = Math.max(record.sampleCount, (existingCandidate?.sampleCount || 0) + 1);
  record.currentName = normalizedName;
  record.lockedByUser = opts.lockedByUser === true ? true : record.lockedByUser;
  record.status = 'confirmed';
  record.recentObservations = [...(record.recentObservations || []), candidateKey].slice(-6);
  record.candidates[candidateKey] = {
    displayName: normalizedName,
    sampleCount: (existingCandidate?.sampleCount || 0) + 1,
    weightedScore: (existingCandidate?.weightedScore || 0) + 1.1,
    maxOcrConfidence: Math.max(existingCandidate?.maxOcrConfidence || 0, 1),
    firstSeenAt: existingCandidate?.firstSeenAt || now,
    lastSeenAt: now,
    sourceCounts: {
      ...(existingCandidate?.sourceCounts || emptySourceCounts()),
      [source]: ((existingCandidate?.sourceCounts || emptySourceCounts())[source] || 0) + 1,
    },
  };
  records[normalizedPlayerId] = record;

  return {
    playerId: normalizedPlayerId,
    previousName: existingCandidate?.displayName,
    nextName: normalizedName,
    status: 'confirmed',
  };
};

export const getTeammateIdentityDisplayName = (
  record: TeammateIdentityRecord | undefined,
): string => {
  if (record?.currentName) return record.currentName;
  const topCandidate = Object.values(record?.candidates || {})
    .sort((left, right) => {
      if (right.weightedScore !== left.weightedScore) {
        return right.weightedScore - left.weightedScore;
      }
      return right.lastSeenAt - left.lastSeenAt;
    })[0];
  return topCandidate?.displayName || '';
};

export const getTeammateIdentityConfidence = (
  record: TeammateIdentityRecord | undefined,
): number => {
  if (!record) return 0;
  const current = getCurrentCandidate(record);
  if (current) return getCandidateNormalizedScore(current.candidate);
  const topCandidate = Object.values(record.candidates || {})
    .sort((left, right) => {
      if (right.weightedScore !== left.weightedScore) {
        return right.weightedScore - left.weightedScore;
      }
      return right.lastSeenAt - left.lastSeenAt;
    })[0];
  return getCandidateNormalizedScore(topCandidate);
};
