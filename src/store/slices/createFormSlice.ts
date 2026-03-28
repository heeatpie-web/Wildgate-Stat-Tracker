import { StateCreator } from 'zustand';
import { CHARACTERS, SHIPS, KillMap, WizardResult } from '../../types';
import { DataSource, getPriority } from './createDataSlice';
import type { Loadout, Match } from '../../types';
import { capTeammateNames } from '../../utils/teamLimits';
import { buildActiveWeaponsFromLoadout, sanitizeLoadout } from '../../utils/loadout';
import Logger from '../../utils/logger';
import { normalizeMatchCategory } from '../../utils/matchCategory';

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

const IS_LOADOUT_TRACE_ENABLED = import.meta.env.DEV || process.env.NODE_ENV === 'test';

type FormSliceStoreState = FormSlice & {
    currentLoadout?: Loadout | null;
};

const traceLoadoutMutation = (action: string, detail: Record<string, unknown>) => {
    if (!IS_LOADOUT_TRACE_ENABLED) return;
    Logger.debug('FormSlice', action, detail);
};

const resolvePreservedHeroWeapons = (
    state: FormSlice,
    nextHero: string,
    currentLoadout: Loadout | null | undefined,
): Record<string, number> | null => {
    const normalizedNextHero = String(nextHero || '').trim().toLowerCase();
    if (!normalizedNextHero) return null;

    const pendingLoadout = sanitizeLoadout((state.pendingMatchData?.loadout as Loadout | null | undefined) ?? null);
    const normalizedPendingHero = String(pendingLoadout?.hero || '').trim().toLowerCase();
    if (pendingLoadout && normalizedPendingHero === normalizedNextHero) {
        return buildActiveWeaponsFromLoadout(pendingLoadout);
    }

    const liveLoadout = sanitizeLoadout(currentLoadout ?? null);
    const normalizedLiveHero = String(liveLoadout?.hero || '').trim().toLowerCase();
    if (!liveLoadout || normalizedLiveHero !== normalizedNextHero) return null;

    const nextWeapons = buildActiveWeaponsFromLoadout(liveLoadout);
    return Object.keys(nextWeapons).length > 0 ? nextWeapons : null;
};

const resolveMatchResetWeapons = (
    state: FormSlice,
    currentLoadout: Loadout | null | undefined,
): Record<string, number> => (
    resolvePreservedHeroWeapons(state, state.activeHero, currentLoadout)
    ?? state.characterLoadouts[state.activeHero]
    ?? {}
);

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
    currentMatchCategory: string;
    pendingMatchData: Partial<Match> | null;
    pendingSubType: string;
    pendingPlacement: number | null;
    pendingArtifactType: string;
    showWizard: WizardResult | null;
    wizardInitialTab: 'result' | 'ocr' | null;
    wizardCloseOnOcrApply: boolean;

    characterLoadouts: Record<string, Record<string, number>>;

    setSelectedTeammates: (teammates: string[] | ((curr: string[]) => string[])) => void;
    toggleTeammate: (name: string) => void;
    setSelectedOpponents: (opponents: string[] | ((curr: string[]) => string[])) => void;
    toggleOpponent: (name: string) => void;
    setActiveHero: (hero: string, source?: DataSource) => void;
    setActiveShip: (ship: string, source?: DataSource) => void;
    setActiveWeapons: (weapons: Record<string, number>, persistToCharacterLoadout?: boolean) => void;
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
    setCurrentMatchCategory: (val: string) => void;
    setPendingMatchData: (data: Partial<Match> | null) => void;
    setPendingSubType: (type: string) => void;
    setPendingPlacement: (placement: number | null) => void;
    setPendingArtifactType: (type: string) => void;
    setShowWizard: (result: WizardResult | null) => void;
    setWizardInitialTab: (tab: 'result' | 'ocr' | null) => void;
    setWizardCloseOnOcrApply: (value: boolean) => void;
    clearTelemetryDetected: () => void;
    resetSelectionSourcesForNewMatch: () => void;
    resetMatchTrackingForNewMatch: () => void;

    resetForm: () => void;
    discardMatch: () => void;
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
    currentMatchCategory: "",
    pendingMatchData: null,
    pendingSubType: '',
    pendingPlacement: null,
    pendingArtifactType: '',
    showWizard: null,
    wizardInitialTab: null,
    wizardCloseOnOcrApply: false,

    setSelectedTeammates: (teammates) => set((state) => {
        const nextTeammates = sanitizeTeammates(
            typeof teammates === 'function' ? teammates(state.selectedTeammates) : teammates,
            state.activeShip
        );
        return {
            selectedTeammates: nextTeammates,
            pendingMatchData: state.pendingMatchData
                ? { ...state.pendingMatchData, teammates: nextTeammates }
                : state.pendingMatchData,
        };
    }),
    toggleTeammate: (name) => set((state) => {
        const cleaned = String(name || '').trim();
        if (!cleaned) return {};
        const key = cleaned.toLowerCase();
        if (state.selectedTeammates.some((t) => t.toLowerCase() === key)) {
            const nextTeammates = state.selectedTeammates.filter((t) => t.toLowerCase() !== key);
            return {
                selectedTeammates: nextTeammates,
                pendingMatchData: state.pendingMatchData
                    ? { ...state.pendingMatchData, teammates: nextTeammates }
                    : state.pendingMatchData,
            };
        }
        const next = sanitizeTeammates([...state.selectedTeammates, cleaned], state.activeShip);
        if (next.length > state.selectedTeammates.length) {
            return {
                selectedTeammates: next,
                pendingMatchData: state.pendingMatchData
                    ? { ...state.pendingMatchData, teammates: next }
                    : state.pendingMatchData,
            };
        }
        return {};
    }),
    setSelectedOpponents: (opponents) => set((state) => {
        const nextOpponents = sanitizeNames(
            typeof opponents === 'function' ? opponents(state.selectedOpponents) : opponents
        );
        return {
            selectedOpponents: nextOpponents,
            pendingMatchData: state.pendingMatchData
                ? { ...state.pendingMatchData, opponents: nextOpponents }
                : state.pendingMatchData,
        };
    }),
    toggleOpponent: (name) => set((state) => {
        const cleaned = String(name || '').trim();
        const nextOpponents = (() => {
            if (!cleaned) return state.selectedOpponents;
            const key = cleaned.toLowerCase();
            if (state.selectedOpponents.some((o) => o.toLowerCase() === key)) {
                return state.selectedOpponents.filter((o) => o.toLowerCase() !== key);
            }
            return sanitizeNames([...state.selectedOpponents, cleaned]);
        })();
        return {
            selectedOpponents: nextOpponents,
            pendingMatchData: state.pendingMatchData
                ? { ...state.pendingMatchData, opponents: nextOpponents }
                : state.pendingMatchData,
        };
    }),
    setActiveHero: (hero, source = 'manual') => set((state) => {
        const telemetryUpdate = source === 'telemetry' ? { telemetryDetectedHero: hero } : {};
        const currentP = getPriority(state.heroSource);
        const newP = getPriority(source);
        const allowInitialTelemetryOverride = source === 'telemetry'
            && state.heroSource === 'manual'
            && !state.telemetryDetectedHero;
        if (newP >= currentP || !state.heroSource || allowInitialTelemetryOverride) {
            const sameHero = String(state.activeHero || '').trim().toLowerCase() === String(hero || '').trim().toLowerCase();
            const currentStoreState = get() as unknown as FormSliceStoreState;
            const preservedWeapons = sameHero
                ? state.activeWeapons
                : resolvePreservedHeroWeapons(state, hero, currentStoreState.currentLoadout);
            const nextActiveWeapons = sameHero
                ? state.activeWeapons
                : (preservedWeapons ?? state.characterLoadouts[hero] ?? {});
            traceLoadoutMutation('setActiveHero', {
                hero,
                source,
                sameHero,
                heroSource: state.heroSource,
                usedPreservedLoadout: preservedWeapons !== null,
                preservedWeaponCount: preservedWeapons ? Object.keys(preservedWeapons).length : 0,
                fallbackLoadoutWeaponCount: Object.keys(state.characterLoadouts[hero] || {}).length,
                nextWeaponCount: Object.keys(nextActiveWeapons || {}).length,
            });
            return {
                activeHero: hero,
                heroSource: source,
                activeWeapons: nextActiveWeapons,
                ...telemetryUpdate
            };
        }
        traceLoadoutMutation('setActiveHero:skipped', {
            hero,
            source,
            heroSource: state.heroSource,
            currentPriority: currentP,
            nextPriority: newP,
            allowInitialTelemetryOverride,
        });
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
            traceLoadoutMutation('setActiveShip', {
                ship,
                source,
                shipSource: state.shipSource,
                teammateCountBefore: state.selectedTeammates.length,
                teammateCountAfter: newTeammates.length,
            });
            return { activeShip: ship, shipSource: source, selectedTeammates: newTeammates, ...telemetryUpdate };
        }
        traceLoadoutMutation('setActiveShip:skipped', {
            ship,
            source,
            shipSource: state.shipSource,
            currentPriority: currentP,
            nextPriority: newP,
            allowInitialTelemetryOverride,
        });
        return telemetryUpdate;
    }),
    setActiveWeapons: (weapons, persistToCharacterLoadout = true) => set((state) => {
        traceLoadoutMutation('setActiveWeapons', {
            hero: state.activeHero,
            persistToCharacterLoadout,
            weaponCount: Object.keys(weapons || {}).length,
        });
        return {
            activeWeapons: weapons,
            characterLoadouts: persistToCharacterLoadout
                ? {
                    ...state.characterLoadouts,
                    [state.activeHero]: weapons
                }
                : state.characterLoadouts
        };
    }),
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
    setCurrentMatchCategory: (val) => set((state) => {
        const nextCategory = normalizeMatchCategory(val);
        return {
            currentMatchCategory: nextCategory,
            pendingMatchData: state.pendingMatchData
                ? {
                    ...state.pendingMatchData,
                    matchCategory: nextCategory || undefined,
                }
                : state.pendingMatchData,
        };
    }),
    setPendingMatchData: (data) => set({ pendingMatchData: data }),
    setPendingSubType: (type) => set((state) => ({
        pendingSubType: type,
        pendingMatchData: state.pendingMatchData
            ? { ...state.pendingMatchData, subType: type || undefined }
            : state.pendingMatchData,
    })),
    setPendingPlacement: (placement) => set((state) => ({
        pendingPlacement: placement,
        pendingMatchData: state.pendingMatchData
            ? { ...state.pendingMatchData, placement: placement ?? undefined }
            : state.pendingMatchData,
    })),
    setPendingArtifactType: (type) => set((state) => ({
        pendingArtifactType: type,
        pendingMatchData: state.pendingMatchData
            ? { ...state.pendingMatchData, artifactSource: type || undefined }
            : state.pendingMatchData,
    })),
    setWizardInitialTab: (tab) => set(() => ({ wizardInitialTab: tab })),
    setWizardCloseOnOcrApply: (value) => set(() => ({ wizardCloseOnOcrApply: value })),
    setShowWizard: (result) => set((state) => ({
        showWizard: result,
        wizardInitialTab: result === null ? null : state.wizardInitialTab,
        wizardCloseOnOcrApply: result === null ? false : state.wizardCloseOnOcrApply,
        pendingMatchData: state.pendingMatchData
            ? {
                ...state.pendingMatchData,
                result: result === 'Win' || result === 'Loss' || result === 'Draw'
                    ? result
                    : undefined,
              }
            : state.pendingMatchData,
    })),
    clearTelemetryDetected: () => set({ telemetryDetectedHero: undefined, telemetryDetectedShip: undefined }),
    resetSelectionSourcesForNewMatch: () => set({
        heroSource: undefined,
        shipSource: undefined,
    }),
    resetMatchTrackingForNewMatch: () => set({
        selectedReachModifiers: [],
        modifiersSource: undefined,
        kills: { "AI Legion": 0 },
        poiEasy: 0,
        poiMedium: 0,
        poiEpic: 0,
        elims: "",
        currentNote: "",
    }),

    resetForm: () => set((state) => {
        const currentStoreState = get() as unknown as FormSliceStoreState;
        const restoredWeapons = resolveMatchResetWeapons(state, currentStoreState.currentLoadout);
        traceLoadoutMutation('resetForm', {
            hero: state.activeHero,
            restoredWeaponCount: Object.keys(restoredWeapons).length,
            usedCurrentLoadout: Object.keys(restoredWeapons).length > 0
                && Object.keys(state.characterLoadouts[state.activeHero] || {}).length === 0,
        });
        return {
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
            activeWeapons: restoredWeapons
        };
    }),

    discardMatch: () => set((state) => {
        const currentStoreState = get() as unknown as FormSliceStoreState;
        const restoredWeapons = resolveMatchResetWeapons(state, currentStoreState.currentLoadout);
        traceLoadoutMutation('discardMatch', {
            hero: state.activeHero,
            restoredWeaponCount: Object.keys(restoredWeapons).length,
            usedCurrentLoadout: Object.keys(restoredWeapons).length > 0
                && Object.keys(state.characterLoadouts[state.activeHero] || {}).length === 0,
        });
        return {
            // Everything resetForm does
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
            activeWeapons: restoredWeapons,
            // Full discard: clear teammates, opponents, pending data, timer
            selectedTeammates: [],
            selectedOpponents: [],
            pendingMatchData: null,
            pendingSubType: '',
            pendingPlacement: null,
            pendingArtifactType: '',
            showWizard: null,
            wizardInitialTab: null,
            wizardCloseOnOcrApply: false,
            matchStartTime: null,
            isMatchInProgress: false,
        };
    }),
});
