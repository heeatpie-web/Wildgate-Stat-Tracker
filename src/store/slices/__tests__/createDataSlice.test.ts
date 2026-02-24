import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createDataSlice, DataSlice, getPriority } from '../createDataSlice';
import type { Match } from '../../../types';

// ── Helpers ──

const createMatch = (overrides: Partial<Match> = {}): Match => ({
  id: Date.now(),
  timestamp: Date.now(),
  date: new Date().toISOString(),
  mode: 'Artifact Brawl',
  player: 'TestPlayer',
  teammates: ['Ally1', 'Ally2'],
  opponents: ['Enemy1'],
  hero: 'Adrian',
  ship: 'Hunter (4 Player)',
  reachModifiers: [],
  kills: { 'AI Legion': 2 },
  result: 'Win',
  subType: '',
  ...overrides,
});

const makeStore = () => createStore<DataSlice>()(createDataSlice);

// ── Tests ──

describe('getPriority', () => {
  it('returns correct priority values', () => {
    expect(getPriority('manual')).toBe(3);
    expect(getPriority('telemetry')).toBe(2);
    expect(getPriority('ocr')).toBe(1);
  });

  it('defaults to manual when undefined', () => {
    expect(getPriority(undefined)).toBe(3);
  });

  it('returns 0 for unknown sources', () => {
    expect(getPriority('bogus' as any)).toBe(0);
  });
});

describe('createDataSlice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  // ── Match CRUD ──

  describe('match operations', () => {
    it('adds a match to the front of the list', () => {
      const m = createMatch({ id: 1 });
      store.getState().addMatch(m);
      expect(store.getState().matches).toHaveLength(1);
      expect(store.getState().matches[0].id).toBe(1);
    });

    it('prepends newer matches', () => {
      store.getState().addMatch(createMatch({ id: 1 }));
      store.getState().addMatch(createMatch({ id: 2 }));
      expect(store.getState().matches[0].id).toBe(2);
    });

    it('updates an existing match by id', () => {
      store.getState().addMatch(createMatch({ id: 1, result: 'Win' }));
      store.getState().updateMatch(createMatch({ id: 1, result: 'Loss' }));
      expect(store.getState().matches[0].result).toBe('Loss');
    });

    it('extracts artifact source from reach modifiers and strips artifact-prefixed modifier entries', () => {
      store.getState().addMatch(createMatch({
        id: 99,
        reachModifiers: ['Artifact: Ancient Relic', 'High Gravity'],
      }));
      const saved = store.getState().matches[0];
      expect(saved.artifactSource).toBe('Ancient Relic');
      expect(saved.reachModifiers).toEqual(['High Gravity']);
    });

    it('assigns stable canonical match numbers to new matches', () => {
      store.getState().addMatch(createMatch({ id: 1 }));
      store.getState().addMatch(createMatch({ id: 2 }));
      const [latest, first] = store.getState().matches;
      expect(first.canonicalMatchNumber).toBe(1);
      expect(latest.canonicalMatchNumber).toBe(2);
      expect(store.getState().nextCanonicalMatchNumber).toBe(3);
    });

    it('preserves canonical match number on update when omitted', () => {
      store.getState().addMatch(createMatch({ id: 7 }));
      const initial = store.getState().matches[0];
      expect(initial.canonicalMatchNumber).toBe(1);
      store.getState().updateMatch({ ...initial, result: 'Loss', canonicalMatchNumber: undefined });
      const updated = store.getState().matches[0];
      expect(updated.canonicalMatchNumber).toBe(1);
      expect(updated.result).toBe('Loss');
    });

    it('backfills missing canonical numbers in setMatches and keeps next counter monotonic', () => {
      const matches = [
        createMatch({ id: 11, timestamp: 1000, canonicalMatchNumber: 4 }),
        createMatch({ id: 12, timestamp: 900 }),
        createMatch({ id: 13, timestamp: 1100 }),
      ];
      store.getState().setMatches(matches);
      const state = store.getState();
      const byId = new Map(state.matches.map((match) => [match.id, match]));
      expect(byId.get(11)?.canonicalMatchNumber).toBe(4);
      expect(byId.get(12)?.canonicalMatchNumber).toBe(5);
      expect(byId.get(13)?.canonicalMatchNumber).toBe(6);
      expect(state.nextCanonicalMatchNumber).toBe(7);
    });

    it('deletes a match by id', () => {
      store.getState().addMatch(createMatch({ id: 1 }));
      store.getState().addMatch(createMatch({ id: 2 }));
      store.getState().deleteMatch(1);
      expect(store.getState().matches).toHaveLength(1);
      expect(store.getState().matches[0].id).toBe(2);
    });

    it('toggles match pin', () => {
      store.getState().addMatch(createMatch({ id: 1 }));
      expect(store.getState().matches[0].isPinned).toBeFalsy();
      store.getState().toggleMatchPin(1);
      expect(store.getState().matches[0].isPinned).toBe(true);
      store.getState().toggleMatchPin(1);
      expect(store.getState().matches[0].isPinned).toBe(false);
    });
  });

  // ── Pilot Registry ──

  describe('pilotRegistry', () => {
    it('adds unique names to registry', () => {
      store.getState().addToRegistry('Alice');
      store.getState().addToRegistry('Bob');
      store.getState().addToRegistry('Alice'); // duplicate
      expect(store.getState().pilotRegistry).toEqual(['Alice', 'Bob']);
    });

    it('removes names from registry', () => {
      store.getState().addToRegistry('Alice');
      store.getState().addToRegistry('Bob');
      store.getState().removeFromRegistry('Alice');
      expect(store.getState().pilotRegistry).toEqual(['Bob']);
    });
  });

  // ── Favorites ──

  describe('toggleFavorite', () => {
    it('adds and removes favorites', () => {
      store.getState().toggleFavorite('Alice');
      expect(store.getState().favorites).toContain('Alice');
      store.getState().toggleFavorite('Alice');
      expect(store.getState().favorites).not.toContain('Alice');
    });
  });

  // ── Pilot Notes ──

  describe('updatePilotNote', () => {
    it('sets a note for a pilot', () => {
      store.getState().updatePilotNote('Alice', 'Good teammate');
      expect(store.getState().pilotNotes['Alice']).toBe('Good teammate');
    });
  });

  // ── Sourced Setters (Priority System) ──

  describe('sourced setters', () => {
    it('accepts the first value regardless of source', () => {
      store.getState().setTimeMin('05', 'ocr');
      expect(store.getState().timeMin).toBe('05');
    });

    it('ocr cannot overwrite telemetry', () => {
      store.getState().setTimeMin('05', 'telemetry');
      store.getState().setTimeMin('10', 'ocr');
      expect(store.getState().timeMin).toBe('05');
    });

    it('manual can overwrite telemetry', () => {
      store.getState().setTimeMin('05', 'telemetry');
      store.getState().setTimeMin('10', 'manual');
      expect(store.getState().timeMin).toBe('10');
    });

    it('telemetry can overwrite ocr', () => {
      store.getState().setTimeSec('30', 'ocr');
      store.getState().setTimeSec('45', 'telemetry');
      expect(store.getState().timeSec).toBe('45');
    });

    it('same priority overwrites (equal-priority update)', () => {
      store.getState().setDamageTaken('100', 'telemetry');
      store.getState().setDamageTaken('200', 'telemetry');
      expect(store.getState().damageTaken).toBe('200');
    });

    it('sessionShipTypes follows priority rules', () => {
      store.getState().setSessionShipTypes({ 'TeamA': 'Hunter' }, 'telemetry');
      store.getState().setSessionShipTypes({ 'TeamB': 'Scout' }, 'ocr');
      // ocr < telemetry, should NOT overwrite
      expect(store.getState().sessionShipTypes).toEqual({ 'TeamA': 'Hunter' });
    });
  });

  // ── Rename Pilot ──

  describe('renamePilot', () => {
    it('renames across registry, players, favorites, notes, and matches', () => {
      store.getState().addToRegistry('OldName');
      store.getState().addPlayer('OldName');
      store.getState().toggleFavorite('OldName');
      store.getState().updatePilotNote('OldName', 'a note');
      store.getState().addMatch(createMatch({
        id: 1,
        player: 'OldName',
        teammates: ['OldName', 'Other'],
        opponents: ['OldName']
      }));

      store.getState().renamePilot('OldName', 'NewName');

      const s = store.getState();
      expect(s.pilotRegistry).toContain('NewName');
      expect(s.pilotRegistry).not.toContain('OldName');
      expect(s.players).toContain('NewName');
      expect(s.favorites).toContain('NewName');
      expect(s.pilotNotes['NewName']).toBe('a note');
      expect(s.pilotNotes['OldName']).toBeUndefined();
      expect(s.matches[0].player).toBe('NewName');
      expect(s.matches[0].teammates).toContain('NewName');
      expect(s.matches[0].opponents).toContain('NewName');
    });
  });

  // ── Merge Pilots ──

  describe('mergePilots', () => {
    it('replaces source with target in matches', () => {
      store.getState().addMatch(createMatch({ id: 1, player: 'DupePlayer', teammates: ['DupePlayer'] }));
      store.getState().addToRegistry('DupePlayer');
      store.getState().addToRegistry('RealPlayer');

      store.getState().mergePilots('DupePlayer', 'RealPlayer');

      const s = store.getState();
      expect(s.matches[0].player).toBe('RealPlayer');
      expect(s.matches[0].teammates).toContain('RealPlayer');
      expect(s.pilotRegistry).toContain('RealPlayer');
      expect(s.pilotRegistry).not.toContain('DupePlayer');
    });

    it('merges notes by appending', () => {
      store.getState().updatePilotNote('Dupe', 'Note A');
      store.getState().updatePilotNote('Real', 'Note B');
      store.getState().mergePilots('Dupe', 'Real');
      expect(store.getState().pilotNotes['Real']).toContain('Note A');
      expect(store.getState().pilotNotes['Real']).toContain('Note B');
    });

    it('creates merge history entry', () => {
      store.getState().addToRegistry('A');
      store.getState().addToRegistry('B');
      store.getState().mergePilots('A', 'B');
      expect(store.getState().mergeHistory).toHaveLength(1);
      expect(store.getState().mergeHistory[0].sourceName).toBe('A');
      expect(store.getState().mergeHistory[0].targetName).toBe('B');
    });

    it('limits merge history to 10 entries', () => {
      for (let i = 0; i < 12; i++) {
        store.getState().addToRegistry(`src${i}`);
        store.getState().mergePilots(`src${i}`, 'target');
      }
      expect(store.getState().mergeHistory.length).toBeLessThanOrEqual(10);
    });

    it('updates playerIdMap entries pointing to source', () => {
      store.getState().updatePlayerIdMapping('abc-123', 'OldName');
      store.getState().mergePilots('OldName', 'NewName');
      expect(store.getState().playerIdMap['abc-123']).toBe('NewName');
    });

    it('clears pending reviews referencing source name', () => {
      store.getState().addPendingReview({
        id: 'r1', type: 'player_name', value: 'OldName', originalConfidence: 70
      });
      store.getState().addPendingReview({
        id: 'r2', type: 'player_name', value: 'SomeoneElse', originalConfidence: 80
      });
      store.getState().mergePilots('OldName', 'NewName');
      const reviews = store.getState().pendingReviews;
      expect(reviews).toHaveLength(1);
      expect(reviews[0].value).toBe('SomeoneElse');
    });
  });

  // ── Undo Last Merge ──

  describe('undoLastMerge', () => {
    it('restores state from before the merge', () => {
      store.getState().addToRegistry('A');
      store.getState().addToRegistry('B');
      store.getState().addMatch(createMatch({ id: 1, player: 'A' }));

      store.getState().mergePilots('A', 'B');
      expect(store.getState().matches[0].player).toBe('B');

      const result = store.getState().undoLastMerge();
      expect(result).toBe(true);
      expect(store.getState().matches[0].player).toBe('A');
      expect(store.getState().pilotRegistry).toContain('A');
    });

    it('returns false when no history', () => {
      expect(store.getState().undoLastMerge()).toBe(false);
    });
  });

  // ── Pending Reviews ──

  describe('pending reviews', () => {
    it('adds and removes pending reviews', () => {
      store.getState().addPendingReview({ id: '1', type: 'player_name', value: 'test', originalConfidence: 50 });
      expect(store.getState().pendingReviews).toHaveLength(1);
      store.getState().removePendingReview('1');
      expect(store.getState().pendingReviews).toHaveLength(0);
    });

    it('clears all pending reviews', () => {
      store.getState().addPendingReview({ id: '1', type: 'player_name', value: 'a', originalConfidence: 50 });
      store.getState().addPendingReview({ id: '2', type: 'modifier', value: 'b', originalConfidence: 60 });
      store.getState().clearPendingReviews();
      expect(store.getState().pendingReviews).toHaveLength(0);
    });
  });

  // ── Timeline Events ──

  describe('timeline events', () => {
    it('prepends new events', () => {
      store.getState().addTimelineEvent({ timestamp: 1, type: 'test', label: 'first' });
      store.getState().addTimelineEvent({ timestamp: 2, type: 'test', label: 'second' });
      expect(store.getState().timelineEvents[0].label).toBe('second');
    });
  });
});
