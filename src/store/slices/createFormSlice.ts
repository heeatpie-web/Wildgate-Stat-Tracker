import { StateCreator } from 'zustand';
import { CHARACTERS, SHIPS, KillMap, getShipCapacity } from '../../types';
import { DataSource, getPriority } from './createDataSlice';

const getMaxTeammatesForShip = (ship: string): number => {
    const capacity = getShipCapacity(ship || '');
    const normalizedCapacity = capacity > 1 ? capacity : 4;
    return Math.max(0, normalizedCapacity - 1);
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
    pendingMatchData: any;
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
    setPendingMatchData: (data: any) => void;
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
        selectedTeammates: typeof teammates === 'function' ? teammates(state.selectedTeammates) : teammates
    })),
    toggleTeammate: (name) => set((state) => {
        const maxTeammates = getMaxTeammatesForShip(state.activeShip);
        if (state.selectedTeammates.includes(name)) return { selectedTeammates: state.selectedTeammates.filter(t => t !== name) };
        if (state.selectedTeammates.length < maxTeammates) return { selectedTeammates: [...state.selectedTeammates, name] };
        return {};
    }),
    setSelectedOpponents: (opponents) => set((state) => ({
        selectedOpponents: typeof opponents === 'function' ? opponents(state.selectedOpponents) : opponents
    })),
    toggleOpponent: (name) => set((state) => ({
        selectedOpponents: state.selectedOpponents.includes(name)
            ? state.selectedOpponents.filter(o => o !== name)
            : [...state.selectedOpponents, name]
    })),
    setActiveHero: (hero, source = 'manual') => set((state) => {
        const telemetryUpdate = source === 'telemetry' ? { telemetryDetectedHero: hero } : {};
        const currentP = getPriority(state.heroSource);
        const newP = getPriority(source);
        if (newP >= currentP || !state.heroSource) {
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
        if (newP >= currentP || !state.shipSource) {
            const maxTeammates = getMaxTeammatesForShip(ship);
            const newTeammates = state.selectedTeammates.filter((_, i) => i < maxTeammates);
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
        timeMin: "",
        timeSec: "",
        selectedReachModifiers: [],
        modifiersSource: undefined,
        heroSource: undefined,
        shipSource: undefined,
        telemetryDetectedHero: undefined,
        telemetryDetectedShip: undefined,
        damageTaken: "",
        elims: "",
        currentNote: "",
        // Do NOT reset activeWeapons to empty? Or reset to CURRENT hero's defaults?
        // Match submission usually means we are done. But if we start a new match, we might want same loadout.
        // Resetting to empty is annoying.
        // Let's reset to the saved loadout for the active hero (which is effectively current, or empty check).
        activeWeapons: state.characterLoadouts[state.activeHero] || {}
    }))
});
