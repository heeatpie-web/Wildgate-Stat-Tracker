/**
 * @module GameDataProvider
 * React context that exposes match data, player rosters, session state,
 * and mapping actions to the component tree. Subscribes to only the
 * game-data-related fields of the Zustand store via useShallow.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Match, DrillDownTarget, KillMap, Loadout, GameMode, type DetectedUnknownMapping } from '../types';
import { PlayerEncounterRoleCorrection, PlayerProfile } from '../store/slices/createMappingSlice';
import type { PendingReview, RosterEntryMeta, TimelineEvent } from '../store/slices/createDataSlice';
import type { OcrAliasModel } from '../utils/ocrAliasEngine';
import type { EncounterRoleCorrection } from '../utils/playerEncounterRoles';
import { getElectronAPI } from '../utils/electronAPI';
import Logger from '../utils/logger';

interface GameDataContextType {
    matches: Match[];
    setMatches: (matches: Match[]) => void;
    addMatch: (match: Match) => void;
    updateMatch: (updatedMatch: Match) => void;
    deleteMatch: (id: number) => void;
    toggleMatchPin: (id: number) => void;
    players: string[];
    setPlayers: (players: string[]) => void;
    addPlayer: (name: string) => void;
    deletePlayer: (name: string) => void;
    pilotRegistry: string[];
    setPilotRegistry: (pilots: string[]) => void;
    addToRegistry: (name: string, meta?: Partial<RosterEntryMeta>) => void;
    removeFromRegistry: (name: string) => void;
    favorites: string[]; // Match IDs/Names
    setFavorites: (favs: string[]) => void;
    toggleFavorite: (id: string) => void;
    pilotNotes: Record<string, string>;
    setPilotNotes: (notes: Record<string, string>) => void;
    updatePilotNote: (pilot: string, note: string) => void;
    pilotAliases: Record<string, string[]>;
    addPilotAlias: (pilotName: string, alias: string) => void;
    removePilotAlias: (pilotName: string, alias: string) => void;
    knownMappings: Record<string, string>;
    ocrAliasModel: OcrAliasModel;
    playerIdMap: Record<string, string>;
    setPlayerIdMap: (map: Record<string, string>) => void;
    updatePlayerIdMapping: (id: string, name: string) => void;
    mergePilots: (target: string, source: string) => void;
    undoLastMerge: () => boolean;
    mergeHistory: Array<{ id: string; timestamp: number; sourceName: string; targetName: string }>;
    activeMergeNotificationId: string | null;
    dismissActiveMergeNotification: () => void;
    renamePilot: (oldName: string, newName: string) => void;
    lastActivity: number;
    setLastActivity: (ts: number) => void;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;

    // Drilldown State (often used with Data)
    drillDownTarget: DrillDownTarget | null;
    setDrillDownTarget: (target: DrillDownTarget | null) => void;

    // Session State (Consider moving to SessionProvider if this grows)
    selectedTeammates: string[];
    setSelectedTeammates: (t: string[] | ((curr: string[]) => string[])) => void;
    toggleTeammate: (t: string) => void;
    selectedOpponents: string[];
    setSelectedOpponents: (o: string[] | ((curr: string[]) => string[])) => void;
    toggleOpponent: (o: string) => void;
    activeHero: string | null;
    heroSource?: 'manual' | 'telemetry' | 'ocr';
    telemetryDetectedHero?: string;
    setActiveHero: (h: string, source?: 'manual' | 'telemetry' | 'ocr') => void;
    activeShip: string | null;
    shipSource?: 'manual' | 'telemetry' | 'ocr';
    telemetryDetectedShip?: string;
    setActiveShip: (s: string, source?: 'manual' | 'telemetry' | 'ocr') => void;
    activeWeapons: Record<string, number>;
    setActiveWeapons: (w: Record<string, number>, persistToCharacterLoadout?: boolean) => void;
    matchStartTime: number | null;
    setMatchStartTime: (ts: number | null) => void;
    isMatchInProgress: boolean;
    setIsMatchInProgress: (is: boolean) => void;
    selectedReachModifiers: string[];
    modifiersSource?: 'manual' | 'telemetry' | 'ocr';
    setSelectedReachModifiers: (m: string[], source?: 'manual' | 'telemetry' | 'ocr') => void;
    toggleReachModifier: (m: string) => void;
    kills: KillMap;
    setKills: (k: KillMap) => void;
    elims: string;
    setElims: (s: string) => void;
    poiEasy: number;
    setPoiEasy: (n: number) => void;
    poiMedium: number;
    setPoiMedium: (n: number) => void;
    poiEpic: number;
    setPoiEpic: (n: number) => void;
    // Match Data State
    timeMin: string;
    setTimeMin: (v: string, source?: 'manual' | 'telemetry' | 'ocr') => void;
    timeSec: string;
    setTimeSec: (v: string, source?: 'manual' | 'telemetry' | 'ocr') => void;
    damageTaken: string;
    damageSource?: 'manual' | 'telemetry' | 'ocr';
    setDamageTaken: (v: string, source?: 'manual' | 'telemetry' | 'ocr') => void;

    currentNote: string;
    setCurrentNote: (s: string) => void;

    // Simulation / Sandbox State
    isSimulation: boolean;
    setIsSimulation: (isSim: boolean) => void;

    pendingMatchData: Partial<Match> | null;
    setPendingMatchData: (m: Partial<Match> | null) => void;
    pendingSubType: string | null;
    setPendingSubType: (s: string) => void;
    pendingPlacement: number | null;
    setPendingPlacement: (n: number | null) => void;
    pendingArtifactType: string | null;
    setPendingArtifactType: (s: string) => void;
    pendingKilledBy: string;
    setPendingKilledBy: (s: string) => void;
    pendingKilledByShip: string;
    setPendingKilledByShip: (s: string) => void;
    sessionTeams: Record<string, string[]>;
    setSessionTeams: (teams: Record<string, string[]>) => void;
    sessionShipTypes: Record<string, string>;
    setSessionShipTypes: (types: Record<string, string>, source?: 'manual' | 'telemetry' | 'ocr') => void;
    sessionStartTime: number;
    recordPlayerSighting: (playerId: string, teamColor: string, allTeamPlayers: string[], allOpponentPlayers: string[], shipType?: string, source?: 'ocr' | 'manual', ocrOnly?: boolean) => void;
    currentLoadout: Loadout | null; // Added
    setCurrentLoadout: (l: Loadout | null) => void; // Added
    timelineEvents: TimelineEvent[];
    setTimelineEvents: (events: TimelineEvent[]) => void;
    addTimelineEvent: (event: TimelineEvent) => void;
    activeMode: GameMode; // Exposed for convenience
    pendingReviews: PendingReview[];
    addPendingReview: (review: PendingReview) => void;
    removePendingReview: (id: string) => void;
    removePendingReviews: (ids: string[]) => void;
    clearPendingReviews: () => void;
    dismissedRosterMergePairKeys: string[];
    dismissRosterMergeSuggestionPairs: (pairKeys: string[]) => void;
    dismissedRosterCandidateKeys: string[];
    dismissRosterCandidateKeys: (keys: string[]) => void;
    detectedUnknowns: Record<string, DetectedUnknownMapping>;
    addMapping: (id: string, name: string) => void;
    setOverlayPhase: (phase: 'Setup' | 'Live' | 'Result') => void;
    playerProfiles: Record<string, PlayerProfile>;
    playerEncounterRoleCorrections: Record<string, PlayerEncounterRoleCorrection>;
    getPlayerEncounterRoleCorrection: (matchId: number, playerName: string) => EncounterRoleCorrection | null;
    clearTelemetryDetected: () => void;
}

const GameDataContext = createContext<GameDataContextType | null>(null);

export const useGameData = () => {
    const context = useContext(GameDataContext);
    if (!context) {
        throw new Error('useGameData must be used within a GameDataProvider');
    }
    return context;
};

export const GameDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const dictionarySignatureRef = useRef('');
    const dictionaryUpdateInFlightRef = useRef(false);

    const store = useAppStore(useShallow(s => ({
        matches: s.matches, setMatches: s.setMatches,
        addMatch: s.addMatch, updateMatch: s.updateMatch,
        deleteMatch: s.deleteMatch, toggleMatchPin: s.toggleMatchPin,
        players: s.players, setPlayers: s.setPlayers,
        addPlayer: s.addPlayer, deletePlayer: s.deletePlayer,
        pilotRegistry: s.pilotRegistry, setPilotRegistry: s.setPilotRegistry,
        addToRegistry: s.addToRegistry, removeFromRegistry: s.removeFromRegistry,
        favorites: s.favorites, setFavorites: s.setFavorites, toggleFavorite: s.toggleFavorite,
        pilotNotes: s.pilotNotes, setPilotNotes: s.setPilotNotes, updatePilotNote: s.updatePilotNote,
        pilotAliases: s.pilotAliases, addPilotAlias: s.addPilotAlias, removePilotAlias: s.removePilotAlias,
        knownMappings: s.knownMappings, ocrAliasModel: s.ocrAliasModel,
        playerIdMap: s.playerIdMap, setPlayerIdMap: s.setPlayerIdMap,
        updatePlayerIdMapping: s.updatePlayerIdMapping,
        mergePilots: s.mergePilots, undoLastMerge: s.undoLastMerge, mergeHistory: s.mergeHistory,
        activeMergeNotificationId: s.activeMergeNotificationId, dismissActiveMergeNotification: s.dismissActiveMergeNotification,
        renamePilot: s.renamePilot,
        lastActivity: s.lastActivity, setLastActivity: s.setLastActivity,
        isLoading: s.isLoading, setIsLoading: s.setIsLoading,
        drillDownTarget: s.drillDownTarget, setDrillDownTarget: s.setDrillDownTarget,
        selectedTeammates: s.selectedTeammates, setSelectedTeammates: s.setSelectedTeammates,
        toggleTeammate: s.toggleTeammate,
        selectedOpponents: s.selectedOpponents, setSelectedOpponents: s.setSelectedOpponents,
        toggleOpponent: s.toggleOpponent,
        activeHero: s.activeHero, heroSource: s.heroSource, telemetryDetectedHero: s.telemetryDetectedHero, setActiveHero: s.setActiveHero,
        activeShip: s.activeShip, shipSource: s.shipSource, telemetryDetectedShip: s.telemetryDetectedShip, setActiveShip: s.setActiveShip,
        activeWeapons: s.activeWeapons, setActiveWeapons: s.setActiveWeapons,
        matchStartTime: s.matchStartTime, setMatchStartTime: s.setMatchStartTime,
        isMatchInProgress: s.isMatchInProgress, setIsMatchInProgress: s.setIsMatchInProgress,
        selectedReachModifiers: s.selectedReachModifiers, modifiersSource: s.modifiersSource, setSelectedReachModifiers: s.setSelectedReachModifiers,
        toggleReachModifier: s.toggleReachModifier,
        kills: s.kills, setKills: s.setKills,
        elims: s.elims, setElims: s.setElims,
        poiEasy: s.poiEasy, setPoiEasy: s.setPoiEasy,
        poiMedium: s.poiMedium, setPoiMedium: s.setPoiMedium,
        poiEpic: s.poiEpic, setPoiEpic: s.setPoiEpic,
        timeMin: s.timeMin, setTimeMin: s.setTimeMin,
        timeSec: s.timeSec, setTimeSec: s.setTimeSec,
        damageTaken: s.damageTaken, damageSource: s.damageSource, setDamageTaken: s.setDamageTaken,
        currentNote: s.currentNote, setCurrentNote: s.setCurrentNote,
        isSimulation: s.isSimulation, setIsSimulation: s.setIsSimulation,
        pendingMatchData: s.pendingMatchData, setPendingMatchData: s.setPendingMatchData,
        pendingSubType: s.pendingSubType, setPendingSubType: s.setPendingSubType,
        pendingPlacement: s.pendingPlacement, setPendingPlacement: s.setPendingPlacement,
        pendingArtifactType: s.pendingArtifactType, setPendingArtifactType: s.setPendingArtifactType,
        pendingKilledBy: s.pendingKilledBy, setPendingKilledBy: s.setPendingKilledBy,
        pendingKilledByShip: s.pendingKilledByShip, setPendingKilledByShip: s.setPendingKilledByShip,
        sessionTeams: s.sessionTeams, setSessionTeams: s.setSessionTeams,
        sessionShipTypes: s.sessionShipTypes, setSessionShipTypes: s.setSessionShipTypes,
        sessionStartTime: s.sessionStartTime,
        recordPlayerSighting: s.recordPlayerSighting,
        currentLoadout: s.currentLoadout, setCurrentLoadout: s.setCurrentLoadout,
        timelineEvents: s.timelineEvents, setTimelineEvents: s.setTimelineEvents,
        addTimelineEvent: s.addTimelineEvent,
        activeMode: s.activeMode,
        pendingReviews: s.pendingReviews, addPendingReview: s.addPendingReview,
        removePendingReview: s.removePendingReview, removePendingReviews: s.removePendingReviews, clearPendingReviews: s.clearPendingReviews,
        dismissedRosterMergePairKeys: s.dismissedRosterMergePairKeys, dismissRosterMergeSuggestionPairs: s.dismissRosterMergeSuggestionPairs,
        dismissedRosterCandidateKeys: s.dismissedRosterCandidateKeys, dismissRosterCandidateKeys: s.dismissRosterCandidateKeys,
        detectedUnknowns: s.detectedUnknowns, addMapping: s.addMapping,
        setOverlayPhase: s.setOverlayPhase,
        playerProfiles: s.playerProfiles,
        playerEncounterRoleCorrections: s.playerEncounterRoleCorrections,
        getPlayerEncounterRoleCorrection: s.getPlayerEncounterRoleCorrection,
        clearTelemetryDetected: s.clearTelemetryDetected,
    })));

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;
        if (dictionaryUpdateInFlightRef.current) return;

        const pilots = Array.from(new Set(
            (store.pilotRegistry || [])
                .filter((name): name is string => typeof name === 'string')
                .map(name => name.replace(/\s+/g, ' ').trim())
                .filter(Boolean)
        ));

        if (pilots.length < 5) return;

        const recentMatches = (store.matches || []).slice(-500);
        const latestTimestamp = recentMatches.reduce((maxTs, match) => {
            const candidate = Number(match?.timestamp) || 0;
            return candidate > maxTs ? candidate : maxTs;
        }, 0);
        const signature = `${pilots.map(name => name.toLowerCase()).sort().join('|')}::${recentMatches.length}:${latestTimestamp}`;
        if (dictionarySignatureRef.current === signature) return;

        const timeoutId = window.setTimeout(() => {
            dictionarySignatureRef.current = signature;
            dictionaryUpdateInFlightRef.current = true;

            // TODO: enable if Paddle gains dictionary support.
            api.invoke('regenerate-ocr-dictionary', {
                pilotRegistry: pilots,
                matches: recentMatches,
            })
                .then((result: unknown) => {
                    if (!result || typeof result !== 'object' || !('success' in result) || (result as { success: boolean }).success !== true) {
                        const errorMessage = (result && typeof result === 'object' && 'error' in result)
                            ? String((result as { error?: string }).error || 'unknown error')
                            : 'unknown error';
                        if (errorMessage === 'Dictionary regeneration is not supported with PaddleOCR runtime') {
                            return;
                        }
                        Logger.warn('OCR-Dict', `Auto dictionary regeneration failed: ${errorMessage}`);
                        return;
                    }
                    const stats = result as { totalWords?: number; pilotCount?: number };
                    Logger.info('OCR-Dict', `Auto dictionary regenerated (${stats.totalWords || 0} words from ${stats.pilotCount || pilots.length} pilots)`);
                })
                .catch((error: unknown) => {
                    Logger.warn('OCR-Dict', 'Auto dictionary regeneration error', error);
                })
                .finally(() => {
                    dictionaryUpdateInFlightRef.current = false;
                });
        }, 1200);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [store.pilotRegistry, store.matches]);

    const value = useMemo(() => store, [store]);

    return (
        <GameDataContext.Provider value={value}>
            {children}
        </GameDataContext.Provider>
    );
};
