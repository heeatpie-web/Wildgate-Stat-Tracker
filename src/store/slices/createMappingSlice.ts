/**
 * @module createMappingSlice
 * Player identity resolution and profiling. Manages:
 * - playerProfiles: sighting history, team/ship observations, social graph
 * - knownMappings: user-defined GUID → display name overrides
 * - detectedUnknowns: unresolved GUIDs discovered from telemetry
 * - ocrCorrectionHistory: learned OCR misread → correct name corrections
 * - AccelByte → Epic ID linking for cross-platform identity resolution
 */
import { StateCreator } from 'zustand';
import Logger from '../../utils/logger';
import { isBogusTertiaryLoadoutEntry } from '../../utils/loadout';
import { measureSyncRuntime } from '../../utils/runtimePerf';
import { normalizeOcrName } from '../../utils/stringUtils';
import type { DetectedUnknownMapping, MappingEntityType, Match } from '../../types';
import { normalizeDetectedUnknownMappings, normalizeSharedUidMappings, normalizeUidMappingName } from '../../services/mappingContract';
import {
    OcrAliasContext,
    OcrAliasModel,
    OcrAliasResolution,
    OcrAliasSource,
    OcrLearningReviewMode,
    OcrLearningDecisionReason,
    OcrLearningEvent,
    OcrLearningEventStatus,
    OcrLearningQueueItem,
    createEmptyOcrAliasModel,
    createLearningEvent,
    recordAliasCorrection,
    resolveAliasFromModel,
    compactAliasModel,
    removeAliasCorrection,
    setAliasBlockStatus,
    toLearningQueueItem,
} from '../../utils/ocrAliasEngine';
import {
    buildPlayerEncounterRoleCorrectionKey,
    normalizeEncounterPlayerKey,
    type EncounterRoleCorrection,
} from '../../utils/playerEncounterRoles';
import {
    buildTeammateIdentityObservation,
    confirmTeammateIdentityRecord,
    type ObservedTeammateName,
    type TeammateIdentityPromotion,
    type TeammateIdentityRecord,
    type TeammateIdentitySource,
    normalizeTeammatePlayerId,
} from '../../utils/teammateIdentity';

export type PlayerRole = 'teammate' | 'opponent' | 'mixed' | 'unknown';

export interface PlayerProfile {
    id: string;
    name?: string;                              // User-assigned name
    sightings: number;                          // Times seen in matches
    firstSeen: number;                          // Timestamp
    lastSeen: number;                           // Timestamp
    teamsObserved: Record<string, number>;      // TeamColor -> count
    playedWith: Record<string, number>;         // PlayerID -> games together (same team)
    playedAgainst: Record<string, number>;      // PlayerID -> games against (different team)
    shipsObserved: Record<string, number>;      // ShipType -> count
    // Phase 2.4: OCR source tracking
    ocrSightings: number;                       // Times detected via OCR scan
    manualSightings: number;                    // Times added manually or via match submit
    lastOcrConfidence?: number;                 // Most recent OCR confidence for this player
}

export interface OcrCorrection {
    ocrText: string;      // What OCR detected
    correctedTo: string;  // What user linked it to
    timestamp: number;
    count: number;        // How many times this correction was made
    source?: OcrAliasSource;
    confidenceWeight?: number;
    contexts?: Record<OcrAliasContext, number>;
}

export interface OcrLearningDecisionInput {
    rawText: string;
    suggestedName?: string | null;
    appliedName?: string | null;
    score?: number;
    margin?: number;
    count?: number;
    source?: OcrAliasSource;
    context?: OcrAliasContext;
    reason?: OcrLearningDecisionReason;
    status?: OcrLearningEventStatus;
    explanation?: string[];
}

export interface TeamIdentityCorrection {
    rawTeamName: string;
    rawColor: string;
    correctedTeamName: string;
    correctedColor: string;
    updatedAt: number;
    count: number;
    source?: OcrAliasSource;
    contexts?: Record<OcrAliasContext, number>;
}

export interface TeamIdentityResolution {
    teamName: string;
    color: string;
    matched: boolean;
}

export interface PlayerEncounterRoleCorrection {
    matchId: number;
    playerKey: string;
    playerName: string;
    role: EncounterRoleCorrection;
    updatedAt: number;
}

export type UidMappings = ReturnType<typeof normalizeSharedUidMappings>;

export interface MappingSlice {
    // Player profiles with relationship tracking
    playerProfiles: Record<string, PlayerProfile>;
    teammateIdentityRecords: Record<string, TeammateIdentityRecord>;

    // Legacy mappings (for backwards compatibility)
    knownMappings: Record<string, string>;      // ID -> Name
    detectedUnknowns: Record<string, DetectedUnknownMapping>;
    uidMappings: UidMappings;
    uidSeedVersionApplied: number | null;

    // OCR correction history for learning
    ocrCorrections: Record<string, OcrCorrection>;
    ocrAliasModel: OcrAliasModel;
    ocrLearningEvents: OcrLearningEvent[];
    ocrLearningQueue: OcrLearningQueueItem[];
    teamIdentityCorrections: Record<string, TeamIdentityCorrection>;
    playerEncounterRoleCorrections: Record<string, PlayerEncounterRoleCorrection>;

    // Profile management
    recordPlayerSighting: (playerId: string, teamColor: string, allTeamPlayers: string[], allOpponentPlayers: string[], shipType?: string, source?: 'ocr' | 'manual', ocrOnly?: boolean) => void;
    setPlayerName: (playerId: string, name: string) => void;
    recordTeammateIdentityObservation: (input: {
        friendlyPlayerIds: string[];
        observedNames: ObservedTeammateName[];
        activeUser?: string | null;
        pilotRegistry?: string[];
        matchId?: number | null;
    }) => { assignments: Record<string, string>; promotions: TeammateIdentityPromotion[] };
    confirmTeammateIdentity: (playerId: string, name: string, opts?: {
        source?: TeammateIdentitySource;
        lockedByUser?: boolean;
        matchId?: number | null;
    }) => TeammateIdentityPromotion | null;
    getPlayerRole: (playerId: string) => PlayerRole;
    getMostFrequentOpponents: (limit?: number) => PlayerProfile[];
    getMostFrequentTeammates: (limit?: number) => PlayerProfile[];

    // OCR correction
    recordOcrCorrection: (ocrText: string, correctedTo: string) => void;
    recordOcrAliasCorrection: (ocrText: string, correctedTo: string, opts?: {
        context?: OcrAliasContext;
        source?: OcrAliasSource;
        confidenceWeight?: number;
        decisionId?: string;
    }) => void;
    removeOcrAliasCorrection: (ocrText: string, correctedTo: string) => boolean;
    getOcrCorrection: (ocrText: string) => OcrCorrection | undefined;
    resolveOcrAlias: (ocrText: string, opts?: {
        context?: OcrAliasContext;
        minScore?: number;
        minCount?: number;
        strictMode?: boolean;
        reviewMode?: OcrLearningReviewMode;
        autoPromoteCount?: number;
    }) => OcrAliasResolution;
    compactOcrAliasModel: () => void;
    blockOcrAlias: (ocrText: string, reason?: string) => void;
    unblockOcrAlias: (ocrText: string) => void;
    logOcrLearningDecision: (input: OcrLearningDecisionInput) => OcrLearningEvent | null;
    enqueueOcrLearningReview: (input: OcrLearningDecisionInput, opts?: { dedupe?: boolean }) => OcrLearningQueueItem | null;
    approveOcrLearningEvent: (eventId: string) => OcrLearningEvent | null;
    rejectOcrLearningEvent: (eventId: string, reason?: string) => OcrLearningEvent | null;
    rollbackOcrLearningEvent: (eventId: string, note?: string) => OcrLearningEvent | null;
    clearResolvedOcrLearningEvents: (olderThanMs?: number) => void;
    recordTeamIdentityCorrection: (
        rawTeamName: string,
        correctedTeamName: string,
        opts?: {
            rawColor?: string;
            correctedColor?: string;
            context?: OcrAliasContext;
            source?: OcrAliasSource;
        }
    ) => void;
    resolveTeamIdentity: (teamName: string, color?: string) => TeamIdentityResolution;
    recordPlayerEncounterRoleCorrection: (
        matchId: number,
        playerName: string,
        role: EncounterRoleCorrection
    ) => void;
    getPlayerEncounterRoleCorrection: (matchId: number, playerName: string) => EncounterRoleCorrection | null;

    // Legacy actions
    addMapping: (id: string, name: string) => void;
    removeMapping: (id: string) => void;
    registerUnknownId: (id: string, type: MappingEntityType) => void;
    importMappings: (mappings: Record<string, string>) => void;
    clearUnknowns: () => void;
    setUidMapping: (domain: keyof UidMappings, id: string, name: string) => void;
    removeUidMapping: (domain: keyof UidMappings, id: string) => void;
    importUidMappings: (mappings: Partial<UidMappings>) => void;
    setUidSeedVersionApplied: (version: number | null) => void;
}

type MappingState = MappingSlice & { playerIdMap?: Record<string, string> };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const createEmptyProfile = (id: string): PlayerProfile => ({
    id,
    sightings: 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    teamsObserved: {},
    playedWith: {},
    playedAgainst: {},
    shipsObserved: {},
    ocrSightings: 0,
    manualSightings: 0
});

const calculateRole = (profile: PlayerProfile): PlayerRole => {
    const withCount = Object.values(profile.playedWith).reduce((a, b) => a + b, 0);
    const againstCount = Object.values(profile.playedAgainst).reduce((a, b) => a + b, 0);

    if (withCount === 0 && againstCount === 0) return 'unknown';

    const ratio = withCount / (withCount + againstCount);
    if (ratio >= 0.7) return 'teammate';
    if (ratio <= 0.3) return 'opponent';
    return 'mixed';
};

const capLearningEvents = (events: OcrLearningEvent[]) => {
    if (events.length <= 500) return events;
    const queuedOrRecent = events.filter((e) =>
        e.status === 'queued' ||
        e.status === 'rolled_back' ||
        (Date.now() - e.timestamp) < (7 * 24 * 60 * 60 * 1000)
    );
    const remainder = events
        .filter((e) => !queuedOrRecent.some((k) => k.id === e.id))
        .sort((a, b) => b.timestamp - a.timestamp);
    return [...queuedOrRecent, ...remainder].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
};

const decrementLegacyCorrection = (
    map: Record<string, OcrCorrection>,
    key: string,
    target: string
): Record<string, OcrCorrection> => {
    const current = map[key];
    if (!current) return map;
    if (normalizeOcrName(current.correctedTo) !== normalizeOcrName(target)) return map;
    if (current.count <= 1) {
        const { [key]: _removed, ...rest } = map;
        return rest;
    }
    return {
        ...map,
        [key]: {
            ...current,
            count: Math.max(0, current.count - 1),
            timestamp: Date.now(),
        },
    };
};

const removeLegacyCorrection = (
    map: Record<string, OcrCorrection>,
    key: string,
    target: string
): Record<string, OcrCorrection> => {
    const current = map[key];
    if (!current) return map;
    if (normalizeOcrName(current.correctedTo) !== normalizeOcrName(target)) return map;
    const { [key]: _removed, ...rest } = map;
    return rest;
};

const sanitizeImportedUidDomain = (
    entries: Record<string, string> | undefined,
    stripBogusTertiary = false,
): Record<string, string> => Object.fromEntries(
    Object.entries(entries || {}).filter(([, name]) => !stripBogusTertiary || !isBogusTertiaryLoadoutEntry(name))
);

const normalizeTeamIdentityName = (value: string): string =>
    normalizeOcrName(value || '').toLowerCase();

const normalizeTeamIdentityColor = (value: string | null | undefined): string => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'unknown';
};

const buildTeamIdentityKey = (teamName: string, color?: string): string => {
    const normalizedName = normalizeTeamIdentityName(teamName);
    if (!normalizedName) return '';
    return `${normalizedName}|${normalizeTeamIdentityColor(color)}`;
};

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

const buildIdAliases = (value: unknown): string[] => {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const canonical = normalizeGuidLikeId(raw);
    return Array.from(new Set(
        [raw, raw.toLowerCase(), raw.toUpperCase(), canonical, canonical.toLowerCase(), canonical.toUpperCase()]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    ));
};

const normalizeMatchNameKey = (value: string | null | undefined): string =>
    normalizeOcrName(value || '').toLowerCase();

const idsEquivalent = (left: unknown, right: unknown): boolean => {
    const leftAliases = buildIdAliases(left);
    const rightAliases = new Set(buildIdAliases(right));
    if (leftAliases.length === 0 || rightAliases.size === 0) return false;
    return leftAliases.some((alias) => rightAliases.has(alias));
};

export const resolvePlayerProfileDisplayName = (
    profileId: string,
    profile: Pick<PlayerProfile, 'id' | 'name'> | undefined,
    knownMappings?: Record<string, string>
): string | null => {
    const explicitName = String(profile?.name || '').trim();
    if (explicitName) return explicitName;

    const candidateIds = buildIdAliases(profile?.id || profileId);
    for (const candidateId of candidateIds) {
        const mappedName = String(knownMappings?.[candidateId] || '').trim();
        if (mappedName) return mappedName;
    }

    const fallbackId = String(profile?.id || profileId || '').trim();
    if (!fallbackId) return null;
    const normalizedGuidLikeId = normalizeGuidLikeId(fallbackId);
    if (GUID_HEX_PATTERN.test(normalizedGuidLikeId)) return null;
    return fallbackId;
};

const findMappedPlayerName = (
    state: MappingState,
    playerId: string,
): string => {
    const candidateIds = buildIdAliases(playerId);
    for (const candidateId of candidateIds) {
        const mappedName = String(
            state.knownMappings?.[candidateId]
            || state.uidMappings.players?.[candidateId]
            || ((state as { playerIdMap?: Record<string, string> }).playerIdMap || {})[candidateId]
            || ''
        ).trim();
        if (mappedName) return normalizeOcrName(mappedName);
    }
    return '';
};

interface PlayerProfileLookupIndex {
    profileKeysByAliasId: Record<string, string>;
    profileKeysByDisplayName: Record<string, string>;
}

const playerProfileLookupIndexCache = new WeakMap<
    Record<string, PlayerProfile>,
    WeakMap<Record<string, string>, PlayerProfileLookupIndex>
>();

const buildPlayerProfileLookupIndex = (state: MappingState): PlayerProfileLookupIndex => {
    const profileKeysByAliasId: Record<string, string> = Object.create(null);
    const profileKeysByDisplayName: Record<string, string> = Object.create(null);

    Object.entries(state.playerProfiles || {}).forEach(([profileId, profile]) => {
        buildIdAliases(profileId).forEach((alias) => {
            if (!profileKeysByAliasId[alias]) {
                profileKeysByAliasId[alias] = profileId;
            }
        });

        const resolvedDisplayName = resolvePlayerProfileDisplayName(profileId, profile, state.knownMappings)
            || normalizeOcrName(profile?.name || '')
            || String(profileId || '').trim();
        const displayKey = normalizeMatchNameKey(resolvedDisplayName);
        if (displayKey && !profileKeysByDisplayName[displayKey]) {
            profileKeysByDisplayName[displayKey] = profileId;
        }
    });

    return {
        profileKeysByAliasId,
        profileKeysByDisplayName,
    };
};

const getPlayerProfileLookupIndex = (state: MappingState): PlayerProfileLookupIndex => {
    const playerProfiles = state.playerProfiles || {};
    const knownMappings = state.knownMappings || {};
    const cachedByMappings = playerProfileLookupIndexCache.get(playerProfiles);
    const cachedIndex = cachedByMappings?.get(knownMappings);
    if (cachedIndex) return cachedIndex;

    const builtIndex = buildPlayerProfileLookupIndex(state);
    const mappingCache = cachedByMappings || new WeakMap<Record<string, string>, PlayerProfileLookupIndex>();
    mappingCache.set(knownMappings, builtIndex);
    if (!cachedByMappings) {
        playerProfileLookupIndexCache.set(playerProfiles, mappingCache);
    }
    return builtIndex;
};

const findProfileEntryByDisplayName = (
    state: MappingState,
    displayName: string,
    lookupIndex?: PlayerProfileLookupIndex,
): [string, PlayerProfile] | null => {
    const displayKey = normalizeMatchNameKey(displayName);
    if (!displayKey) return null;
    const profileKey = (lookupIndex || getPlayerProfileLookupIndex(state)).profileKeysByDisplayName[displayKey];
    if (!profileKey) return null;
    const profile = state.playerProfiles[profileKey];
    return profile ? [profileKey, profile] : null;
};

const findProfileKeyByEquivalentId = (
    state: MappingState,
    playerId: string,
    lookupIndex?: PlayerProfileLookupIndex,
): string | null => {
    const aliases = buildIdAliases(playerId);
    if (aliases.length === 0) return null;

    for (const alias of aliases) {
        if (state.playerProfiles[alias]) return alias;
    }

    const indexedAliases = (lookupIndex || getPlayerProfileLookupIndex(state)).profileKeysByAliasId;
    for (const alias of aliases) {
        const indexedProfileKey = indexedAliases[alias];
        if (indexedProfileKey) return indexedProfileKey;
    }

    return null;
};

const resolvePlayerProfileKey = (
    state: MappingState,
    playerId: string,
    preferredDisplayName?: string,
    lookupIndex?: PlayerProfileLookupIndex,
): { profileKey: string; displayName: string } => {
    const rawId = String(playerId || '').trim();
    const normalizedId = normalizeTeammatePlayerId(rawId);
    const explicitDisplayName = normalizeOcrName(preferredDisplayName || '');
    const mappedDisplayName = explicitDisplayName || findMappedPlayerName(state, rawId);
    const displayName = mappedDisplayName || normalizeOcrName(rawId) || rawId;
    const rawIdKey = normalizeMatchNameKey(rawId);
    const displayNameKey = normalizeMatchNameKey(displayName);
    const prefersStableId = Boolean(normalizedId) && (
        GUID_HEX_PATTERN.test(normalizedId)
        || (!!displayNameKey && displayNameKey !== rawIdKey)
    );

    if (normalizedId && state.playerProfiles[normalizedId]) {
        return {
            profileKey: normalizedId,
            displayName,
        };
    }

    const existingIdKey = findProfileKeyByEquivalentId(state, rawId, lookupIndex);
    if (existingIdKey) {
        return {
            profileKey: existingIdKey,
            displayName,
        };
    }

    const existingNameEntry = findProfileEntryByDisplayName(state, displayName, lookupIndex);
    if (existingNameEntry) {
        const [profileKey, profile] = existingNameEntry;
        return {
            profileKey,
            displayName: normalizeOcrName(
                resolvePlayerProfileDisplayName(profileKey, profile, state.knownMappings)
                || profile?.name
                || displayName
            ) || displayName,
        };
    }

    if (prefersStableId) {
        return {
            profileKey: normalizedId,
            displayName,
        };
    }

    return {
        profileKey: displayName || rawId,
        displayName,
    };
};

const dedupeFriendlyNames = (values: string[]): string[] => {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
        const cleaned = String(value || '').trim();
        const key = normalizeMatchNameKey(cleaned);
        if (!cleaned || !key || seen.has(key)) return;
        seen.add(key);
        next.push(cleaned);
    });
    return next;
};

const applyResolvedPlayerLayers = (
    state: MappingSlice & { playerIdMap?: Record<string, string> },
    playerId: string,
    name: string,
): Partial<MappingSlice> & { playerIdMap?: Record<string, string> } => {
    const normalizedId = normalizeTeammatePlayerId(playerId);
    const trimmedName = String(name || '').trim();
    if (!normalizedId || !trimmedName) return {};
    const { profileKey } = resolvePlayerProfileKey(state, normalizedId, trimmedName);
    const existingProfile = state.playerProfiles[profileKey] || createEmptyProfile(profileKey);
    return {
        knownMappings: { ...state.knownMappings, [normalizedId]: trimmedName },
        uidMappings: {
            ...state.uidMappings,
            players: { ...state.uidMappings.players, [normalizedId]: trimmedName }
        },
        playerProfiles: {
            ...state.playerProfiles,
            [profileKey]: { ...existingProfile, id: profileKey, name: trimmedName }
        },
        playerIdMap: {
            ...((state as { playerIdMap?: Record<string, string> }).playerIdMap || {}),
            [normalizedId]: trimmedName,
        },
        detectedUnknowns: Object.fromEntries(
            Object.entries(state.detectedUnknowns || {}).filter(([key]) => !idsEquivalent(key, normalizedId))
        ),
    };
};

const clearResolvedPlayerLayers = (
    state: MappingSlice & { playerIdMap?: Record<string, string> },
    playerId: string,
): Partial<MappingSlice> & { playerIdMap?: Record<string, string> } => {
    const normalizedId = normalizeTeammatePlayerId(playerId);
    if (!normalizedId) return {};
    return {
        knownMappings: Object.fromEntries(
            Object.entries(state.knownMappings || {}).filter(([key]) => !idsEquivalent(key, normalizedId))
        ),
        uidMappings: {
            ...state.uidMappings,
            players: Object.fromEntries(
                Object.entries(state.uidMappings.players || {}).filter(([key]) => !idsEquivalent(key, normalizedId))
            ),
        },
        playerIdMap: Object.fromEntries(
            Object.entries(((state as { playerIdMap?: Record<string, string> }).playerIdMap || {}))
                .filter(([key]) => !idsEquivalent(key, normalizedId))
        ),
    };
};

const clearNonPlayerIdentityResidue = (
    state: MappingSlice & { playerIdMap?: Record<string, string> },
    id: string,
    nextUidMappings?: UidMappings,
): Partial<MappingSlice> & { playerIdMap?: Record<string, string> } => ({
    ...clearResolvedPlayerLayers(
        {
            ...state,
            uidMappings: nextUidMappings || state.uidMappings,
        } as MappingSlice & { playerIdMap?: Record<string, string> },
        id,
    ),
    playerProfiles: Object.fromEntries(
        Object.entries(state.playerProfiles || {}).filter(([key]) => !idsEquivalent(key, id))
    ),
    teammateIdentityRecords: Object.fromEntries(
        Object.entries(state.teammateIdentityRecords || {}).filter(([key]) => !idsEquivalent(key, id))
    ),
});

const rewriteFriendlyIdentityAssignmentsInMatches = (
    matches: Match[] | undefined,
    playerId: string,
    displayName: string,
): Match[] | undefined => {
    if (!Array.isArray(matches) || matches.length === 0) return matches;
    const normalizedId = normalizeTeammatePlayerId(playerId);
    const replacement = String(displayName || '').trim();
    if (!normalizedId || !replacement) return matches;
    return matches.map((match) => {
        const storedAssignments = match?.friendlyIdentityAssignments || {};
        const assignedName = storedAssignments[normalizedId];
        if (!assignedName) return match;
        const assignedKey = normalizeMatchNameKey(assignedName);
        const replacementKey = normalizeMatchNameKey(replacement);
        const nextTeammates = dedupeFriendlyNames((match.teammates || []).map((name) => (
            normalizeMatchNameKey(name) === assignedKey ? replacement : name
        )));
        const nextAssignments = {
            ...storedAssignments,
            [normalizedId]: replacement,
        };
        const teammatesChanged = nextTeammates.length !== (match.teammates || []).length
            || nextTeammates.some((name, index) => name !== (match.teammates || [])[index]);
        if (!teammatesChanged && assignedKey === replacementKey) {
            return {
                ...match,
                friendlyIdentityAssignments: nextAssignments,
            };
        }
        return {
            ...match,
            teammates: nextTeammates,
            friendlyIdentityAssignments: nextAssignments,
        };
    });
};

const releaseTeammateIdentityRecord = (
    record: TeammateIdentityRecord | undefined,
): TeammateIdentityRecord | undefined => {
    if (!record) return record;
    const candidateCount = Object.keys(record.candidates || {}).length;
    return {
        ...record,
        status: candidateCount > 1 ? 'conflicted' : 'learning',
        currentName: undefined,
        lockedByUser: false,
        autoLinkedAt: undefined,
    };
};

const emptyTeamIdentityContexts = (): Record<OcrAliasContext, number> => ({
    lobby: 0,
    tactical: 0,
    social: 0,
    matchstats: 0,
    unknown: 0,
});

// ============================================================================
// SLICE
// ============================================================================

export const createMappingSlice: StateCreator<MappingSlice> = (set, get) => ({
    playerProfiles: {},
    teammateIdentityRecords: {},
    knownMappings: {},
    detectedUnknowns: normalizeDetectedUnknownMappings(),
    uidMappings: normalizeSharedUidMappings(),
    uidSeedVersionApplied: null,
    ocrCorrections: {},
    ocrAliasModel: createEmptyOcrAliasModel(),
    ocrLearningEvents: [],
    ocrLearningQueue: [],
    teamIdentityCorrections: {},
    playerEncounterRoleCorrections: {},

    recordPlayerSighting: (playerId, teamColor, allTeamPlayers, allOpponentPlayers, shipType, source = 'manual', ocrOnly = false) => {
        set((state) => measureSyncRuntime('MappingSlice', 'recordPlayerSighting', () => {
            const mappingState = state as MappingState;
            const lookupIndex = getPlayerProfileLookupIndex(mappingState);
            const resolvedProfileKeys = new Map<string, string>();
            const resolveEncounterProfileKey = (candidateId: string): string => {
                const rawCandidateId = String(candidateId || '').trim();
                if (!rawCandidateId) return '';
                const cacheKey = normalizeTeammatePlayerId(rawCandidateId) || rawCandidateId;
                const cachedProfileKey = resolvedProfileKeys.get(cacheKey);
                if (cachedProfileKey) return cachedProfileKey;

                const nextProfileKey = resolvePlayerProfileKey(
                    mappingState,
                    rawCandidateId,
                    undefined,
                    lookupIndex,
                ).profileKey;
                if (nextProfileKey) {
                    resolvedProfileKeys.set(cacheKey, nextProfileKey);
                }
                return nextProfileKey;
            };

            const profileKey = resolveEncounterProfileKey(playerId);
            if (!profileKey) return {};
            const existing = state.playerProfiles[profileKey] || createEmptyProfile(profileKey);
            const now = Date.now();

            // When ocrOnly=true (mid-match OCR scans) only track detection frequency,
            // not encounter/relationship data — those are recorded once at match submission.
            const teamsObserved = { ...existing.teamsObserved };
            const shipsObserved = { ...existing.shipsObserved };
            const playedWith = { ...existing.playedWith };
            const playedAgainst = { ...existing.playedAgainst };

            if (!ocrOnly) {
                // Update team observations
                if (teamColor && teamColor !== 'Unknown' && teamColor !== 'unknown') {
                    teamsObserved[teamColor] = (teamsObserved[teamColor] || 0) + 1;
                }

                // Update ship observations
                if (shipType) {
                    shipsObserved[shipType] = (shipsObserved[shipType] || 0) + 1;
                }

                // Update playedWith (teammates)
                allTeamPlayers.forEach((id) => {
                    const teammateKey = resolveEncounterProfileKey(id);
                    if (teammateKey && teammateKey !== profileKey) {
                        playedWith[teammateKey] = (playedWith[teammateKey] || 0) + 1;
                    }
                });

                // Update playedAgainst (opponents)
                allOpponentPlayers.forEach((id) => {
                    const opponentKey = resolveEncounterProfileKey(id);
                    if (opponentKey) {
                        playedAgainst[opponentKey] = (playedAgainst[opponentKey] || 0) + 1;
                    }
                });
            }

            // Track source of sighting (OCR vs manual)
            const ocrSightings = source === 'ocr' ? (existing.ocrSightings || 0) + 1 : (existing.ocrSightings || 0);
            const manualSightings = source === 'manual' ? (existing.manualSightings || 0) + 1 : (existing.manualSightings || 0);

            const updated: PlayerProfile = {
                ...existing,
                // ocrOnly=true: only track detection frequency, not encounter count
                sightings: ocrOnly ? existing.sightings : existing.sightings + 1,
                lastSeen: now,
                teamsObserved,
                playedWith,
                playedAgainst,
                shipsObserved,
                ocrSightings,
                manualSightings
            };

            Logger.debug('MappingSlice', `Recorded sighting for ${playerId} -> ${profileKey} (source: ${source})`, {
                sightings: updated.sightings,
                ocrSightings: updated.ocrSightings,
                manualSightings: updated.manualSightings,
                teammates: Object.keys(playedWith).length,
                opponents: Object.keys(playedAgainst).length
            });

            return {
                playerProfiles: { ...state.playerProfiles, [profileKey]: updated }
            };
        }, {
            logEvery: 100,
            sampleSize: 256,
        }));
    },

    setPlayerName: (playerId, name) => {
        set((state) => {
            const normalizedId = normalizeTeammatePlayerId(playerId);
            const resolvedId = normalizedId || String(playerId || '').trim();
            if (!resolvedId || !String(name || '').trim()) return {};
            const { profileKey } = resolvePlayerProfileKey(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                resolvedId,
                name,
            );
            const existing = state.playerProfiles[profileKey] || createEmptyProfile(profileKey);
            const nextRecords = { ...(state.teammateIdentityRecords || {}) };
            if (resolvedId) {
                confirmTeammateIdentityRecord(nextRecords, resolvedId, name, {
                    source: 'manual',
                    lockedByUser: true,
                });
            }
            Logger.info('MappingSlice', `Set name for ${playerId}: ${name}`);

            const layerUpdates = applyResolvedPlayerLayers(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                resolvedId,
                name,
            );
            const layerProfiles = (layerUpdates.playerProfiles as Record<string, PlayerProfile> | undefined)
                || state.playerProfiles;

            return {
                ...layerUpdates,
                playerProfiles: {
                    ...layerProfiles,
                    [profileKey]: {
                        ...(layerProfiles[profileKey] || existing),
                        id: profileKey,
                        name,
                    },
                },
                teammateIdentityRecords: nextRecords,
            };
        });
    },

    recordTeammateIdentityObservation: ({ friendlyPlayerIds, observedNames, activeUser, pilotRegistry, matchId }) => {
        let outcome: { assignments: Record<string, string>; promotions: TeammateIdentityPromotion[] } = {
            assignments: {},
            promotions: [],
        };
        set((state) => {
            const nextRecords = { ...(state.teammateIdentityRecords || {}) };
            outcome = buildTeammateIdentityObservation(nextRecords, {
                friendlyPlayerIds,
                observedNames,
                activeUser,
                knownMappings: state.knownMappings,
                playerIdMap: ((state as MappingSlice & { playerIdMap?: Record<string, string> }).playerIdMap || {}),
                playerProfiles: state.playerProfiles,
                pilotRegistry,
            });

            const layerUpdates = outcome.promotions.reduce<Partial<MappingSlice> & { playerIdMap?: Record<string, string>; matches?: Match[] }>((acc, promotion) => {
                const nextLayers = applyResolvedPlayerLayers(
                    {
                        ...(state as MappingSlice & { playerIdMap?: Record<string, string>; matches?: Match[] }),
                        knownMappings: acc.knownMappings || state.knownMappings,
                        uidMappings: acc.uidMappings || state.uidMappings,
                        playerProfiles: acc.playerProfiles || state.playerProfiles,
                        detectedUnknowns: acc.detectedUnknowns || state.detectedUnknowns,
                        playerIdMap: acc.playerIdMap || ((state as MappingSlice & { playerIdMap?: Record<string, string> }).playerIdMap || {}),
                    } as MappingSlice & { playerIdMap?: Record<string, string>; matches?: Match[] },
                    promotion.playerId,
                    promotion.nextName,
                );
                return {
                    ...acc,
                    ...nextLayers,
                    matches: rewriteFriendlyIdentityAssignmentsInMatches(
                        acc.matches || ((state as MappingSlice & { matches?: Match[] }).matches || []),
                        promotion.playerId,
                        promotion.nextName,
                    ),
                };
            }, {});

            return {
                teammateIdentityRecords: nextRecords,
                ...(layerUpdates as Partial<MappingSlice>),
                ...(('matches' in layerUpdates)
                    ? { matches: layerUpdates.matches }
                    : {}),
            } as Partial<MappingSlice> & { matches?: Match[]; playerIdMap?: Record<string, string> };
        });
        if (Object.keys(outcome.assignments).length > 0) {
            Logger.info('MappingSlice', 'Recorded teammate identity observation', {
                matchId: Number.isInteger(Number(matchId)) ? Number(matchId) : undefined,
                assignmentCount: Object.keys(outcome.assignments).length,
                promotionCount: outcome.promotions.length,
            });
        }
        return outcome;
    },

    confirmTeammateIdentity: (playerId, name, opts = {}) => {
        const normalizedId = normalizeTeammatePlayerId(playerId);
        if (!normalizedId || !String(name || '').trim()) return null;
        let promotion: TeammateIdentityPromotion | null = null;
        set((state) => {
            const nextRecords = { ...(state.teammateIdentityRecords || {}) };
            promotion = confirmTeammateIdentityRecord(nextRecords, normalizedId, name, {
                source: opts.source || 'telemetry_direct',
                lockedByUser: opts.lockedByUser,
            });
            const layerUpdates = applyResolvedPlayerLayers(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                normalizedId,
                name,
            );
            return {
                teammateIdentityRecords: nextRecords,
                ...(layerUpdates as Partial<MappingSlice>),
                ...(((state as MappingSlice & { matches?: Match[] }).matches)
                    ? {
                        matches: rewriteFriendlyIdentityAssignmentsInMatches(
                            (state as MappingSlice & { matches?: Match[] }).matches,
                            normalizedId,
                            name,
                        ),
                    }
                    : {}),
            } as Partial<MappingSlice> & { matches?: Match[]; playerIdMap?: Record<string, string> };
        });
        if (promotion) {
            Logger.info('MappingSlice', `Confirmed teammate identity ${normalizedId} -> ${name}`, {
                source: opts.source || 'telemetry_direct',
                matchId: opts.matchId,
            });
        }
        return promotion;
    },

    recordOcrAliasCorrection: (ocrText, correctedTo, opts = {}) => {
        const raw = normalizeOcrName(ocrText);
        const target = normalizeOcrName(correctedTo);
        if (!raw || !target) return;

        const context = opts.context || 'unknown';
        const source = opts.source || 'manual_correction';
        const confidenceWeight = Number.isFinite(opts.confidenceWeight as number)
            ? Math.max(0, Math.min(1, Number(opts.confidenceWeight)))
            : 0.6;

        set((state) => {
            const nextAliasModel = recordAliasCorrection(state.ocrAliasModel, {
                ocrText: raw,
                correctedTo: target,
                source,
                context,
                confidenceWeight,
                decisionId: opts.decisionId,
            });

            Logger.info('MappingSlice', `OCR alias recorded: "${raw}" -> "${target}" (source: ${source}, context: ${context})`);
            return {
                ocrAliasModel: nextAliasModel,
            };
        });
    },

    // Compatibility wrapper: preserves old call sites while writing to new alias model.
    recordOcrCorrection: (ocrText, correctedTo) => {
        get().recordOcrAliasCorrection(ocrText, correctedTo, {
            source: 'manual_correction',
            context: 'unknown',
            confidenceWeight: 0.6,
        });
    },

    removeOcrAliasCorrection: (ocrText, correctedTo) => {
        const raw = normalizeOcrName(ocrText);
        const normalizedRaw = raw.toLowerCase();
        const target = normalizeOcrName(correctedTo);
        if (!raw || !target) return false;

        let removed = false;
        set((state) => {
            const entries = state.ocrAliasModel.entries[normalizedRaw] || [];
            const entry = entries.find((candidate) =>
                normalizeOcrName(candidate.targetName).toLowerCase() === target.toLowerCase()
            );
            if (!entry) return {};

            let nextAliasModel = state.ocrAliasModel;
            const removeCount = Math.max(1, Number(entry.count || 1));
            for (let i = 0; i < removeCount; i += 1) {
                nextAliasModel = removeAliasCorrection(nextAliasModel, {
                    ocrText: raw,
                    correctedTo: target,
                });
            }

            let nextLegacy = removeLegacyCorrection(state.ocrCorrections, raw, target);
            if (normalizedRaw && normalizedRaw !== raw) {
                nextLegacy = removeLegacyCorrection(nextLegacy, normalizedRaw, target);
            }

            removed = true;
            return {
                ocrAliasModel: nextAliasModel,
                ocrCorrections: nextLegacy,
            };
        });

        if (removed) {
            Logger.info('MappingSlice', `OCR alias removed: "${raw}" -> "${target}"`);
        }
        return removed;
    },

    getOcrCorrection: (ocrText) => get().ocrCorrections[ocrText],

    resolveOcrAlias: (ocrText, opts = {}) => {
        return resolveAliasFromModel(get().ocrAliasModel, ocrText, opts);
    },

    compactOcrAliasModel: () => {
        set((state) => ({
            ocrAliasModel: compactAliasModel(state.ocrAliasModel),
        }));
    },

    blockOcrAlias: (ocrText, reason = 'manual-block') => {
        set((state) => ({
            ocrAliasModel: setAliasBlockStatus(state.ocrAliasModel, ocrText, true, reason),
        }));
    },

    unblockOcrAlias: (ocrText) => {
        set((state) => ({
            ocrAliasModel: setAliasBlockStatus(state.ocrAliasModel, ocrText, false),
        }));
    },

    logOcrLearningDecision: (input) => {
        const raw = normalizeOcrName(input.rawText || '');
        if (!raw) return null;
        const event = createLearningEvent({
            rawText: raw,
            suggestedName: input.suggestedName || null,
            appliedName: input.appliedName || null,
            score: input.score || 0,
            margin: input.margin || 0,
            count: input.count || 0,
            source: input.source || 'manual_correction',
            context: input.context || 'unknown',
            reason: input.reason || 'auto-applied',
            status: input.status || 'auto_applied',
            explanation: input.explanation || [],
        });
        set((state) => ({
            ocrLearningEvents: capLearningEvents([event, ...(state.ocrLearningEvents || [])]),
        }));
        return event;
    },

    enqueueOcrLearningReview: (input, opts = { dedupe: true }) => {
        let created: OcrLearningQueueItem | null = null;
        set((state) => {
            const raw = normalizeOcrName(input.rawText || '');
            const suggested = normalizeOcrName(input.suggestedName || input.appliedName || '');
            if (!raw || !suggested) return {};
            const normalizedKey = normalizeOcrName(raw).toLowerCase();

            if (opts.dedupe !== false) {
                const dup = (state.ocrLearningQueue || []).find((item) =>
                    item.normalizedKey === normalizedKey &&
                    normalizeOcrName(item.suggestedName) === suggested
                );
                if (dup) {
                    created = dup;
                    return {};
                }
            }

            const event = createLearningEvent({
                rawText: raw,
                suggestedName: suggested,
                appliedName: null,
                score: input.score || 0,
                margin: input.margin || 0,
                count: input.count || 0,
                source: input.source || 'manual_correction',
                context: input.context || 'unknown',
                reason: input.reason || 'auto-resolve-needs-review',
                status: 'queued',
                explanation: input.explanation || [],
            });
            const queueItem = toLearningQueueItem(event);
            if (!queueItem) return {};
            created = queueItem;
            return {
                ocrLearningEvents: capLearningEvents([event, ...(state.ocrLearningEvents || [])]),
                ocrLearningQueue: [queueItem, ...(state.ocrLearningQueue || [])].slice(0, 200),
            };
        });
        return created;
    },

    approveOcrLearningEvent: (eventId) => {
        const event = (get().ocrLearningEvents || []).find((e) => e.id === eventId);
        if (!event) return null;
        const target = normalizeOcrName(event.suggestedName || event.appliedName || '');
        if (!target) return null;

        get().recordOcrAliasCorrection(event.rawText, target, {
            source: 'review_modal',
            context: event.context,
            confidenceWeight: 1,
            decisionId: event.id,
        });

        let approved: OcrLearningEvent | null = null;
        set((state) => {
            const reviewedAt = Date.now();
            const nextEvents = (state.ocrLearningEvents || []).map((item) => {
                if (item.id !== eventId) return item;
                approved = {
                    ...item,
                    status: 'approved',
                    appliedName: target,
                    reason: 'manual-review-approve',
                    reviewedAt,
                };
                return approved;
            });
            return {
                ocrLearningEvents: capLearningEvents(nextEvents),
                ocrLearningQueue: (state.ocrLearningQueue || []).filter((q) => q.eventId !== eventId),
            };
        });
        return approved;
    },

    rejectOcrLearningEvent: (eventId, reason = 'Rejected by user') => {
        let rejected: OcrLearningEvent | null = null;
        set((state) => {
            const reviewedAt = Date.now();
            const nextEvents = (state.ocrLearningEvents || []).map((item) => {
                if (item.id !== eventId) return item;
                rejected = {
                    ...item,
                    status: 'rejected',
                    reason: 'manual-review-reject',
                    reviewedAt,
                    reviewNote: reason,
                    explanation: [...(item.explanation || []), reason],
                };
                return rejected;
            });
            return {
                ocrLearningEvents: capLearningEvents(nextEvents),
                ocrLearningQueue: (state.ocrLearningQueue || []).filter((q) => q.eventId !== eventId),
            };
        });
        return rejected;
    },

    rollbackOcrLearningEvent: (eventId, note = 'Rolled back by user') => {
        const event = (get().ocrLearningEvents || []).find((e) => e.id === eventId);
        if (!event) return null;
        const target = normalizeOcrName(event.appliedName || event.suggestedName || '');
        if (!target) return null;
        const normalizedRaw = normalizeOcrName(event.rawText).toLowerCase();
        const sourceRaw = normalizeOcrName(event.rawText);
        let rollbackEvent: OcrLearningEvent | null = null;

        set((state) => {
            let nextModel = removeAliasCorrection(state.ocrAliasModel, {
                ocrText: sourceRaw,
                correctedTo: target,
            });
            if (event.status === 'auto_applied') {
                nextModel = setAliasBlockStatus(nextModel, sourceRaw, true, 'rollback-auto');
            }

            let nextLegacy = decrementLegacyCorrection(state.ocrCorrections, sourceRaw, target);
            if (normalizedRaw && normalizedRaw !== sourceRaw) {
                nextLegacy = decrementLegacyCorrection(nextLegacy, normalizedRaw, target);
            }

            const reviewedAt = Date.now();
            rollbackEvent = createLearningEvent({
                rawText: event.rawText,
                suggestedName: event.suggestedName,
                appliedName: target,
                score: event.score,
                margin: event.margin,
                count: event.count,
                source: event.source,
                context: event.context,
                reason: 'rollback',
                status: 'rolled_back',
                explanation: [...(event.explanation || []), note],
                reviewNote: note,
                rollbackOfEventId: event.id,
            });
            rollbackEvent.reviewedAt = reviewedAt;

            const nextEvents = (state.ocrLearningEvents || []).map((item) =>
                item.id === event.id
                    ? { ...item, status: 'rolled_back' as const, reviewNote: note, reviewedAt, rolledBackByEventId: rollbackEvent!.id }
                    : item
            );
            return {
                ocrAliasModel: nextModel,
                ocrCorrections: nextLegacy,
                ocrLearningEvents: capLearningEvents([rollbackEvent, ...nextEvents]),
                ocrLearningQueue: (state.ocrLearningQueue || []).filter((q) => q.eventId !== event.id),
            };
        });
        return rollbackEvent;
    },

    clearResolvedOcrLearningEvents: (olderThanMs = 30 * 24 * 60 * 60 * 1000) => {
        set((state) => {
            const cutoff = Date.now() - olderThanMs;
            const keptEvents = (state.ocrLearningEvents || []).filter((event) =>
                event.status === 'queued' || event.timestamp >= cutoff
            );
            const keptIds = new Set(keptEvents.map((e) => e.id));
            const keptQueue = (state.ocrLearningQueue || []).filter((item) => keptIds.has(item.eventId));
            return {
                ocrLearningEvents: keptEvents,
                ocrLearningQueue: keptQueue,
            };
        });
    },

    recordTeamIdentityCorrection: (rawTeamName, correctedTeamName, opts = {}) => {
        const rawName = String(rawTeamName || '').trim();
        const targetName = String(correctedTeamName || '').trim() || rawName;
        const normalizedRawName = normalizeTeamIdentityName(rawName);
        if (!normalizedRawName) return;
        const rawColor = normalizeTeamIdentityColor(opts.rawColor);
        const correctedColor = normalizeTeamIdentityColor(opts.correctedColor || rawColor);
        const key = buildTeamIdentityKey(rawName, rawColor);
        if (!key) return;
        const source = opts.source || 'manual_correction';
        const context = opts.context || 'unknown';

        set((state) => {
            const existing = state.teamIdentityCorrections[key];
            const contexts = {
                ...(existing?.contexts || emptyTeamIdentityContexts()),
                [context]: ((existing?.contexts || emptyTeamIdentityContexts())[context] || 0) + 1,
            };
            return {
                teamIdentityCorrections: {
                    ...state.teamIdentityCorrections,
                    [key]: {
                        rawTeamName: rawName,
                        rawColor,
                        correctedTeamName: targetName,
                        correctedColor,
                        updatedAt: Date.now(),
                        count: (existing?.count || 0) + 1,
                        source,
                        contexts,
                    },
                },
            };
        });
    },

    resolveTeamIdentity: (teamName, color = 'unknown') => {
        const rawName = String(teamName || '').trim();
        const normalizedName = normalizeTeamIdentityName(rawName);
        const normalizedColor = normalizeTeamIdentityColor(color);
        if (!normalizedName) {
            return {
                teamName: rawName,
                color: normalizedColor,
                matched: false,
            };
        }

        const corrections = get().teamIdentityCorrections || {};
        const directKey = buildTeamIdentityKey(rawName, normalizedColor);
        const unknownColorKey = buildTeamIdentityKey(rawName, 'unknown');
        const direct = (directKey && corrections[directKey]) || corrections[unknownColorKey];
        if (direct) {
            return {
                teamName: String(direct.correctedTeamName || rawName).trim() || rawName,
                color: normalizeTeamIdentityColor(direct.correctedColor || normalizedColor),
                matched: true,
            };
        }

        const bestByName = Object.values(corrections)
            .filter((entry) => normalizeTeamIdentityName(entry.rawTeamName) === normalizedName)
            .sort((a, b) => (b.count - a.count) || (b.updatedAt - a.updatedAt))[0];
        if (bestByName) {
            return {
                teamName: String(bestByName.correctedTeamName || rawName).trim() || rawName,
                color: normalizeTeamIdentityColor(bestByName.correctedColor || normalizedColor),
                matched: true,
            };
        }

        return {
            teamName: rawName,
            color: normalizedColor,
            matched: false,
        };
    },

    recordPlayerEncounterRoleCorrection: (matchId, playerName, role) => {
        const correctionKey = buildPlayerEncounterRoleCorrectionKey(matchId, playerName);
        const normalizedPlayerKey = normalizeEncounterPlayerKey(playerName);
        const numericMatchId = Number(matchId);
        const normalizedPlayerName = String(playerName || '').trim();
        if (!correctionKey || !normalizedPlayerKey || !Number.isFinite(numericMatchId)) return;

        set((state) => ({
            playerEncounterRoleCorrections: {
                ...state.playerEncounterRoleCorrections,
                [correctionKey]: {
                    matchId: numericMatchId,
                    playerKey: normalizedPlayerKey,
                    playerName: normalizedPlayerName || normalizedPlayerKey,
                    role,
                    updatedAt: Date.now(),
                },
            },
        }));
    },

    getPlayerEncounterRoleCorrection: (matchId, playerName) => {
        const correctionKey = buildPlayerEncounterRoleCorrectionKey(matchId, playerName);
        if (!correctionKey) return null;
        return get().playerEncounterRoleCorrections[correctionKey]?.role || null;
    },

    getPlayerRole: (playerId) => {
        const profile = get().playerProfiles[playerId];
        if (!profile) return 'unknown';
        return calculateRole(profile);
    },

    getMostFrequentOpponents: (limit = 10) => {
        const profiles = Object.values(get().playerProfiles);
        return profiles
            .map(p => ({
                ...p,
                totalAgainst: Object.values(p.playedAgainst).reduce((a, b) => a + b, 0)
            }))
            .filter(p => p.totalAgainst > 0)
            .sort((a, b) => b.totalAgainst - a.totalAgainst)
            .slice(0, limit);
    },

    getMostFrequentTeammates: (limit = 10) => {
        const profiles = Object.values(get().playerProfiles);
        return profiles
            .map(p => ({
                ...p,
                totalWith: Object.values(p.playedWith).reduce((a, b) => a + b, 0)
            }))
            .filter(p => p.totalWith > 0)
            .sort((a, b) => b.totalWith - a.totalWith)
            .slice(0, limit);
    },

    // Legacy methods for backwards compatibility
    addMapping: (id, name) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        Logger.info('MappingSlice', `Added mapping: ${normalizedId} -> ${name}`);
        const nextRecords = { ...(state.teammateIdentityRecords || {}) };
        confirmTeammateIdentityRecord(nextRecords, normalizedId, name, {
            source: 'manual',
            lockedByUser: true,
        });

        return {
            ...applyResolvedPlayerLayers(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                normalizedId,
                name,
            ),
            teammateIdentityRecords: nextRecords,
        };
    }),

    removeMapping: (id) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        Logger.info('MappingSlice', `Removed mapping: ${id}`);
        const nextRecords = { ...(state.teammateIdentityRecords || {}) };
        if (nextRecords[normalizedId]) {
            const released = releaseTeammateIdentityRecord(nextRecords[normalizedId]);
            if (released) nextRecords[normalizedId] = released;
        }
        return {
            ...clearResolvedPlayerLayers(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                normalizedId,
            ),
            teammateIdentityRecords: nextRecords,
        };
    }),

    registerUnknownId: (id, type) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        const isKnownTeammateId = Object.keys(state.teammateIdentityRecords || {}).some((playerId) => idsEquivalent(playerId, normalizedId));
        if (isKnownTeammateId) return {};
        const aliases = buildIdAliases(normalizedId);
        const hasResolvedMapping = aliases.some((alias) => (
            state.knownMappings[alias]
            || state.uidMappings.players[alias]
            || state.uidMappings.ships[alias]
            || state.uidMappings.weapons[alias]
            || state.uidMappings.equipment[alias]
            || state.uidMappings.perks[alias]
        ));
        if (hasResolvedMapping) return {};

        const existingUnknownEntry = Object.entries(state.detectedUnknowns)
            .find(([unknownId]) => idsEquivalent(unknownId, normalizedId));
        const existingUnknownId = existingUnknownEntry?.[0];

        if (existingUnknownId) {
            return {
                detectedUnknowns: {
                    ...state.detectedUnknowns,
                    [existingUnknownId]: { ...state.detectedUnknowns[existingUnknownId], lastSeen: Date.now() }
                }
            };
        }

        Logger.debug('MappingSlice', `Registered unknown ID: ${normalizedId} (${type})`);
        return {
            detectedUnknowns: {
                ...state.detectedUnknowns,
                [normalizedId]: { type, lastSeen: Date.now() }
            }
        };
    }),

    importMappings: (mappings) => set((state) => {
        Logger.info('MappingSlice', `Imported ${Object.keys(mappings).length} mappings`);

        // Create profiles for imported mappings
        const newProfiles = { ...state.playerProfiles };
        const nextRecords = { ...(state.teammateIdentityRecords || {}) };
        Object.entries(mappings).forEach(([id, name]) => {
            if (!newProfiles[id]) {
                newProfiles[id] = createEmptyProfile(id);
            }
            newProfiles[id].name = name;
            const normalizedId = normalizeTeammatePlayerId(id);
            if (normalizedId && String(name || '').trim()) {
                confirmTeammateIdentityRecord(nextRecords, normalizedId, name, {
                    source: 'manual',
                    lockedByUser: true,
                });
            }
        });

        return {
            knownMappings: { ...state.knownMappings, ...mappings },
            uidMappings: {
                ...state.uidMappings,
                players: { ...state.uidMappings.players, ...mappings }
            },
            playerProfiles: newProfiles,
            teammateIdentityRecords: nextRecords,
            playerIdMap: {
                ...((state as MappingSlice & { playerIdMap?: Record<string, string> }).playerIdMap || {}),
                ...Object.fromEntries(
                    Object.entries(mappings).map(([id, name]) => [normalizeTeammatePlayerId(id), name]).filter(([id, name]) => Boolean(id && name))
                ),
            },
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns || {}).filter(([key]) => !Object.keys(mappings).some((mappingId) => idsEquivalent(mappingId, key)))
            ),
        };
    }),

    clearUnknowns: () => {
        Logger.info('MappingSlice', 'Cleared all unknown IDs');
        set({ detectedUnknowns: {} });
    },

    setUidMapping: (domain, id, name) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        const trimmedName = String(name || '').trim();
        const normalizedName = domain === 'players'
            ? trimmedName
            : normalizeUidMappingName(domain, trimmedName);
        if (!normalizedName) return {};
        if (domain !== 'players' && isBogusTertiaryLoadoutEntry(normalizedName)) {
            const rest = Object.fromEntries(
                Object.entries(state.uidMappings[domain]).filter(([key]) => !idsEquivalent(key, normalizedId))
            );
            return {
                uidMappings: { ...state.uidMappings, [domain]: rest },
                detectedUnknowns: Object.fromEntries(
                    Object.entries(state.detectedUnknowns).filter(([k]) => !idsEquivalent(k, normalizedId))
                )
            } as Partial<MappingSlice>;
        }
        const nextDomain = { ...state.uidMappings[domain], [normalizedId]: normalizedName };
        const nextUidMappings = { ...state.uidMappings, [domain]: nextDomain };
        const base: Partial<MappingSlice> = {
            uidMappings: nextUidMappings,
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns).filter(([k]) => !idsEquivalent(k, normalizedId))
            )
        };
        if (domain === 'players') {
            const nextRecords = { ...(state.teammateIdentityRecords || {}) };
            confirmTeammateIdentityRecord(nextRecords, normalizedId, normalizedName, {
                source: 'manual',
                lockedByUser: true,
            });
            return {
                ...base,
                ...applyResolvedPlayerLayers(
                    state as MappingSlice & { playerIdMap?: Record<string, string> },
                    normalizedId,
                    normalizedName,
                ),
                teammateIdentityRecords: nextRecords,
            };
        }
        return {
            ...base,
            ...clearNonPlayerIdentityResidue(
                state as MappingSlice & { playerIdMap?: Record<string, string> },
                normalizedId,
                nextUidMappings,
            ),
        } as Partial<MappingSlice>;
    }),

    removeUidMapping: (domain, id) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        const rest = Object.fromEntries(
            Object.entries(state.uidMappings[domain]).filter(([key]) => !idsEquivalent(key, normalizedId))
        );
        const next = { ...state.uidMappings, [domain]: rest };
        if (domain === 'players') {
            const nextRecords = { ...(state.teammateIdentityRecords || {}) };
            if (nextRecords[normalizedId]) {
                const released = releaseTeammateIdentityRecord(nextRecords[normalizedId]);
                if (released) nextRecords[normalizedId] = released;
            }
            return {
                uidMappings: next,
                teammateIdentityRecords: nextRecords,
                ...clearResolvedPlayerLayers(
                    {
                        ...(state as MappingSlice & { playerIdMap?: Record<string, string> }),
                        uidMappings: next,
                    } as MappingSlice & { playerIdMap?: Record<string, string> },
                    normalizedId,
                ),
            };
        }
        return { uidMappings: next };
    }),

    importUidMappings: (mappings) => set((state) => {
        const sanitizedWeapons = sanitizeImportedUidDomain(mappings.weapons, true);
        const sanitizedEquipment = sanitizeImportedUidDomain(mappings.equipment, true);
        const merged: UidMappings = normalizeSharedUidMappings({
            players: { ...state.uidMappings.players, ...(mappings.players || {}) },
            ships: { ...state.uidMappings.ships, ...(mappings.ships || {}) },
            weapons: { ...sanitizeImportedUidDomain(state.uidMappings.weapons, true), ...sanitizedWeapons },
            equipment: { ...sanitizeImportedUidDomain(state.uidMappings.equipment, true), ...sanitizedEquipment },
            perks: { ...state.uidMappings.perks, ...(mappings.perks || {}) },
        });
        const nextRecords = { ...(state.teammateIdentityRecords || {}) };
        Object.entries(mappings.players || {}).forEach(([id, name]) => {
            const normalizedId = normalizeTeammatePlayerId(id);
            if (!normalizedId || !String(name || '').trim()) return;
            confirmTeammateIdentityRecord(nextRecords, normalizedId, name, {
                source: 'manual',
                lockedByUser: true,
            });
        });
        return {
            uidMappings: merged,
            knownMappings: { ...state.knownMappings, ...(mappings.players || {}) },
            teammateIdentityRecords: nextRecords,
            playerIdMap: {
                ...((state as MappingSlice & { playerIdMap?: Record<string, string> }).playerIdMap || {}),
                ...Object.fromEntries(
                    Object.entries(mappings.players || {}).map(([id, name]) => [normalizeTeammatePlayerId(id), name]).filter(([id, name]) => Boolean(id && name))
                ),
            },
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns || {}).filter(([key]) => !Object.keys(mappings.players || {}).some((mappingId) => idsEquivalent(mappingId, key)))
            ),
        };
    }),

    setUidSeedVersionApplied: (version) => set({ uidSeedVersionApplied: version })
});
