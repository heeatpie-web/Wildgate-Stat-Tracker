import { StateCreator } from 'zustand';
import { CHARACTERS, SHIPS, KillMap } from '../../types';
import { DataSource, getPriority } from './createDataSlice';
import type { Match } from '../../types';
import { capTeammateNames } from '../../utils/teamLimits';

const sanitizeTeammates = (teammates: string[] | null | undefined, ship: string): string[] => {
    return capTeammateNames(teammates, ship);
};

const sanitizeNames = (values: string[] | null | undefined): string[] => {
    if (!Array.isArray(values)) return [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
        const cleaned = String(raw || '').trim();
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(cleaned);
    }
    return unique;
};

export interface FormSlice {
    selectedTeammates: string[];
    selectedOpponents: string[];
    activeHero: string;
    heroSource?: DataSource;
    activeShip: string;
    shipSource?: DataSource;
    telemetryDetectedHero?: string;
    telemetryDetectedShip?: string;
    activeWeapons: Record<string, number>;
    matchStartTime: number | null;
    isMatchInProgress: boolean;
    selectedReachModifiers: string[];
    modifiersSource?: DataSource;
    kills: KillMap;
    poiEasy: number;
    poiMedium: number;
    poiEpic: number;
    elims: string;
    currentNote: string;
    pendingMatchData: Partial<Match> | null;
    pendingSubType: string;
    pendingPlacement: number | null;
    pendingArtifactType: string;
    showWizard: 'Win' | 'Loss' | 'Draw' | null;

    characterLoadouts: Record<string, Record<string, number>>;

    setSelectedTeammates: (teammates: string[] | ((curr: string[]) => string[])) => void;
    toggleTeammate: (name: string) => void;
    setSelectedOpponents: (opponents: string[] | ((curr: string[]) => string[])) => void;
    toggleOpponent: (name: string) => void;
    setActiveHero: (hero: string, source?: DataSource) => void;
    setActiveShip: (ship: string, source?: DataSource) => void;
    setActiveWeapons: (weapons: Record<string, number>) => void;
    setMatchStartTime: (time: number | null) => void;
    setIsMatchInProgress: (inProgress: boolean) => void;
    setSelectedReachModifiers: (modifiers: string[], source?: DataSource) => void;
    toggleReachModifier: (modifier: string) => void;
    setKills: (kills: KillMap) => void;
    setPoiEasy: (val: number) => void;
    setPoiMedium: (val: number) => void;
    setPoiEpic: (val: number) => void;
    setElims: (val: string) => void;
    setCurrentNote: (val: string) => void;
    setPendingMatchData: (data: Partial<Match> | null) => void;
    setPendingSubType: (type: string) => void;
    setPendingPlacement: (placement: number | null) => void;
    setPendingArtifactType: (type: string) => void;
    setShowWizard: (result: 'Win' | 'Loss' | 'Draw' | null) => void;

    resetForm: () => void;
}

export const createFormSlice: StateCreator<FormSlice> = (set, get) => ({
    selectedTeammates: [],
    selectedOpponents: [],
    activeHero: CHARACTERS[0],
    heroSource: undefined,
    activeShip: SHIPS[0],
    shipSource: undefined,
    telemetryDetectedHero: undefined,
    telemetryDetectedShip: undefined,
    activeWeapons: {},
    characterLoadouts: {},
    matchStartTime: null,
    isMatchInProgress: false,
    selectedReachModifiers: [],
    modifiersSource: undefined,
    kills: { "AI Legion": 0 },
    poiEasy: 0,
    poiMedium: 0,
    poiEpic: 0,
    elims: "",
    currentNote: "",
    pendingMatchData: null,
    pendingSubType: '',
    pendingPlacement: null,
    pendingArtifactType: '',
    showWizard: null,

    setSelectedTeammates: (teammates) => set((state) => ({
        selectedTeammates: sanitizeTeammates(
            typeof teammates === 'function' ? teammates(state.selectedTeammates) : teammates,
            state.activeShip
        )
    })),
    toggleTeammate: (name) => set((state) => {
        const cleaned = String(name || '').trim();
        if (!cleaned) return {};
        const key = cleaned.toLowerCase();
        if (state.selectedTeammates.some((t) => t.toLowerCase() === key)) {
            return { selectedTeammates: state.selectedTeammates.filter((t) => t.toLowerCase() !== key) };
        }
        const next = sanitizeTeammates([...state.selectedTeammates, cleaned], state.activeShip);
        if (next.length > state.selectedTeammates.length) return { selectedTeammates: next };
        return {};
    }),
    setSelectedOpponents: (opponents) => set((state) => ({
        selectedOpponents: sanitizeNames(
            typeof opponents === 'function' ? opponents(state.selectedOpponents) : opponents
        )
    })),
    toggleOpponent: (name) => set((state) => ({
        selectedOpponents: (() => {
            const cleaned = String(name || '').trim();
            if (!cleaned) return state.selectedOpponents;
            const key = cleaned.toLowerCase();
            if (state.selectedOpponents.some((o) => o.toLowerCase() === key)) {
                return state.selectedOpponents.filter((o) => o.toLowerCase() !== key);
            }
            return sanitizeNames([...state.selectedOpponents, cleaned]);
        })()
    })),
    setActiveHero: (hero, source = 'manual') => set((state) => {
        const telemetryUpdate = source === 'telemetry' ? { telemetryDetectedHero: hero } : {};
        const currentP = getPriority(state.heroSource);
        const newP = getPriority(source);
        const allowInitialTelemetryOverride = source === 'telemetry'
            && state.heroSource === 'manual'
            && !state.telemetryDetectedHero;
        if (newP >= currentP || !state.heroSource || allowInitialTelemetryOverride) {
            return {
                activeHero: hero,
                heroSource: source,
                activeWeapons: state.characterLoadouts[hero] || {},
                ...telemetryUpdate
            };
        }
        return telemetryUpdate;
    }),
    setActiveShip: (ship, source = 'manual') => set((state) => {
        const telemetryUpdate = source === 'telemetry' ? { telemetryDetectedShip: ship } : {};
        const currentP = getPriority(state.shipSource);
        const newP = getPriority(source);
        const allowInitialTelemetryOverride = source === 'telemetry'
            && state.shipSource === 'manual'
            && !state.telemetryDetectedShip;
        if (newP >= currentP || !state.shipSource || allowInitialTelemetryOverride) {
            const newTeammates = sanitizeTeammates(state.selectedTeammates, ship);
            return { activeShip: ship, shipSource: source, selectedTeammates: newTeammates, ...telemetryUpdate };
        }
        return telemetryUpdate;
    }),
    setActiveWeapons: (weapons) => set((state) => ({
        activeWeapons: weapons,
        // Save to current hero's loadout
        characterLoadouts: {
            ...state.characterLoadouts,
            [state.activeHero]: weapons
        }
    })),
    setMatchStartTime: (time) => set({ matchStartTime: time }),
    setIsMatchInProgress: (inProgress) => set({ isMatchInProgress: inProgress }),
    setSelectedReachModifiers: (modifiers, source = 'manual') => set((state) => {
        const currentP = getPriority(state.modifiersSource);
        const newP = getPriority(source);
        if (newP >= currentP || !state.modifiersSource) {
            return { selectedReachModifiers: modifiers, modifiersSource: source };
        }
        return {};
    }),
    toggleReachModifier: (modifier) => set((state) => ({
        selectedReachModifiers: state.selectedReachModifiers.includes(modifier)
            ? state.selectedReachModifiers.filter(m => m !== modifier)
            : [...state.selectedReachModifiers, modifier]
    })),
    setKills: (kills) => set({ kills }),
    setPoiEasy: (val) => set({ poiEasy: val }),
    setPoiMedium: (val) => set({ poiMedium: val }),
    setPoiEpic: (val) => set({ poiEpic: val }),
    setElims: (val) => set({ elims: val }),
    setCurrentNote: (val) => set({ currentNote: val }),
    setPendingMatchData: (data) => set({ pendingMatchData: data }),
    setPendingSubType: (type) => set({ pendingSubType: type }),
    setPendingPlacement: (placement) => set({ pendingPlacement: placement }),
    setPendingArtifactType: (type) => set({ pendingArtifactType: type }),
    setShowWizard: (result) => set({ showWizard: result }),

    resetForm: () => set((state) => ({
        poiEasy: 0,
        poiMedium: 0,
        poiEpic: 0,
        kills: { "AI Legion": 0 },
        selectedReachModifiers: [],
        modifiersSource: undefined,
        heroSource: undefined,
        shipSource: undefined,
        telemetryDetectedHero: undefined,
        telemetryDetectedShip: undefined,
        elims: "",
        currentNote: "",
        activeWeapons: state.characterLoadouts[state.activeHero] || {}
    }))
});
