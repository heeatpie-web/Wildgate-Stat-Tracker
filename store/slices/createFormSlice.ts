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
  timeMin: string;
  timeSec: string;
  damageTaken: string;
  currentNote: string;
  pendingMatchData: any;
  pendingSubType: string;
  pendingPlacement: number | null;
  pendingArtifactType: string;
  showWizard: 'Win' | 'Loss' | 'Draw' | null;

  setSelectedTeammates: (teammates: string[]) => void;
  toggleTeammate: (name: string) => void;
  setSelectedOpponents: (opponents: string[]) => void;
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
  setTimeMin: (val: string) => void;
  setTimeSec: (val: string) => void;
  setDamageTaken: (val: string) => void;
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
  matchStartTime: null,
  isMatchInProgress: false,
  selectedReachModifiers: [],
  kills: { "AI Legion": 0 },
  poiEasy: 0,
  poiMedium: 0,
  poiEpic: 0,
  timeMin: "",
  timeSec: "",
  damageTaken: "",
  currentNote: "",
  pendingMatchData: null,
  pendingSubType: '',
  pendingPlacement: null,
  pendingArtifactType: '',
  showWizard: null,

  setSelectedTeammates: (teammates) => set({ selectedTeammates: teammates }),
  toggleTeammate: (name) => set((state) => {
      const maxTeammates = getShipCapacity(state.activeShip) - 1;
      if (state.selectedTeammates.includes(name)) return { selectedTeammates: state.selectedTeammates.filter(t => t !== name) };
      if (state.selectedTeammates.length < maxTeammates) return { selectedTeammates: [...state.selectedTeammates, name] };
      return {};
  }),
  setSelectedOpponents: (opponents) => set({ selectedOpponents: opponents }),
  toggleOpponent: (name) => set((state) => ({
      selectedOpponents: state.selectedOpponents.includes(name) 
          ? state.selectedOpponents.filter(o => o !== name) 
          : [...state.selectedOpponents, name]
  })),
  setActiveHero: (hero) => set({ activeHero: hero }),
  setActiveShip: (ship) => set((state) => {
      const maxTeammates = getShipCapacity(ship) - 1;
      const newTeammates = state.selectedTeammates.filter((_, i) => i < maxTeammates);
      return { activeShip: ship, selectedTeammates: newTeammates };
  }),
  setActiveWeapons: (weapons) => set({ activeWeapons: weapons }),
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
  setTimeMin: (val) => set({ timeMin: val }),
  setTimeSec: (val) => set({ timeSec: val }),
  setDamageTaken: (val) => set({ damageTaken: val }),
  setCurrentNote: (val) => set({ currentNote: val }),
  setPendingMatchData: (data) => set({ pendingMatchData: data }),
  setPendingSubType: (type) => set({ pendingSubType: type }),
  setPendingPlacement: (placement) => set({ pendingPlacement: placement }),
  setPendingArtifactType: (type) => set({ pendingArtifactType: type }),
  setShowWizard: (result) => set({ showWizard: result }),
  
  resetForm: () => set({
      poiEasy: 0, 
      poiMedium: 0, 
      poiEpic: 0, 
      kills: { "AI Legion": 0 }, 
      timeMin: "", 
      timeSec: "", 
      selectedReachModifiers: [], 
      damageTaken: "", 
      currentNote: "", 
      activeWeapons: {}
  })
});