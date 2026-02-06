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
}

export interface MappingSlice {
    // Player profiles with relationship tracking
    playerProfiles: Record<string, PlayerProfile>;

    // Legacy mappings (for backwards compatibility)
    knownMappings: Record<string, string>;      // ID -> Name
    detectedUnknowns: Record<string, { type: 'Hero' | 'Ship' | 'Weapon' | 'Equipment' | 'Unknown'; lastSeen: number }>;
    accelByteToEpicId: Record<string, string>;  // AccelByte ID -> Epic Account ID

    // OCR correction history for learning
    ocrCorrections: Record<string, OcrCorrection>;

    // Profile management
    recordPlayerSighting: (playerId: string, teamColor: string, allTeamPlayers: string[], allOpponentPlayers: string[], shipType?: string, source?: 'ocr' | 'manual') => void;
    setPlayerName: (playerId: string, name: string) => void;
    getPlayerRole: (playerId: string) => PlayerRole;
    getMostFrequentOpponents: (limit?: number) => PlayerProfile[];
    getMostFrequentTeammates: (limit?: number) => PlayerProfile[];

    // OCR correction
    recordOcrCorrection: (ocrText: string, correctedTo: string) => void;
    getOcrCorrection: (ocrText: string) => OcrCorrection | undefined;

    // Legacy actions
    addMapping: (id: string, name: string) => void;
    removeMapping: (id: string) => void;
    registerUnknownId: (id: string, type: 'Hero' | 'Ship' | 'Weapon' | 'Equipment' | 'Unknown') => void;
    importMappings: (mappings: Record<string, string>) => void;
    clearUnknowns: () => void;
    setIDMapping: (abId: string, epicId: string) => void;
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

// ============================================================================
// SLICE
// ============================================================================

export const createMappingSlice: StateCreator<MappingSlice> = (set, get) => ({
    playerProfiles: {},
    knownMappings: {},
    detectedUnknowns: {},
    accelByteToEpicId: {},
    ocrCorrections: {},

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
                knownMappings: { ...state.knownMappings, [playerId]: name }
            };
        });
    },

    recordOcrCorrection: (ocrText, correctedTo) => {
        set((state) => {
            const existing = state.ocrCorrections[ocrText];
            const now = Date.now();

            const updated: OcrCorrection = {
                ocrText,
                correctedTo,
                timestamp: now,
                count: existing ? existing.count + 1 : 1
            };

            Logger.info('MappingSlice', `OCR correction recorded: "${ocrText}" -> "${correctedTo}" (count: ${updated.count})`);

            return {
                ocrCorrections: {
                    ...state.ocrCorrections,
                    [ocrText]: updated
                }
            };
        });
    },

    getOcrCorrection: (ocrText) => {
        return get().ocrCorrections[ocrText];
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
            detectedUnknowns: Object.fromEntries(
                Object.entries(state.detectedUnknowns).filter(([k]) => k !== id)
            )
        };
    }),

    removeMapping: (id) => set((state) => {
        const { [id]: _, ...rest } = state.knownMappings;
        Logger.info('MappingSlice', `Removed mapping: ${id}`);
        return { knownMappings: rest };
    }),

    registerUnknownId: (id, type) => set((state) => {
        if (state.knownMappings[id]) return {};

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
            playerProfiles: newProfiles
        };
    }),

    clearUnknowns: () => {
        Logger.info('MappingSlice', 'Cleared all unknown IDs');
        set({ detectedUnknowns: {} });
    },

    setIDMapping: (abId, epicId) => set((state) => ({
        accelByteToEpicId: { ...state.accelByteToEpicId, [abId]: epicId }
    }))
});
