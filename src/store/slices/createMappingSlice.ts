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
import { normalizeOcrName } from '../../utils/stringUtils';
import type { DetectedUnknownMapping, MappingEntityType } from '../../types';
import { normalizeDetectedUnknownMappings, normalizeSharedUidMappings } from '../../services/mappingContract';
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

export type UidMappings = ReturnType<typeof normalizeSharedUidMappings>;

export interface MappingSlice {
    // Player profiles with relationship tracking
    playerProfiles: Record<string, PlayerProfile>;

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

    // Profile management
    recordPlayerSighting: (playerId: string, teamColor: string, allTeamPlayers: string[], allOpponentPlayers: string[], shipType?: string, source?: 'ocr' | 'manual', ocrOnly?: boolean) => void;
    setPlayerName: (playerId: string, name: string) => void;
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
    knownMappings: {},
    detectedUnknowns: normalizeDetectedUnknownMappings(),
    uidMappings: normalizeSharedUidMappings(),
    uidSeedVersionApplied: null,
    ocrCorrections: {},
    ocrAliasModel: createEmptyOcrAliasModel(),
    ocrLearningEvents: [],
    ocrLearningQueue: [],
    teamIdentityCorrections: {},

    recordPlayerSighting: (playerId, teamColor, allTeamPlayers, allOpponentPlayers, shipType, source = 'manual', ocrOnly = false) => {
        set((state) => {
            const existing = state.playerProfiles[playerId] || createEmptyProfile(playerId);
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
                allTeamPlayers.forEach(id => {
                    if (id !== playerId) {
                        playedWith[id] = (playedWith[id] || 0) + 1;
                    }
                });

                // Update playedAgainst (opponents)
                allOpponentPlayers.forEach(id => {
                    playedAgainst[id] = (playedAgainst[id] || 0) + 1;
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

            Logger.debug('MappingSlice', `Recorded sighting for ${playerId} (source: ${source})`, {
                sightings: updated.sightings,
                ocrSightings: updated.ocrSightings,
                manualSightings: updated.manualSightings,
                teammates: Object.keys(playedWith).length,
                opponents: Object.keys(playedAgainst).length
            });

            return {
                playerProfiles: { ...state.playerProfiles, [playerId]: updated }
            };
        });
    },

    setPlayerName: (playerId, name) => {
        set((state) => {
            const existing = state.playerProfiles[playerId] || createEmptyProfile(playerId);
            Logger.info('MappingSlice', `Set name for ${playerId}: ${name}`);

            return {
                playerProfiles: {
                    ...state.playerProfiles,
                    [playerId]: { ...existing, name }
                },
                knownMappings: { ...state.knownMappings, [playerId]: name },
                uidMappings: {
                    ...state.uidMappings,
                    players: {
                        ...state.uidMappings.players,
                        [playerId]: name
                    }
                }
            };
        });
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

        // Also update player profile
        const existingProfileEntry = Object.entries(state.playerProfiles)
            .find(([profileId]) => idsEquivalent(profileId, normalizedId));
        const existing = existingProfileEntry?.[1] || createEmptyProfile(normalizedId);

        return {
            knownMappings: { ...state.knownMappings, [normalizedId]: name },
            playerProfiles: { ...state.playerProfiles, [existing.id || normalizedId]: { ...existing, id: existing.id || normalizedId, name } },
            uidMappings: {
                ...state.uidMappings,
                players: { ...state.uidMappings.players, [normalizedId]: name }
            },
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns).filter(([k]) => !idsEquivalent(k, normalizedId))
            )
        };
    }),

    removeMapping: (id) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        const rest = Object.fromEntries(
            Object.entries(state.knownMappings).filter(([key]) => !idsEquivalent(key, normalizedId))
        );
        const restPlayers = Object.fromEntries(
            Object.entries(state.uidMappings.players).filter(([key]) => !idsEquivalent(key, normalizedId))
        );
        Logger.info('MappingSlice', `Removed mapping: ${id}`);
        return {
            knownMappings: rest,
            uidMappings: { ...state.uidMappings, players: restPlayers }
        };
    }),

    registerUnknownId: (id, type) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
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

        // Initialize profile if needed
        const existingProfileEntry = Object.entries(state.playerProfiles)
            .find(([profileId]) => idsEquivalent(profileId, normalizedId));
        const profileKey = existingProfileEntry?.[0] || normalizedId;
        const existingProfile = existingProfileEntry?.[1] || createEmptyProfile(profileKey);
        const existingUnknownEntry = Object.entries(state.detectedUnknowns)
            .find(([unknownId]) => idsEquivalent(unknownId, normalizedId));
        const existingUnknownId = existingUnknownEntry?.[0];

        if (existingUnknownId) {
            return {
                detectedUnknowns: {
                    ...state.detectedUnknowns,
                    [existingUnknownId]: { ...state.detectedUnknowns[existingUnknownId], lastSeen: Date.now() }
                },
                playerProfiles: {
                    ...state.playerProfiles,
                    [profileKey]: { ...existingProfile, id: profileKey, lastSeen: Date.now(), sightings: existingProfile.sightings + 1 }
                }
            };
        }

        Logger.debug('MappingSlice', `Registered unknown ID: ${normalizedId} (${type})`);
        return {
            detectedUnknowns: {
                ...state.detectedUnknowns,
                [normalizedId]: { type, lastSeen: Date.now() }
            },
            playerProfiles: {
                ...state.playerProfiles,
                [profileKey]: { ...existingProfile, id: profileKey }
            }
        };
    }),

    importMappings: (mappings) => set((state) => {
        Logger.info('MappingSlice', `Imported ${Object.keys(mappings).length} mappings`);

        // Create profiles for imported mappings
        const newProfiles = { ...state.playerProfiles };
        Object.entries(mappings).forEach(([id, name]) => {
            if (!newProfiles[id]) {
                newProfiles[id] = createEmptyProfile(id);
            }
            newProfiles[id].name = name;
        });

        return {
            knownMappings: { ...state.knownMappings, ...mappings },
            uidMappings: {
                ...state.uidMappings,
                players: { ...state.uidMappings.players, ...mappings }
            },
            playerProfiles: newProfiles
        };
    }),

    clearUnknowns: () => {
        Logger.info('MappingSlice', 'Cleared all unknown IDs');
        set({ detectedUnknowns: {} });
    },

    setUidMapping: (domain, id, name) => set((state) => {
        const normalizedId = normalizeGuidLikeId(id);
        if (!normalizedId) return {};
        const nextDomain = { ...state.uidMappings[domain], [normalizedId]: name };
        const base: Partial<MappingSlice> = {
            uidMappings: { ...state.uidMappings, [domain]: nextDomain },
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns).filter(([k]) => !idsEquivalent(k, normalizedId))
            )
        };
        if (domain === 'players') {
            const existingProfileEntry = Object.entries(state.playerProfiles)
                .find(([profileId]) => idsEquivalent(profileId, normalizedId));
            const profileKey = existingProfileEntry?.[0] || normalizedId;
            const existing = existingProfileEntry?.[1] || createEmptyProfile(profileKey);
            return {
                ...base,
                knownMappings: { ...state.knownMappings, [normalizedId]: name },
                playerProfiles: { ...state.playerProfiles, [profileKey]: { ...existing, id: profileKey, name } }
            };
        }
        return {
            ...base
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
            const km = Object.fromEntries(
                Object.entries(state.knownMappings).filter(([key]) => !idsEquivalent(key, normalizedId))
            );
            return { uidMappings: next, knownMappings: km };
        }
        return { uidMappings: next };
    }),

    importUidMappings: (mappings) => set((state) => {
        const merged: UidMappings = normalizeSharedUidMappings({
            players: { ...state.uidMappings.players, ...(mappings.players || {}) },
            ships: { ...state.uidMappings.ships, ...(mappings.ships || {}) },
            weapons: { ...state.uidMappings.weapons, ...(mappings.weapons || {}) },
            equipment: { ...state.uidMappings.equipment, ...(mappings.equipment || {}) },
            perks: { ...state.uidMappings.perks, ...(mappings.perks || {}) },
        });
        return {
            uidMappings: merged,
            knownMappings: { ...state.knownMappings, ...(mappings.players || {}) }
        };
    }),

    setUidSeedVersionApplied: (version) => set({ uidSeedVersionApplied: version })
});
