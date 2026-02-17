import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createFormSlice, FormSlice } from '../createFormSlice';

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

    it('tracks telemetryDetectedHero regardless of priority', () => {
      store.getState().setActiveHero('Kae', 'manual');
      store.getState().setActiveHero('Ion', 'telemetry');
      // Hero should stay Kae (manual > telemetry) but telemetryDetectedHero should update
      expect(store.getState().activeHero).toBe('Kae');
      expect(store.getState().telemetryDetectedHero).toBe('Ion');
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

  // ── setActiveWeapons ──

  describe('setActiveWeapons', () => {
    it('saves to characterLoadouts for current hero', () => {
      store.getState().setActiveWeapons({ 'Blaster': 3 });
      const hero = store.getState().activeHero;
      expect(store.getState().characterLoadouts[hero]).toEqual({ 'Blaster': 3 });
    });
  });

  // ── resetForm ──

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
});
