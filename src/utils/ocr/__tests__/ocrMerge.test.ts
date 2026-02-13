import { describe, it, expect } from 'vitest';
import { mergeOCRData, isSameMatchSession, createEmptyOCRData } from '../ocrMerge';
import type { OCRExtractedData } from '../ocrTypes';

// ── Helpers ──

const makeOCRData = (overrides: Partial<OCRExtractedData> = {}): OCRExtractedData => ({
  screenshotType: 'crew_hub',
  reachModifiers: [],
  enemyShips: [],
  teammates: [],
  opponentTeams: [],
  overallConfidence: 80,
  captureTimestamp: Date.now(),
  ...overrides,
});

// ── createEmptyOCRData ──

describe('createEmptyOCRData', () => {
  it('returns a valid empty structure', () => {
    const empty = createEmptyOCRData();
    expect(empty.screenshotType).toBe('unknown');
    expect(empty.teammates).toEqual([]);
    expect(empty.opponentTeams).toEqual([]);
    expect(empty.reachModifiers).toEqual([]);
    expect(empty.enemyShips).toEqual([]);
    expect(empty.overallConfidence).toBe(0);
  });
});

// ── mergeOCRData ──

describe('mergeOCRData', () => {
  it('deduplicates teammates by name, keeping highest confidence', () => {
    const existing = makeOCRData({
      teammates: [
        { name: 'Alice', confidence: 70, isTeammate: true },
        { name: 'Bob', confidence: 85, isTeammate: true },
      ],
    });
    const incoming = makeOCRData({
      teammates: [
        { name: 'alice', confidence: 90, isTeammate: true }, // same name, higher confidence
        { name: 'Charlie', confidence: 75, isTeammate: true },
      ],
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.teammates).toHaveLength(3);
    const alice = merged.teammates.find(t => t.name.toLowerCase() === 'alice');
    expect(alice!.confidence).toBe(90);
  });

  it('deduplicates modifiers by name, keeping highest confidence', () => {
    const existing = makeOCRData({
      reachModifiers: [
        { name: 'Ice Storm', confidence: 70, rawText: 'ICE STORM' },
      ],
    });
    const incoming = makeOCRData({
      reachModifiers: [
        { name: 'ice storm', confidence: 90, rawText: 'ICE STORM' },
        { name: 'Sandstorm', confidence: 80, rawText: 'SANDSTORM' },
      ],
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.reachModifiers).toHaveLength(2);
    const iceStorm = merged.reachModifiers.find(m => m.name.toLowerCase() === 'ice storm');
    expect(iceStorm!.confidence).toBe(90);
  });

  it('merges opponent teams by team name, combining players', () => {
    const existing = makeOCRData({
      opponentTeams: [{
        teamName: 'RedTeam',
        shipType: 'Hunter',
        color: 'red',
        players: [{ name: 'Enemy1', confidence: 80, isTeammate: false }],
        confidence: 75,
      }],
    });
    const incoming = makeOCRData({
      opponentTeams: [{
        teamName: 'redteam',
        shipType: '',
        color: 'unknown',
        players: [
          { name: 'Enemy1', confidence: 90, isTeammate: false },
          { name: 'Enemy2', confidence: 85, isTeammate: false },
        ],
        confidence: 80,
      }],
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.opponentTeams).toHaveLength(1);
    expect(merged.opponentTeams[0].players).toHaveLength(2);
    // Ship type should be from existing (non-empty)
    expect(merged.opponentTeams[0].shipType).toBe('Hunter');
    // Color should be from existing (non-unknown)
    expect(merged.opponentTeams[0].color).toBe('red');
    // Confidence should be max
    expect(merged.opponentTeams[0].confidence).toBe(80);
  });

  it('adds new opponent teams that do not match existing', () => {
    const existing = makeOCRData({
      opponentTeams: [{
        teamName: 'RedTeam', shipType: '', color: 'red',
        players: [], confidence: 70,
      }],
    });
    const incoming = makeOCRData({
      opponentTeams: [{
        teamName: 'BlueTeam', shipType: 'Scout', color: 'blue',
        players: [{ name: 'B1', confidence: 80, isTeammate: false }],
        confidence: 75,
      }],
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.opponentTeams).toHaveLength(2);
  });

  it('prefers higher confidence playerShip', () => {
    const existing = makeOCRData({
      playerShip: { shipType: 'Hunter', confidence: 60 },
    });
    const incoming = makeOCRData({
      playerShip: { shipType: 'Scout', confidence: 90 },
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.playerShip!.shipType).toBe('Scout');
  });

  it('prefers non-empty playerTeamName', () => {
    const existing = makeOCRData({ playerTeamName: 'MyTeam' });
    const incoming = makeOCRData({ playerTeamName: '' });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.playerTeamName).toBe('MyTeam');
  });

  it('uses earliest capture timestamp', () => {
    const existing = makeOCRData({ captureTimestamp: 1000 });
    const incoming = makeOCRData({ captureTimestamp: 500 });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.captureTimestamp).toBe(500);
  });

  it('prefers more specific screenshot type', () => {
    const existing = makeOCRData({ screenshotType: 'crew_hub' });
    const incoming = makeOCRData({ screenshotType: 'unknown' });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.screenshotType).toBe('crew_hub');
  });

  it('concatenates rawText with separator', () => {
    const existing = makeOCRData({ rawText: 'text1' });
    const incoming = makeOCRData({ rawText: 'text2' });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.rawText).toContain('text1');
    expect(merged.rawText).toContain('text2');
    expect(merged.rawText).toContain('---MERGE---');
  });

  it('deduplicates enemy ships by team name', () => {
    const existing = makeOCRData({
      enemyShips: [{ teamName: 'Red', shipType: 'Hunter', color: 'unknown' }],
    });
    const incoming = makeOCRData({
      enemyShips: [{ teamName: 'red', shipType: 'Hunter', color: 'red' }],
    });
    const merged = mergeOCRData(existing, incoming);
    expect(merged.enemyShips).toHaveLength(1);
    expect(merged.enemyShips[0].color).toBe('red'); // incoming had non-unknown color
  });
});

// ── isSameMatchSession ──

describe('isSameMatchSession', () => {
  it('returns true for captures within time window', () => {
    const d1 = makeOCRData({ captureTimestamp: 1000 });
    const d2 = makeOCRData({ captureTimestamp: 2000 });
    expect(isSameMatchSession(d1, d2)).toBe(true);
  });

  it('returns false for captures beyond time window', () => {
    const d1 = makeOCRData({ captureTimestamp: 0 });
    const d2 = makeOCRData({ captureTimestamp: 10 * 60 * 1000 }); // 10 minutes apart
    expect(isSameMatchSession(d1, d2)).toBe(false);
  });

  it('returns false for different team names', () => {
    const d1 = makeOCRData({ captureTimestamp: 1000, playerTeamName: 'TeamA' });
    const d2 = makeOCRData({ captureTimestamp: 2000, playerTeamName: 'TeamB' });
    expect(isSameMatchSession(d1, d2)).toBe(false);
  });

  it('returns true for matching team names', () => {
    const d1 = makeOCRData({ captureTimestamp: 1000, playerTeamName: 'TeamA' });
    const d2 = makeOCRData({ captureTimestamp: 2000, playerTeamName: 'teama' });
    expect(isSameMatchSession(d1, d2)).toBe(true);
  });

  it('returns false for low modifier overlap', () => {
    const d1 = makeOCRData({
      captureTimestamp: 1000,
      reachModifiers: [
        { name: 'Mod1', confidence: 90, rawText: '' },
        { name: 'Mod2', confidence: 90, rawText: '' },
        { name: 'Mod3', confidence: 90, rawText: '' },
      ],
    });
    const d2 = makeOCRData({
      captureTimestamp: 2000,
      reachModifiers: [
        { name: 'ModX', confidence: 90, rawText: '' },
        { name: 'ModY', confidence: 90, rawText: '' },
        { name: 'ModZ', confidence: 90, rawText: '' },
      ],
    });
    expect(isSameMatchSession(d1, d2)).toBe(false);
  });

  it('returns true for sufficient modifier overlap', () => {
    const d1 = makeOCRData({
      captureTimestamp: 1000,
      reachModifiers: [
        { name: 'Ice Storm', confidence: 90, rawText: '' },
        { name: 'Sandstorm', confidence: 90, rawText: '' },
      ],
    });
    const d2 = makeOCRData({
      captureTimestamp: 2000,
      reachModifiers: [
        { name: 'ice storm', confidence: 90, rawText: '' },
        { name: 'Fast Gate', confidence: 90, rawText: '' },
      ],
    });
    // 1/2 = 50% overlap > 30% threshold
    expect(isSameMatchSession(d1, d2)).toBe(true);
  });

  it('accepts custom time window', () => {
    const d1 = makeOCRData({ captureTimestamp: 0 });
    const d2 = makeOCRData({ captureTimestamp: 3000 });
    expect(isSameMatchSession(d1, d2, 2000)).toBe(false);
    expect(isSameMatchSession(d1, d2, 5000)).toBe(true);
  });
});
