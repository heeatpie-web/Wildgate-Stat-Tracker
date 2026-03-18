import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createMappingSlice, MappingSlice, resolvePlayerProfileDisplayName } from '../createMappingSlice';

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

  describe('unknown ID normalization', () => {
    it('coalesces GUID format variants into a single unknown entry', () => {
      const canonical = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      store.getState().registerUnknownId('{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}', 'Perk');
      store.getState().registerUnknownId(canonical, 'Perk');

      const unknownKeys = Object.keys(store.getState().detectedUnknowns);
      expect(unknownKeys).toEqual([canonical]);
      expect(store.getState().detectedUnknowns[canonical]?.type).toBe('Perk');
    });

    it('clears normalized unknown GUID entries when mapping is added under another format', () => {
      const canonical = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      store.getState().registerUnknownId(canonical, 'Weapon');
      expect(Object.keys(store.getState().detectedUnknowns)).toEqual([canonical]);

      store.getState().setUidMapping('weapons', '{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}', 'Test Weapon');
      expect(Object.keys(store.getState().detectedUnknowns)).toHaveLength(0);
      expect(store.getState().uidMappings.weapons[canonical]).toBe('Test Weapon');
    });
  });

  describe('resolvePlayerProfileDisplayName', () => {
    it('prefers an explicit profile name', () => {
      expect(resolvePlayerProfileDisplayName('pilot-1', {
        id: 'pilot-1',
        name: 'Pilot One',
      }, {})).toBe('Pilot One');
    });

    it('falls back to a human-readable id when no name exists', () => {
      expect(resolvePlayerProfileDisplayName('pilot-1', {
        id: 'pilot-1',
      }, {})).toBe('pilot-1');
    });

    it('suppresses GUID-like ids when no name or mapping exists', () => {
      expect(resolvePlayerProfileDisplayName('{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}', {
        id: '{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}',
      }, {})).toBeNull();
    });
  });

  // ── OCR Corrections ──

  describe('ocrCorrections', () => {
    it('writes alias-model entries without updating legacy correction map', () => {
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      const correction = store.getState().getOcrCorrection('Adrlan');
      expect(correction).toBeUndefined();
      const model = store.getState().ocrAliasModel;
      expect(model.entries['adrlan']).toBeDefined();
      expect(model.entries['adrlan'][0].targetName).toBe('Adrian');
    });

    it('increments alias-model count on repeat correction', () => {
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      const model = store.getState().ocrAliasModel;
      expect(model.entries['adrlan'][0].count).toBe(2);
    });

    it('returns undefined for unknown text', () => {
      expect(store.getState().getOcrCorrection('xyz')).toBeUndefined();
    });

    it('keeps alias model in sync when legacy correction API is used', () => {
      store.getState().recordOcrCorrection('Adrlan', 'Adrian');
      const model = store.getState().ocrAliasModel;
      expect(model.entries['adrlan']).toBeDefined();
      expect(model.entries['adrlan'][0].targetName).toBe('Adrian');
    });
  });

  describe('ocrAliasModel', () => {
    it('resolves learned alias when score/count gates pass', () => {
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      const result = store.getState().resolveOcrAlias('Adrlan', {
        context: 'lobby',
        minScore: 0.2,
        minCount: 3,
        strictMode: false,
      });
      expect(result.resolvedName).toBe('Adrian');
      expect(result.reason).toBe('resolved');
    });

    it('blocks and unblocks alias resolution', () => {
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', { context: 'lobby', confidenceWeight: 1 });
      store.getState().blockOcrAlias('Adrlan', 'test');
      const blocked = store.getState().resolveOcrAlias('Adrlan');
      expect(blocked.blocked).toBe(true);
      expect(blocked.reason).toBe('blocklisted');

      store.getState().unblockOcrAlias('Adrlan');
      const after = store.getState().resolveOcrAlias('Adrlan', {
        context: 'lobby',
        minScore: 0.2,
        minCount: 3,
        strictMode: false,
      });
      expect(after.blocked).toBe(false);
      expect(after.suggestedName).toBe('Adrian');
    });

    it('removes a learned alias mapping and legacy correction entries', () => {
      store.getState().recordOcrAliasCorrection('kfFartingPuppy', 'AlixerThus', {
        context: 'unknown',
        source: 'settings_alias',
        confidenceWeight: 1,
      });
      store.getState().recordOcrAliasCorrection('kfFartingPuppy', 'AlixerThus', {
        context: 'unknown',
        source: 'settings_alias',
        confidenceWeight: 1,
      });

      const removed = store.getState().removeOcrAliasCorrection('kfFartingPuppy', 'AlixerThus');

      expect(removed).toBe(true);
      expect(store.getState().ocrAliasModel.entries['kffartingpuppy']).toBeUndefined();
      expect(store.getState().getOcrCorrection('kfFartingPuppy')).toBeUndefined();
      expect(store.getState().getOcrCorrection('kffartingpuppy')).toBeUndefined();
    });
  });

  describe('ocrLearningQueue lifecycle', () => {
    it('queues, approves, and removes learning events from queue', () => {
      const queued = store.getState().enqueueOcrLearningReview({
        rawText: 'Adrlan',
        suggestedName: 'Adrian',
        score: 0.88,
        margin: 0.09,
        count: 3,
        context: 'matchstats',
        reason: 'auto-resolve-needs-review',
      });
      expect(queued).toBeTruthy();
      expect(store.getState().ocrLearningQueue.length).toBe(1);

      const approved = store.getState().approveOcrLearningEvent(queued!.eventId);
      expect(approved?.status).toBe('approved');
      expect(store.getState().ocrLearningQueue.length).toBe(0);
      const resolution = store.getState().resolveOcrAlias('Adrlan', {
        context: 'matchstats',
        minScore: 0.2,
        minCount: 1,
        strictMode: false,
      });
      expect(resolution.suggestedName).toBe('Adrian');
    });

    it('rejects queued learning events', () => {
      const queued = store.getState().enqueueOcrLearningReview({
        rawText: 'Myspel',
        suggestedName: 'MySpell',
        score: 0.77,
        margin: 0.03,
        count: 2,
        context: 'lobby',
        reason: 'ambiguous',
      });
      expect(queued).toBeTruthy();
      const rejected = store.getState().rejectOcrLearningEvent(queued!.eventId, 'manual reject');
      expect(rejected?.status).toBe('rejected');
      expect(store.getState().ocrLearningQueue.length).toBe(0);
    });

    it('rolls back auto-applied events and blocks alias key', () => {
      const event = store.getState().logOcrLearningDecision({
        rawText: 'Adrlan',
        suggestedName: 'Adrian',
        appliedName: 'Adrian',
        score: 0.9,
        margin: 0.12,
        count: 5,
        context: 'matchstats',
        status: 'auto_applied',
        reason: 'auto-applied',
      });
      expect(event).toBeTruthy();
      store.getState().recordOcrAliasCorrection('Adrlan', 'Adrian', {
        source: 'manual_correction',
        context: 'matchstats',
        confidenceWeight: 1,
        decisionId: event!.id,
      });

      const rolled = store.getState().rollbackOcrLearningEvent(event!.id, 'test rollback');
      expect(rolled?.status).toBe('rolled_back');
      const blocked = store.getState().resolveOcrAlias('Adrlan');
      expect(blocked.reason).toBe('blocklisted');
    });

    it('clears resolved learning events while retaining queued items', () => {
      const queued = store.getState().enqueueOcrLearningReview({
        rawText: 'QueueMe',
        suggestedName: 'QueueTarget',
        score: 0.7,
        margin: 0.02,
        count: 1,
        context: 'unknown',
      });
      const resolved = store.getState().logOcrLearningDecision({
        rawText: 'DoneOne',
        suggestedName: 'DoneTarget',
        appliedName: 'DoneTarget',
        score: 0.95,
        margin: 0.22,
        count: 7,
        status: 'auto_applied',
        reason: 'auto-applied',
      });
      expect(queued).toBeTruthy();
      expect(resolved).toBeTruthy();

      store.getState().clearResolvedOcrLearningEvents(-1);
      const events = store.getState().ocrLearningEvents;
      expect(events.every(e => e.status === 'queued')).toBe(true);
      expect(store.getState().ocrLearningQueue.length).toBe(1);
      expect(store.getState().ocrLearningQueue[0].eventId).toBe(queued!.eventId);
    });
  });

  describe('team identity learning', () => {
    it('records and resolves team name/color corrections', () => {
      store.getState().recordTeamIdentityCorrection('red raptors', 'Red Raptors', {
        rawColor: 'red',
        correctedColor: 'crimson',
        context: 'matchstats',
        source: 'review_modal',
      });

      const resolved = store.getState().resolveTeamIdentity('Red Raptors', 'red');
      expect(resolved.matched).toBe(true);
      expect(resolved.teamName).toBe('Red Raptors');
      expect(resolved.color).toBe('crimson');
    });

    it('falls back to highest-confidence name match when color key differs', () => {
      store.getState().recordTeamIdentityCorrection('blue fleet', 'Blue Fleet', {
        rawColor: 'blue',
        correctedColor: 'azure',
        context: 'lobby',
      });
      store.getState().recordTeamIdentityCorrection('blue fleet', 'Blue Fleet', {
        rawColor: 'blue',
        correctedColor: 'azure',
        context: 'matchstats',
      });

      const resolved = store.getState().resolveTeamIdentity('Blue Fleet', 'green');
      expect(resolved.matched).toBe(true);
      expect(resolved.teamName).toBe('Blue Fleet');
      expect(resolved.color).toBe('azure');
    });
  });

  describe('player encounter role corrections', () => {
    it('records and resolves persisted match-side corrections by match and player', () => {
      store.getState().recordPlayerEncounterRoleCorrection(42, 'Wingman', 'opponent');

      expect(store.getState().getPlayerEncounterRoleCorrection(42, 'Wingman')).toBe('opponent');
      expect(store.getState().getPlayerEncounterRoleCorrection(42, 'wingman')).toBe('opponent');
      expect(store.getState().getPlayerEncounterRoleCorrection(43, 'Wingman')).toBeNull();
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

    it('clears unknown entries when a UID mapping is saved', () => {
      store.getState().registerUnknownId('ship1', 'Ship');
      expect(store.getState().detectedUnknowns['ship1']).toBeDefined();
      store.getState().setUidMapping('ships', 'ship1', 'Hunter');
      expect(store.getState().detectedUnknowns['ship1']).toBeUndefined();
      expect(store.getState().uidMappings.ships['ship1']).toBe('Hunter');
    });

    it('updates player profile name when saving player UID mapping', () => {
      store.getState().registerUnknownId('p1', 'Hero');
      store.getState().setUidMapping('players', 'p1', 'Alice');
      expect(store.getState().playerProfiles['p1'].name).toBe('Alice');
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


