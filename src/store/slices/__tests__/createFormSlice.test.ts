import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createFormSlice, FormSlice } from '../createFormSlice';
import type { Loadout } from '../../../types';

const makeStore = () => createStore<FormSlice>()(createFormSlice);

describe('createFormSlice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  // ── toggleTeammate ──

  describe('toggleTeammate', () => {
    it('adds a teammate', () => {
      store.getState().toggleTeammate('Alice');
      expect(store.getState().selectedTeammates).toContain('Alice');
    });

    it('removes an existing teammate', () => {
      store.getState().toggleTeammate('Alice');
      store.getState().toggleTeammate('Alice');
      expect(store.getState().selectedTeammates).not.toContain('Alice');
    });

    it('enforces ship capacity limits', () => {
      // Default ship is Hunter (4 Player) → capacity 4 → max teammates 3
      store.getState().toggleTeammate('A');
      store.getState().toggleTeammate('B');
      store.getState().toggleTeammate('C');
      store.getState().toggleTeammate('D'); // should be rejected (4th teammate exceeds cap)
      expect(store.getState().selectedTeammates).toHaveLength(3);
      expect(store.getState().selectedTeammates).not.toContain('D');
    });

    it('uses a safe 4-player fallback when ship capacity is unknown', () => {
      store.getState().setActiveShip('Unknown Ship');
      store.getState().toggleTeammate('A');
      store.getState().toggleTeammate('B');
      store.getState().toggleTeammate('C');
      store.getState().toggleTeammate('D');
      expect(store.getState().selectedTeammates).toEqual(['A', 'B', 'C']);
    });

    it('allows more teammates on larger ships', () => {
      // Hunter (4 Player) → max 3 teammates
      store.getState().toggleTeammate('A');
      store.getState().toggleTeammate('B');
      store.getState().toggleTeammate('C');
      expect(store.getState().selectedTeammates).toHaveLength(3);
    });
  });

  // ── toggleOpponent ──

  describe('setSelectedTeammates', () => {
    it('dedupes case-insensitively and enforces teammate cap', () => {
      store.getState().setSelectedTeammates(['Alice', 'alice', 'Bob', 'Charlie', 'Delta']);
      expect(store.getState().selectedTeammates).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('prevents updater-based OCR inputs from overflowing teammate cap', () => {
      store.getState().setSelectedTeammates(['A', 'B', 'C']);
      store.getState().setSelectedTeammates((curr) => [...curr, 'D', 'E', 'F']);
      expect(store.getState().selectedTeammates).toEqual(['A', 'B', 'C']);
    });

    it('keeps pendingMatchData teammates in sync with manual edits', () => {
      store.getState().setPendingMatchData({ id: 42, teammates: [], opponents: [] });
      store.getState().setSelectedTeammates(['Wing1', 'Wing2']);
      expect(store.getState().pendingMatchData?.teammates).toEqual(['Wing1', 'Wing2']);
    });
  });

  describe('toggleOpponent', () => {
    it('adds and removes opponents without capacity limit', () => {
      store.getState().toggleOpponent('E1');
      store.getState().toggleOpponent('E2');
      expect(store.getState().selectedOpponents).toHaveLength(2);
      store.getState().toggleOpponent('E1');
      expect(store.getState().selectedOpponents).toEqual(['E2']);
    });

    it('dedupes opponents case-insensitively in setter and toggle', () => {
      store.getState().setSelectedOpponents(['Enemy', 'enemy', 'ENEMY', 'Bandit']);
      expect(store.getState().selectedOpponents).toEqual(['Enemy', 'Bandit']);
      store.getState().toggleOpponent('enemy');
      expect(store.getState().selectedOpponents).toEqual(['Bandit']);
    });

    it('keeps pendingMatchData opponents in sync when toggling', () => {
      store.getState().setPendingMatchData({ id: 7, teammates: [], opponents: [] });
      store.getState().toggleOpponent('EnemyA');
      expect(store.getState().pendingMatchData?.opponents).toEqual(['EnemyA']);
      store.getState().toggleOpponent('EnemyA');
      expect(store.getState().pendingMatchData?.opponents).toEqual([]);
    });
  });

  // ── setActiveHero (Sourced) ──

  describe('setActiveHero', () => {
    it('sets hero with default manual source', () => {
      store.getState().setActiveHero('Kae');
      expect(store.getState().activeHero).toBe('Kae');
      expect(store.getState().heroSource).toBe('manual');
    });

    it('ocr cannot overwrite manual hero', () => {
      store.getState().setActiveHero('Kae', 'manual');
      store.getState().setActiveHero('Ion', 'ocr');
      expect(store.getState().activeHero).toBe('Kae');
    });

    it('manual can overwrite telemetry hero', () => {
      store.getState().setActiveHero('Kae', 'telemetry');
      store.getState().setActiveHero('Ion', 'manual');
      expect(store.getState().activeHero).toBe('Ion');
    });

    it('lets first telemetry hero override stale manual startup selection', () => {
      store.getState().setActiveHero('Kae', 'manual');
      store.getState().setActiveHero('Ion', 'telemetry');
      expect(store.getState().activeHero).toBe('Ion');
      expect(store.getState().telemetryDetectedHero).toBe('Ion');
    });

    it('respects manual hero override after telemetry baseline is established', () => {
      store.getState().setActiveHero('Kae', 'telemetry');
      store.getState().setActiveHero('Ion', 'manual');
      store.getState().setActiveHero('Cato', 'telemetry');
      expect(store.getState().activeHero).toBe('Ion');
      expect(store.getState().telemetryDetectedHero).toBe('Cato');
    });

    it('syncs activeWeapons from characterLoadouts', () => {
      // Set up a saved loadout
      store.getState().setActiveHero('Kae');
      store.getState().setActiveWeapons({ 'Laser': 1, 'Missile': 2 });
      // Now switch hero to someone else
      store.getState().setActiveHero('Ion');
      expect(store.getState().activeWeapons).toEqual({});
      // Switch back to Kae
      store.getState().setActiveHero('Kae');
      expect(store.getState().activeWeapons).toEqual({ 'Laser': 1, 'Missile': 2 });
    });

    it('keeps activeWeapons intact when telemetry reselects the same hero', () => {
      store.getState().setActiveHero('Kae');
      store.getState().setActiveWeapons({ 'Laser': 1, 'Missile': 2 });

      store.getState().setActiveHero('Kae', 'telemetry');

      expect(store.getState().activeWeapons).toEqual({ 'Laser': 1, 'Missile': 2 });
    });

    it('preserves pending draft loadout weapons when switching to that hero', () => {
      const pendingLoadout: Loadout = {
        hero: 'Ion',
        ship: 'Scout (3 Player)',
        weapons: [],
        equipment: [],
        characterWeapons: ['Scattergun'],
        characterEquipment: ['Repair Drone'],
      };
      store.getState().setActiveHero('Kae');
      store.getState().setActiveWeapons({ 'Laser': 1 });
      store.getState().setPendingMatchData({ id: 42, loadout: pendingLoadout });

      store.getState().setActiveHero('Ion');

      expect(store.getState().activeWeapons).toEqual({
        Scattergun: 1,
        'Repair Drone': 1,
      });
    });

    it('preserves current loadout weapons when switching to a matching hero', () => {
      (store as unknown as { setState: (value: unknown) => void }).setState({
        currentLoadout: {
          hero: 'Ion',
          ship: 'Scout (3 Player)',
          weapons: [],
          equipment: [],
          characterWeapons: ['The Doctor'],
          characterEquipment: ['Shield Matrix'],
        } satisfies Loadout,
      });

      store.getState().setActiveHero('Ion');

      expect(store.getState().activeWeapons).toEqual({
        'The Doctor': 1,
        'Shield Matrix': 1,
      });
    });
  });

  // ── setActiveShip (Sourced) ──

  describe('setActiveShip', () => {
    it('trims teammates when switching to smaller ship', () => {
      // Start with Hunter (4 Player) → 3 teammates max
      store.getState().toggleTeammate('A');
      store.getState().toggleTeammate('B');
      store.getState().toggleTeammate('C');
      expect(store.getState().selectedTeammates).toHaveLength(3);

      // Switch to Outlaw (2 Player) → 1 teammate max
      store.getState().setActiveShip('Outlaw (2 Player)');
      expect(store.getState().selectedTeammates).toHaveLength(1);
    });

    it('tracks telemetryDetectedShip', () => {
      store.getState().setActiveShip('Scout (3 Player)', 'telemetry');
      expect(store.getState().telemetryDetectedShip).toBe('Scout (3 Player)');
    });

    it('lets first telemetry ship override stale manual startup selection', () => {
      store.getState().setActiveShip('Hunter (4 Player)', 'manual');
      store.getState().setActiveShip('Scout (3 Player)', 'telemetry');
      expect(store.getState().activeShip).toBe('Scout (3 Player)');
      expect(store.getState().telemetryDetectedShip).toBe('Scout (3 Player)');
    });

    it('respects manual ship override after telemetry baseline is established', () => {
      store.getState().setActiveShip('Scout (3 Player)', 'telemetry');
      store.getState().setActiveShip('Outlaw (2 Player)', 'manual');
      store.getState().setActiveShip('Hunter (4 Player)', 'telemetry');
      expect(store.getState().activeShip).toBe('Outlaw (2 Player)');
      expect(store.getState().telemetryDetectedShip).toBe('Hunter (4 Player)');
    });
  });

  // ── setSelectedReachModifiers (Sourced) ──

  describe('setSelectedReachModifiers', () => {
    it('follows priority rules', () => {
      store.getState().setSelectedReachModifiers(['Ice Storm'], 'telemetry');
      store.getState().setSelectedReachModifiers(['Sandstorm'], 'ocr');
      // ocr < telemetry → should keep Ice Storm
      expect(store.getState().selectedReachModifiers).toEqual(['Ice Storm']);
    });
  });

  // ── toggleReachModifier ──

  describe('toggleReachModifier', () => {
    it('toggles modifiers on and off', () => {
      store.getState().toggleReachModifier('Ice Storm');
      expect(store.getState().selectedReachModifiers).toContain('Ice Storm');
      store.getState().toggleReachModifier('Ice Storm');
      expect(store.getState().selectedReachModifiers).not.toContain('Ice Storm');
    });
  });

  describe('setCurrentMatchCategory', () => {
    it('normalizes the category and keeps pending match data in sync', () => {
      store.getState().setPendingMatchData({ id: 88, matchCategory: undefined });

      store.getState().setCurrentMatchCategory('  Spring   Invitational  ');

      expect(store.getState().currentMatchCategory).toBe('Spring Invitational');
      expect(store.getState().pendingMatchData?.matchCategory).toBe('Spring Invitational');
    });
  });

  // ── setActiveWeapons ──

  describe('setActiveWeapons', () => {
    it('saves to characterLoadouts for current hero', () => {
      store.getState().setActiveWeapons({ 'Blaster': 3 });
      const hero = store.getState().activeHero;
      expect(store.getState().characterLoadouts[hero]).toEqual({ 'Blaster': 3 });
    });

    it('can clear active weapons without wiping the saved hero loadout', () => {
      store.getState().setActiveHero('Kae');
      store.getState().setActiveWeapons({ 'Blaster': 3 });

      store.getState().setActiveWeapons({}, false);

      expect(store.getState().activeWeapons).toEqual({});
      expect(store.getState().characterLoadouts.Kae).toEqual({ 'Blaster': 3 });
    });
  });

  // ── resetForm ──

  describe('resetSelectionSourcesForNewMatch', () => {
    it('allows fresh telemetry baseline while preserving current selections', () => {
      store.getState().setActiveHero('Kae', 'telemetry');
      store.getState().setActiveShip('Scout (3 Player)', 'telemetry');
      store.getState().setActiveHero('Ion', 'manual');
      store.getState().setActiveShip('Outlaw (2 Player)', 'manual');

      store.getState().resetSelectionSourcesForNewMatch();

      expect(store.getState().activeHero).toBe('Ion');
      expect(store.getState().activeShip).toBe('Outlaw (2 Player)');
      expect(store.getState().heroSource).toBeUndefined();
      expect(store.getState().shipSource).toBeUndefined();

      store.getState().setActiveHero('Adrian', 'telemetry');
      store.getState().setActiveShip('Hunter (4 Player)', 'telemetry');

      expect(store.getState().activeHero).toBe('Adrian');
      expect(store.getState().activeShip).toBe('Hunter (4 Player)');
      expect(store.getState().heroSource).toBe('telemetry');
      expect(store.getState().shipSource).toBe('telemetry');
    });
  });

  describe('resetMatchTrackingForNewMatch', () => {
    it('clears match-scoped tracking fields while leaving roster and loadout alone', () => {
      store.getState().toggleTeammate('Wingman');
      store.getState().setSelectedReachModifiers(['Ice Storm'], 'manual');
      store.getState().setKills({ 'AI Legion': 3 });
      store.getState().setPoiEasy(2);
      store.getState().setPoiMedium(1);
      store.getState().setPoiEpic(1);
      store.getState().setCurrentNote('old note');
      store.getState().setCurrentMatchCategory('Weekly Cup');

      store.getState().resetMatchTrackingForNewMatch();

      expect(store.getState().selectedTeammates).toEqual(['Wingman']);
      expect(store.getState().selectedReachModifiers).toEqual([]);
      expect(store.getState().modifiersSource).toBeUndefined();
      expect(store.getState().kills).toEqual({ 'AI Legion': 0 });
      expect(store.getState().poiEasy).toBe(0);
      expect(store.getState().poiMedium).toBe(0);
      expect(store.getState().poiEpic).toBe(0);
      expect(store.getState().currentNote).toBe('');
      // Regression: the category draft must NOT carry over into the next
      // match — it is a per-match tag, not a session default.
      expect(store.getState().currentMatchCategory).toBe('');
    });
  });

  describe('resetForm', () => {
    it('resets form fields but restores hero loadout', () => {
      store.getState().setActiveHero('Kae');
      store.getState().setActiveWeapons({ 'Laser': 1 });
      store.getState().setElims('5');
      store.getState().setCurrentNote('test note');
      store.getState().setPoiEasy(3);

      store.getState().resetForm();

      expect(store.getState().elims).toBe('');
      expect(store.getState().currentNote).toBe('');
      expect(store.getState().poiEasy).toBe(0);
      expect(store.getState().selectedReachModifiers).toEqual([]);
      // Weapons should be restored from saved loadout
      expect(store.getState().activeWeapons).toEqual({ 'Laser': 1 });
    });
  });

  describe('discardMatch', () => {
    it('restores weapons from currentLoadout when saved hero loadouts are stale or empty', () => {
      (store as unknown as { setState: (value: unknown) => void }).setState({
        activeHero: 'Ion',
        currentLoadout: {
          hero: 'Ion',
          ship: 'Scout (3 Player)',
          weapons: [],
          equipment: [],
          characterWeapons: ['Scattergun'],
          characterEquipment: ['Shield Matrix'],
        } satisfies Loadout,
        characterLoadouts: {},
        activeWeapons: {},
        pendingMatchData: { id: 42, teammates: ['Wing1'], opponents: ['Enemy1'] },
        showWizard: 'Win',
        matchStartTime: Date.now(),
        isMatchInProgress: true,
      });

      store.getState().discardMatch();

      expect(store.getState().activeWeapons).toEqual({
        Scattergun: 1,
        'Shield Matrix': 1,
      });
      expect(store.getState().selectedTeammates).toEqual([]);
      expect(store.getState().selectedOpponents).toEqual([]);
      expect(store.getState().pendingMatchData).toBeNull();
      expect(store.getState().showWizard).toBeNull();
      expect(store.getState().isMatchInProgress).toBe(false);
    });

    it('preserves the active telemetry-selected hero and ship while clearing selection sources', () => {
      (store as unknown as { setState: (value: unknown) => void }).setState({
        currentLoadout: {
          hero: 'Ion',
          ship: 'Scout (3 Player)',
          weapons: [],
          equipment: [],
          characterWeapons: ['The Doctor'],
          characterEquipment: ['Repair Drone'],
        } satisfies Loadout,
      });

      store.getState().setActiveHero('Ion', 'telemetry');
      store.getState().setActiveShip('Scout (3 Player)', 'telemetry');
      store.getState().setCurrentNote('discard me');
      store.getState().setCurrentMatchCategory('Scrim Block');
      store.getState().toggleTeammate('Wing1');

      store.getState().discardMatch();

      expect(store.getState().activeHero).toBe('Ion');
      expect(store.getState().activeShip).toBe('Scout (3 Player)');
      expect(store.getState().heroSource).toBeUndefined();
      expect(store.getState().shipSource).toBeUndefined();
      expect(store.getState().telemetryDetectedHero).toBeUndefined();
      expect(store.getState().telemetryDetectedShip).toBeUndefined();
      expect(store.getState().activeWeapons).toEqual({
        'The Doctor': 1,
        'Repair Drone': 1,
      });
      expect(store.getState().currentNote).toBe('');
      // Regression: discardMatch() runs after every submit/discard path
      // (via clearSubmissionState) — the category draft must reset so the
      // next match doesn't silently inherit this one's tag.
      expect(store.getState().currentMatchCategory).toBe('');
      expect(store.getState().selectedTeammates).toEqual([]);
    });
  });

  describe('category carry-over regression', () => {
    it('does not leak a tagged category into the next match after discardMatch', () => {
      store.getState().setCurrentMatchCategory('Ranked');
      expect(store.getState().currentMatchCategory).toBe('Ranked');

      // Match A submitted/discarded — every save path funnels through
      // clearSubmissionState(), which calls discardMatch().
      store.getState().discardMatch();

      // Match B begins untouched — must not inherit "Ranked".
      expect(store.getState().currentMatchCategory).toBe('');
    });

    it('does not leak a tagged category into the next match after resetMatchTrackingForNewMatch', () => {
      store.getState().setCurrentMatchCategory('Ranked');

      // "Start Fresh Match" path.
      store.getState().resetMatchTrackingForNewMatch();

      expect(store.getState().currentMatchCategory).toBe('');
    });
  });
});
