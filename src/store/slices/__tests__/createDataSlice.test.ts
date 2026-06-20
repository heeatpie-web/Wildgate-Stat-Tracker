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

    it('clears live match metric values and source gates for a fresh match', () => {
      store.getState().setTimeMin('12', 'manual');
      store.getState().setTimeSec('34', 'manual');
      store.getState().setDamageTaken('900', 'manual');

      store.getState().resetMatchMetricsForNewMatch();

      expect(store.getState().timeMin).toBe('');
      expect(store.getState().timeSec).toBe('');
      expect(store.getState().damageTaken).toBe('');
      expect(store.getState().timeSource).toBeUndefined();
      expect(store.getState().damageSource).toBeUndefined();

      store.getState().setTimeMin('01', 'telemetry');
      expect(store.getState().timeMin).toBe('01');
      expect(store.getState().timeSource).toBe('telemetry');
    });
  });

  // ── Rename Pilot ──

  describe('renamePilot', () => {
    it('renames across registry, players, favorites, notes, and matches', () => {
      store.getState().addToRegistry('OldName');
      store.getState().addPlayer('OldName');
      store.getState().toggleFavorite('OldName');
      store.getState().updatePilotNote('OldName', 'a note');
      store.getState().updatePlayerIdMapping('player-1', 'OldName');
      store.getState().addPilotAlias('OldName', 'Old Name OCR');
      store.setState({
        playerProfiles: {
          OldName: {
            id: 'OldName',
            name: 'OldName',
            sightings: 3,
            playedWith: { Ally: 2 },
            playedAgainst: { Enemy: 1 },
            teamsObserved: { TeamA: 1 },
            shipsObserved: { Hunter: 2 },
          },
        },
      } as any);
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
      expect(s.playerIdMap['player-1']).toBe('NewName');
      expect(s.pilotAliases['NewName']).toEqual(expect.arrayContaining(['OldName', 'Old Name OCR']));
      expect((s as any).playerProfiles['NewName']).toBeDefined();
      expect((s as any).playerProfiles['OldName']).toBeUndefined();
    });

    it('absorbs a registry-only collision when renaming (not a profile collision)', () => {
      store.getState().addToRegistry('OldName');
      store.getState().addToRegistry('NewName');

      store.getState().renamePilot('OldName', 'newname');

      const s = store.getState();
      expect(s.pilotRegistry).toContain('newname');
      expect(s.pilotRegistry).not.toContain('OldName');
      expect(s.pilotRegistry).not.toContain('NewName');
      expect(s.pilotRegistry).toHaveLength(1);
    });

    it('blocks rename when the target name is an existing profile', () => {
      store.getState().addPlayer('OldName');
      store.getState().addToRegistry('OldName');
      store.getState().addPlayer('NewName');
      store.getState().addToRegistry('NewName');

      store.getState().renamePilot('OldName', 'newname');

      const s = store.getState();
      expect(s.pilotRegistry).toContain('OldName');
      expect(s.pilotRegistry).toContain('NewName');
      expect(s.players).toContain('OldName');
      expect(s.players).toContain('NewName');
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

    it('rewrites nested opponent team player names during merge', () => {
      store.getState().addMatch(createMatch({
        id: 11,
        opponents: ['DupePlayer'],
        opponentTeams: [{ teamName: 'Red', shipType: 'Hunter', color: 'red', players: ['dupeplayer', 'Wingman'] }],
      }));
      store.getState().addToRegistry('DupePlayer');
      store.getState().addToRegistry('RealPlayer');

      store.getState().mergePilots('DupePlayer', 'RealPlayer');

      const saved = store.getState().matches[0];
      expect(saved.opponents).toContain('RealPlayer');
      expect(saved.opponentTeams?.[0]?.players).toEqual(['RealPlayer', 'Wingman']);
      expect(saved.opponentTeams?.[0]?.players).not.toContain('dupeplayer');
    });

    it('merges notes by appending', () => {
      store.getState().updatePilotNote('Dupe', 'Note A');
      store.getState().updatePilotNote('Real', 'Note B');
      store.getState().mergePilots('Dupe', 'Real');
      expect(store.getState().pilotNotes['Real']).toContain('Note A');
      expect(store.getState().pilotNotes['Real']).toContain('Note B');
    });

    it('keeps the merged source name as a former-name alias on the target', () => {
      store.getState().addPilotAlias('Dupe', 'Dupe OCR');
      store.getState().mergePilots('Dupe', 'Real');
      expect(store.getState().pilotAliases['Real']).toEqual(expect.arrayContaining(['Dupe', 'Dupe OCR']));
    });

    it('creates merge history entry', () => {
      store.getState().addToRegistry('A');
      store.getState().addToRegistry('B');
      store.getState().mergePilots('A', 'B');
      expect(store.getState().mergeHistory).toHaveLength(1);
      expect(store.getState().mergeHistory[0].sourceName).toBe('A');
      expect(store.getState().mergeHistory[0].targetName).toBe('B');
      expect(store.getState().activeMergeNotificationId).toBe(store.getState().mergeHistory[0].id);
    });

    it('dismisses the active merge notification without clearing merge history', () => {
      store.getState().addToRegistry('A');
      store.getState().addToRegistry('B');
      store.getState().mergePilots('A', 'B');

      store.getState().dismissActiveMergeNotification();

      expect(store.getState().activeMergeNotificationId).toBeNull();
      expect(store.getState().mergeHistory).toHaveLength(1);
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
      expect(store.getState().activeMergeNotificationId).toBeNull();
    });

    it('restores aliases after undoing a merge', () => {
      store.getState().addPilotAlias('A', 'Alias A');
      store.getState().mergePilots('A', 'B');
      expect(store.getState().pilotAliases['B']).toEqual(expect.arrayContaining(['A', 'Alias A']));

      const result = store.getState().undoLastMerge();
      expect(result).toBe(true);
      expect(store.getState().pilotAliases['A']).toEqual(['Alias A']);
      expect(store.getState().pilotAliases['B']).toBeUndefined();
    });

    it('returns false when no history', () => {
      expect(store.getState().undoLastMerge()).toBe(false);
    });
  });

  describe('renamePilot', () => {
    it('rewrites nested opponent team player names during rename', () => {
      store.getState().addToRegistry('OldName');
      store.getState().addMatch(createMatch({
        id: 21,
        opponents: ['OldName'],
        opponentTeams: [{ teamName: 'Blue', shipType: 'Hunter', color: 'blue', players: ['OldName', 'Scout'] }],
      }));

      store.getState().renamePilot('OldName', 'NewName');

      const saved = store.getState().matches[0];
      expect(saved.opponents).toContain('NewName');
      expect(saved.opponentTeams?.[0]?.players).toEqual(['NewName', 'Scout']);
      expect(saved.opponentTeams?.[0]?.players).not.toContain('OldName');
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

    it('removes multiple pending reviews at once', () => {
      store.getState().addPendingReview({ id: '1', type: 'player_name', value: 'test', originalConfidence: 50 });
      store.getState().addPendingReview({ id: '2', type: 'roster_candidate', value: 'pilot', originalConfidence: 88, canonicalTargetKey: 'pilotprime' });
      store.getState().addPendingReview({ id: '3', type: 'modifier', value: 'storm', originalConfidence: 60 });
      store.getState().removePendingReviews(['1', '2']);
      expect(store.getState().pendingReviews).toEqual([
        expect.objectContaining({ id: '3', value: 'storm' }),
      ]);
    });

    it('clears all pending reviews', () => {
      store.getState().addPendingReview({ id: '1', type: 'player_name', value: 'a', originalConfidence: 50 });
      store.getState().addPendingReview({ id: '2', type: 'modifier', value: 'b', originalConfidence: 60 });
      store.getState().clearPendingReviews();
      expect(store.getState().pendingReviews).toHaveLength(0);
    });
  });

  describe('dismissed roster merge suggestions', () => {
    it('stores unique dismissed roster merge pair keys', () => {
      store.getState().dismissRosterMergeSuggestionPairs(['pilotone::pilot0ne', 'pilotone::pilot0ne', 'pilotone::pilot one']);

      expect(store.getState().dismissedRosterMergePairKeys).toEqual([
        'pilotone::pilot0ne',
        'pilotone::pilot one',
      ]);
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
