/**
 * @module createFormSlice
 * Transient form state for the match recording UI: selected teammates/opponents,
 * active hero/ship/weapons, kills, POI counts, and pending wizard data.
 * Reset after each match submission via resetForm().
 */
import { StateCreator } from 'zustand';
import { CHARACTERS, SHIPS, KillMap, getShipCapacity } from '../../types';

export interface FormSlice {
    selectedTeammates: string[];
    selectedOpponents: string[];
    activeHero: string;
    activeShip: string;
    activeWeapons: Record<string, number>;
    matchStartTime: number | null;
    isMatchInProgress: boolean;
    selectedReachModifiers: string[];
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
    setActiveHero: (hero: string) => void;
    setActiveShip: (ship: string) => void;
    setActiveWeapons: (weapons: Record<string, number>) => void;
    setMatchStartTime: (time: number | null) => void;
    setIsMatchInProgress: (inProgress: boolean) => void;
    setSelectedReachModifiers: (modifiers: string[]) => void;
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
    activeShip: SHIPS[0],
    activeWeapons: {},
    characterLoadouts: {},
    matchStartTime: null,
    isMatchInProgress: false,
    selectedReachModifiers: [],
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
        const maxTeammates = getShipCapacity(state.activeShip) - 1;
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
    setActiveHero: (hero) => set((state) => ({
        activeHero: hero,
        // Load saved loadout for this hero, or empty
        activeWeapons: state.characterLoadouts[hero] || {}
    })),
    setActiveShip: (ship) => set((state) => {
        const maxTeammates = getShipCapacity(ship) - 1;
        const newTeammates = state.selectedTeammates.filter((_, i) => i < maxTeammates);
        return { activeShip: ship, selectedTeammates: newTeammates };
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
    setSelectedReachModifiers: (modifiers) => set({ selectedReachModifiers: modifiers }),
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