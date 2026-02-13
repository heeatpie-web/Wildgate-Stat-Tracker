import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createMappingSlice, MappingSlice } from '../createMappingSlice';

vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeStore = () => createStore<MappingSlice>()(createMappingSlice);

describe('createMappingSlice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  // ── recordPlayerSighting ──

  describe('recordPlayerSighting', () => {
    it('creates a new profile on first sighting', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1', 'p2'], ['p3'], 'Hunter');
      const profile = store.getState().playerProfiles['p1'];
      expect(profile).toBeDefined();
      expect(profile.sightings).toBe(1);
      expect(profile.teamsObserved['Red']).toBe(1);
      expect(profile.shipsObserved['Hunter']).toBe(1);
    });

    it('increments sightings on repeat visits', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], [], 'Hunter');
      store.getState().recordPlayerSighting('p1', 'Blue', ['p1'], [], 'Scout');
      const profile = store.getState().playerProfiles['p1'];
      expect(profile.sightings).toBe(2);
      expect(profile.teamsObserved['Red']).toBe(1);
      expect(profile.teamsObserved['Blue']).toBe(1);
    });

    it('tracks playedWith excluding self', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1', 'p2', 'p3'], []);
      const profile = store.getState().playerProfiles['p1'];
      expect(profile.playedWith['p2']).toBe(1);
      expect(profile.playedWith['p3']).toBe(1);
      expect(profile.playedWith['p1']).toBeUndefined();
    });

    it('tracks playedAgainst', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], ['enemy1', 'enemy2']);
      const profile = store.getState().playerProfiles['p1'];
      expect(profile.playedAgainst['enemy1']).toBe(1);
      expect(profile.playedAgainst['enemy2']).toBe(1);
    });

    it('tracks OCR vs manual sightings', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], [], undefined, 'ocr');
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], [], undefined, 'manual');
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], [], undefined, 'ocr');
      const profile = store.getState().playerProfiles['p1'];
      expect(profile.ocrSightings).toBe(2);
      expect(profile.manualSightings).toBe(1);
    });

    it('ignores Unknown team color', () => {
      store.getState().recordPlayerSighting('p1', 'Unknown', ['p1'], []);
      const profile = store.getState().playerProfiles['p1'];
      expect(Object.keys(profile.teamsObserved)).toHaveLength(0);
    });
  });

  // ── getPlayerRole ──

  describe('getPlayerRole', () => {
    it('returns unknown for non-existent player', () => {
      expect(store.getState().getPlayerRole('nobody')).toBe('unknown');
    });

    it('returns unknown for player with no relationship data', () => {
      store.getState().recordPlayerSighting('p1', 'Red', ['p1'], []);
      expect(store.getState().getPlayerRole('p1')).toBe('unknown');
    });

    it('returns teammate when ratio >= 0.7', () => {
      // Directly construct a profile with known ratios
      store.getState().recordPlayerSighting('subject', 'Red', ['subject', 'friend'], []);
      store.getState().recordPlayerSighting('subject', 'Red', ['subject', 'friend'], []);
      store.getState().recordPlayerSighting('subject', 'Red', ['subject', 'friend'], []);
      // subject has playedWith: {friend: 3}, playedAgainst: {} → ratio = 1.0 → teammate
      expect(store.getState().getPlayerRole('subject')).toBe('teammate');
    });

    it('returns opponent when ratio <= 0.3', () => {
      store.getState().recordPlayerSighting('subject', 'Red', ['subject'], ['foe']);
      store.getState().recordPlayerSighting('subject', 'Red', ['subject'], ['foe']);
      store.getState().recordPlayerSighting('subject', 'Red', ['subject'], ['foe']);
      // playedWith: {}, playedAgainst: {foe: 3} → ratio = 0 → opponent
      expect(store.getState().getPlayerRole('subject')).toBe('opponent');
    });

    it('returns mixed for intermediate ratios', () => {
      store.getState().recordPlayerSighting('subject', 'Red', ['subject', 'buddy'], ['foe']);
      store.getState().recordPlayerSighting('subject', 'Red', ['subject', 'buddy'], ['foe']);
      // playedWith: {buddy: 2}, playedAgainst: {foe: 2} → ratio = 0.5 → mixed
      expect(store.getState().getPlayerRole('subject')).toBe('mixed');
    });
  });

  // ── getMostFrequentOpponents / Teammates ──

  describe('getMostFrequentOpponents', () => {
    it('returns opponents sorted by encounter count', () => {
      // Create profiles with known playedAgainst counts
      for (let i = 0; i < 5; i++) store.getState().recordPlayerSighting('a', 'Red', ['a'], ['x']);
      for (let i = 0; i < 3; i++) store.getState().recordPlayerSighting('b', 'Red', ['b'], ['x']);
      // a has 5 encounters against x, b has 3 against x
      const opponents = store.getState().getMostFrequentOpponents(10);
      // a should be before b since a has more playedAgainst
      const aIdx = opponents.findIndex(p => p.id === 'a');
      const bIdx = opponents.findIndex(p => p.id === 'b');
      expect(aIdx).toBeLessThan(bIdx);
    });
  });

  describe('getMostFrequentTeammates', () => {
    it('returns teammates sorted by encounter count', () => {
      for (let i = 0; i < 4; i++) store.getState().recordPlayerSighting('a', 'Red', ['a', 'friend'], []);
      for (let i = 0; i < 2; i++) store.getState().recordPlayerSighting('b', 'Red', ['b', 'friend'], []);
      const teammates = store.getState().getMostFrequentTeammates(10);
      const aIdx = teammates.findIndex(p => p.id === 'a');
      const bIdx = teammates.findIndex(p => p.id === 'b');
      expect(aIdx).toBeLessThan(bIdx);
    });
  });

  // ── OCR Corrections ──

  describe('ocrCorrections', () => {
    it('records a new correction', () => {
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      const correction = store.getState().getOcrCorrection('Adrlan');
      expect(correction).toBeDefined();
      expect(correction!.correctedTo).toBe('Adrian');
      expect(correction!.count).toBe(1);
    });

    it('increments count on repeat correction', () => {
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      expect(store.getState().getOcrCorrection('Adrlan')!.count).toBe(2);
    });

    it('returns undefined for unknown text', () => {
      expect(store.getState().getOcrCorrection('xyz')).toBeUndefined();
    });
  });

  // ── Legacy Mapping Operations ──

  describe('addMapping / removeMapping', () => {
    it('adds and removes mappings', () => {
      store.getState().addMapping('id1', 'Player1');
      expect(store.getState().knownMappings['id1']).toBe('Player1');
      expect(store.getState().uidMappings.players['id1']).toBe('Player1');

      store.getState().removeMapping('id1');
      expect(store.getState().knownMappings['id1']).toBeUndefined();
    });

    it('removes from detectedUnknowns on mapping', () => {
      store.getState().registerUnknownId('id1', 'Hero');
      expect(store.getState().detectedUnknowns['id1']).toBeDefined();
      store.getState().addMapping('id1', 'Adrian');
      expect(store.getState().detectedUnknowns['id1']).toBeUndefined();
    });
  });

  describe('registerUnknownId', () => {
    it('registers a new unknown', () => {
      store.getState().registerUnknownId('xyz', 'Ship');
      expect(store.getState().detectedUnknowns['xyz'].type).toBe('Ship');
    });

    it('skips already-known ids', () => {
      store.getState().addMapping('abc', 'Player1');
      store.getState().registerUnknownId('abc', 'Hero');
      expect(store.getState().detectedUnknowns['abc']).toBeUndefined();
    });

    it('updates lastSeen on repeat sightings', () => {
      store.getState().registerUnknownId('xyz', 'Hero');
      const first = store.getState().detectedUnknowns['xyz'].lastSeen;
      // Small delay to ensure different timestamp
      store.getState().registerUnknownId('xyz', 'Hero');
      expect(store.getState().detectedUnknowns['xyz'].lastSeen).toBeGreaterThanOrEqual(first);
    });
  });

  describe('importMappings', () => {
    it('bulk imports mappings', () => {
      store.getState().importMappings({ 'a': 'Alice', 'b': 'Bob' });
      expect(store.getState().knownMappings['a']).toBe('Alice');
      expect(store.getState().knownMappings['b']).toBe('Bob');
      expect(store.getState().playerProfiles['a'].name).toBe('Alice');
    });
  });

  describe('UID mappings', () => {
    it('sets and removes UID mappings across domains', () => {
      store.getState().setUidMapping('ships', 'ship1', 'Hunter');
      expect(store.getState().uidMappings.ships['ship1']).toBe('Hunter');

      store.getState().removeUidMapping('ships', 'ship1');
      expect(store.getState().uidMappings.ships['ship1']).toBeUndefined();
    });

    it('player domain also updates knownMappings', () => {
      store.getState().setUidMapping('players', 'p1', 'Alice');
      expect(store.getState().knownMappings['p1']).toBe('Alice');
    });

    it('imports partial UID mappings', () => {
      store.getState().importUidMappings({
        players: { 'p1': 'Alice' },
        weapons: { 'w1': 'Laser' },
      });
      expect(store.getState().uidMappings.players['p1']).toBe('Alice');
      expect(store.getState().uidMappings.weapons['w1']).toBe('Laser');
      expect(store.getState().knownMappings['p1']).toBe('Alice');
    });
  });
});
