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

export interface UidMappings {
    players: Record<string, string>;
    ships: Record<string, string>;
    weapons: Record<string, string>;
    equipment: Record<string, string>;
}

export interface MappingSlice {
    // Player profiles with relationship tracking
    playerProfiles: Record<string, PlayerProfile>;

    // Legacy mappings (for backwards compatibility)
    knownMappings: Record<string, string>;      // ID -> Name
    detectedUnknowns: Record<string, { type: 'Hero' | 'Ship' | 'Weapon' | 'Equipment' | 'Unknown'; lastSeen: number }>;
    uidMappings: UidMappings;
    uidSeedVersionApplied: number | null;

    // OCR correction history for learning
    ocrCorrections: Record<string, OcrCorrection>;
    ocrAliasModel: OcrAliasModel;
    ocrLearningEvents: OcrLearningEvent[];
    ocrLearningQueue: OcrLearningQueueItem[];

    // Profile management
    recordPlayerSighting: (playerId: string, teamColor: string, allTeamPlayers: string[], allOpponentPlayers: string[], shipType?: string, source?: 'ocr' | 'manual') => void;
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

    // Legacy actions
    addMapping: (id: string, name: string) => void;
    removeMapping: (id: string) => void;
    registerUnknownId: (id: string, type: 'Hero' | 'Ship' | 'Weapon' | 'Equipment' | 'Unknown') => void;
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

const toLegacyCorrection = (
    key: string,
    correctedTo: string,
    existing?: OcrCorrection,
    source: OcrAliasSource = 'manual_correction',
    confidenceWeight = 0.6,
    context: OcrAliasContext = 'unknown'
): OcrCorrection => {
    const baseContexts: Record<OcrAliasContext, number> = {
        lobby: 0,
        tactical: 0,
        social: 0,
        matchstats: 0,
        unknown: 0,
        ...(existing?.contexts || {}),
    };
    const contexts: Record<OcrAliasContext, number> = {
        ...baseContexts,
        [context]: (baseContexts[context] || 0) + 1,
    };
    return {
        ocrText: key,
        correctedTo,
        timestamp: Date.now(),
        count: (existing?.count || 0) + 1,
        source,
        confidenceWeight,
        contexts,
    };
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

// ============================================================================
// SLICE
// ============================================================================

export const createMappingSlice: StateCreator<MappingSlice> = (set, get) => ({
    playerProfiles: {},
    knownMappings: {},
    detectedUnknowns: {},
    uidMappings: { players: {}, ships: {}, weapons: {}, equipment: {} },
    uidSeedVersionApplied: null,
    ocrCorrections: {},
    ocrAliasModel: createEmptyOcrAliasModel(),
    ocrLearningEvents: [],
    ocrLearningQueue: [],

    recordPlayerSighting: (playerId, teamColor, allTeamPlayers, allOpponentPlayers, shipType, source = 'manual') => {
        set((state) => {
            const existing = state.playerProfiles[playerId] || createEmptyProfile(playerId);
            const now = Date.now();

            // Update team observations
            const teamsObserved = { ...existing.teamsObserved };
            if (teamColor && teamColor !== 'Unknown' && teamColor !== 'unknown') {
                teamsObserved[teamColor] = (teamsObserved[teamColor] || 0) + 1;
            }

            // Update ship observations
            const shipsObserved = { ...existing.shipsObserved };
            if (shipType) {
                shipsObserved[shipType] = (shipsObserved[shipType] || 0) + 1;
            }

            // Update playedWith (teammates)
            const playedWith = { ...existing.playedWith };
            allTeamPlayers.forEach(id => {
                if (id !== playerId) {
                    playedWith[id] = (playedWith[id] || 0) + 1;
                }
            });

            // Update playedAgainst (opponents)
            const playedAgainst = { ...existing.playedAgainst };
            allOpponentPlayers.forEach(id => {
                playedAgainst[id] = (playedAgainst[id] || 0) + 1;
            });

            // Track source of sighting (OCR vs manual)
            const ocrSightings = source === 'ocr' ? (existing.ocrSightings || 0) + 1 : (existing.ocrSightings || 0);
            const manualSightings = source === 'manual' ? (existing.manualSightings || 0) + 1 : (existing.manualSightings || 0);

            const updated: PlayerProfile = {
                ...existing,
                sightings: existing.sightings + 1,
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
        const normalizedRaw = raw.toLowerCase();
        const target = normalizeOcrName(correctedTo);
        if (!raw || !target) return;

        const context = opts.context || 'unknown';
        const source = opts.source || 'manual_correction';
        const confidenceWeight = Number.isFinite(opts.confidenceWeight as number)
            ? Math.max(0, Math.min(1, Number(opts.confidenceWeight)))
            : 0.6;

        set((state) => {
            const rawExisting = state.ocrCorrections[raw];
            const normalizedExisting = state.ocrCorrections[normalizedRaw];
            const nextLegacy: Record<string, OcrCorrection> = {
                ...state.ocrCorrections,
                [raw]: toLegacyCorrection(raw, target, rawExisting, source, confidenceWeight, context),
            };
            if (normalizedRaw !== raw) {
                nextLegacy[normalizedRaw] = toLegacyCorrection(
                    normalizedRaw,
                    target,
                    normalizedExisting,
                    source,
                    confidenceWeight,
                    context
                );
            }

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
                ocrCorrections: nextLegacy,
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
        Logger.info('MappingSlice', `Added mapping: ${id} -> ${name}`);

        // Also update player profile
        const existing = state.playerProfiles[id] || createEmptyProfile(id);

        return {
            knownMappings: { ...state.knownMappings, [id]: name },
            playerProfiles: { ...state.playerProfiles, [id]: { ...existing, name } },
            uidMappings: {
                ...state.uidMappings,
                players: { ...state.uidMappings.players, [id]: name }
            },
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns).filter(([k]) => k !== id)
            )
        };
    }),

    removeMapping: (id) => set((state) => {
        const { [id]: _, ...rest } = state.knownMappings;
        const { [id]: __, ...restPlayers } = state.uidMappings.players;
        Logger.info('MappingSlice', `Removed mapping: ${id}`);
        return {
            knownMappings: rest,
            uidMappings: { ...state.uidMappings, players: restPlayers }
        };
    }),

    registerUnknownId: (id, type) => set((state) => {
        if (state.knownMappings[id]) return {};
        if (state.uidMappings.players[id] || state.uidMappings.ships[id] || state.uidMappings.weapons[id] || state.uidMappings.equipment[id]) return {};

        // Initialize profile if needed
        const existingProfile = state.playerProfiles[id] || createEmptyProfile(id);

        if (state.detectedUnknowns[id]) {
            return {
                detectedUnknowns: {
                    ...state.detectedUnknowns,
                    [id]: { ...state.detectedUnknowns[id], lastSeen: Date.now() }
                },
                playerProfiles: {
                    ...state.playerProfiles,
                    [id]: { ...existingProfile, lastSeen: Date.now(), sightings: existingProfile.sightings + 1 }
                }
            };
        }

        Logger.debug('MappingSlice', `Registered unknown ID: ${id} (${type})`);
        return {
            detectedUnknowns: {
                ...state.detectedUnknowns,
                [id]: { type, lastSeen: Date.now() }
            },
            playerProfiles: {
                ...state.playerProfiles,
                [id]: existingProfile
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
        const nextDomain = { ...state.uidMappings[domain], [id]: name };
        return {
            uidMappings: { ...state.uidMappings, [domain]: nextDomain },
            ...(domain === 'players' ? { knownMappings: { ...state.knownMappings, [id]: name } } : {})
        } as Partial<MappingSlice>;
    }),

    removeUidMapping: (domain, id) => set((state) => {
        const { [id]: _, ...rest } = state.uidMappings[domain];
        const next = { ...state.uidMappings, [domain]: rest };
        if (domain === 'players') {
            const { [id]: __, ...km } = state.knownMappings;
            return { uidMappings: next, knownMappings: km };
        }
        return { uidMappings: next };
    }),

    importUidMappings: (mappings) => set((state) => {
        const merged: UidMappings = {
            players: { ...state.uidMappings.players, ...(mappings.players || {}) },
            ships: { ...state.uidMappings.ships, ...(mappings.ships || {}) },
            weapons: { ...state.uidMappings.weapons, ...(mappings.weapons || {}) },
            equipment: { ...state.uidMappings.equipment, ...(mappings.equipment || {}) },
        };
        return {
            uidMappings: merged,
            knownMappings: { ...state.knownMappings, ...(mappings.players || {}) }
        };
    }),

    setUidSeedVersionApplied: (version) => set({ uidSeedVersionApplied: version })
});
