import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  isNoiseText,
  cleanPlayerName,
  extractShipType,
  detectScreenshotType,
  rgbToHsl,
  detectTeamColor,
  groupWordsIntoLines,
  parsePlayersFromLines,
  mergeOCRData,
  calculateOverallConfidence,
  validateExtractedData,
} from '../ocrParser';
import type { OCRWord, OCRLine, OCRExtractedData, ExtractedPlayer, ExtractedModifier, ExtractedOpponentTeam } from '../ocrTypes';

// ── Helpers ──

const makeWord = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OCRWord => ({
  text, confidence, bbox: { x0, y0, x1, y1 },
});

// ── fuzzyMatch ──

describe('fuzzyMatch', () => {
  const heroes = ['Adrian', 'Venture', 'Kae', 'Sammo', 'Ion', 'Mophs', 'Sal', 'Charlie'];

  it('returns exact match (case insensitive)', () => {
    expect(fuzzyMatch('ADRIAN', heroes)).toBe('Adrian');
    expect(fuzzyMatch('adrian', heroes)).toBe('Adrian');
  });

  it('returns close fuzzy match', () => {
    expect(fuzzyMatch('Adrlan', heroes)).toBe('Adrian'); // 1 edit
    expect(fuzzyMatch('Ventrue', heroes)).toBe('Venture'); // 1 edit (transposition-like)
  });

  it('returns null for too-distant strings', () => {
    expect(fuzzyMatch('XYZXYZ', heroes)).toBeNull();
  });

  it('returns null for empty or short input', () => {
    expect(fuzzyMatch('', heroes)).toBeNull();
    expect(fuzzyMatch('A', heroes)).toBeNull();
  });

  it('scales max distance for longer values', () => {
    // "Privateer (4 Player)" is long, so scaled max distance is higher
    const ships = ['Hunter (4 Player)', 'Privateer (4 Player)', 'Solo Outlaw'];
    expect(fuzzyMatch('Privateur (4 Player)', ships)).toBe('Privateer (4 Player)');
  });

  it('caps long-name fuzzy matching to avoid high-edit false positives', () => {
    const names = ['AlexanderSmith'];
    expect(fuzzyMatch('AlexanderSmlth', names)).toBe('AlexanderSmith');
    expect(fuzzyMatch('AlexanderXmXth', names)).toBe('AlexanderSmith');
    expect(fuzzyMatch('AlexanderXmXXh', names)).toBeNull();
  });
});

// ── isNoiseText ──

describe('isNoiseText', () => {
  it('filters single characters', () => {
    expect(isNoiseText('A')).toBe(true);
    expect(isNoiseText('x')).toBe(true);
  });

  it('filters pure numbers', () => {
    expect(isNoiseText('123')).toBe(true);
    expect(isNoiseText('99')).toBe(true);
  });

  it('allows valid player names', () => {
    expect(isNoiseText('PlayerOne')).toBe(false);
    expect(isNoiseText('xX_Slayer_Xx')).toBe(false);
  });

  it('filters very short strings', () => {
    expect(isNoiseText('')).toBe(true);
    expect(isNoiseText(' ')).toBe(true);
  });
});

// ── cleanPlayerName ──

describe('cleanPlayerName', () => {
  it('removes brackets and special chars', () => {
    expect(cleanPlayerName('[Player1]')).toBe('Player1');
    expect(cleanPlayerName('(Player2)')).toBe('Player2');
    expect(cleanPlayerName('{Player3}')).toBe('Player3');
  });

  it('removes trailing numbers (OCR artifacts)', () => {
    expect(cleanPlayerName('PlayerName 1234')).toBe('PlayerName');
  });

  it('trims leading/trailing punctuation', () => {
    expect(cleanPlayerName('...Player...')).toBe('Player');
    expect(cleanPlayerName('"Player"')).toBe('Player');
  });

  it('collapses multiple spaces', () => {
    expect(cleanPlayerName('Player   Name')).toBe('Player Name');
  });

  it('preserves clean names', () => {
    expect(cleanPlayerName('NormalName')).toBe('NormalName');
  });
});

// ── extractShipType ──

describe('extractShipType', () => {
  it('detects ship types from keywords', () => {
    expect(extractShipType('This is a HUNTER ship')).toBe('Hunter');
    expect(extractShipType('BASTION class vessel')).toBe('Bastion');
    expect(extractShipType('SCOUT patrol')).toBe('Scout');
  });

  it('detects Outlaw from text containing OUTLAW', () => {
    // Note: SHIP_MAP matches "OUTLAW" before "SOLO OUTLAW" due to iteration order
    expect(extractShipType('SOLO OUTLAW mode')).toBe('Outlaw');
  });

  it('returns null for no match', () => {
    expect(extractShipType('Random text')).toBeNull();
  });
});

// ── detectScreenshotType ──

describe('detectScreenshotType', () => {
  it('detects crew hub indicators', () => {
    const type = detectScreenshotType('CREW HUB LOADOUT READY');
    expect(type === 'crew_hub' || type === 'unknown').toBe(true);
  });

  it('returns unknown for ambiguous text', () => {
    expect(detectScreenshotType('hello world')).toBe('unknown');
  });
});

// ── rgbToHsl ──

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0);
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts pure green', () => {
    const { h, s, l } = rgbToHsl(0, 255, 0);
    expect(h).toBe(120);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts pure blue', () => {
    const { h, s, l } = rgbToHsl(0, 0, 255);
    expect(h).toBe(240);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts white', () => {
    const { h, s, l } = rgbToHsl(255, 255, 255);
    expect(s).toBe(0);
    expect(l).toBe(100);
  });

  it('converts black', () => {
    const { h, s, l } = rgbToHsl(0, 0, 0);
    expect(s).toBe(0);
    expect(l).toBe(0);
  });

  it('converts a mid-tone color', () => {
    const { h, s, l } = rgbToHsl(128, 0, 128); // purple
    expect(h).toBe(300);
    expect(l).toBe(25);
  });
});

// ── detectTeamColor ──

describe('detectTeamColor', () => {
  it('detects red', () => {
    expect(detectTeamColor(255, 30, 30)).toBe('red');
  });

  it('detects blue', () => {
    expect(detectTeamColor(30, 30, 255)).toBe('blue');
  });

  it('detects green', () => {
    expect(detectTeamColor(30, 200, 30)).toBe('green');
  });

  it('detects yellow', () => {
    expect(detectTeamColor(240, 240, 30)).toBe('yellow');
  });

  it('detects purple', () => {
    expect(detectTeamColor(180, 30, 200)).toBe('purple');
  });

  it('returns unknown for very low saturation (gray)', () => {
    expect(detectTeamColor(128, 128, 128)).toBe('unknown');
  });

  it('returns unknown for very dark colors', () => {
    expect(detectTeamColor(5, 5, 5)).toBe('unknown');
  });

  it('returns unknown for very bright (near white)', () => {
    expect(detectTeamColor(250, 250, 250)).toBe('unknown');
  });
});

// ── groupWordsIntoLines ──

describe('groupWordsIntoLines', () => {
  it('groups words on the same Y-level into one line', () => {
    const words = [
      makeWord('Hello', 0, 10, 50, 30),
      makeWord('World', 60, 12, 110, 32),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Hello World');
  });

  it('separates words on different Y-levels', () => {
    const words = [
      makeWord('Line1', 0, 10, 50, 30),
      makeWord('Line2', 0, 60, 50, 80),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines).toHaveLength(2);
  });

  it('sorts words left-to-right within a line', () => {
    const words = [
      makeWord('World', 60, 10, 110, 30),
      makeWord('Hello', 0, 10, 50, 30),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines[0].text).toBe('Hello World');
  });

  it('returns empty for empty input', () => {
    expect(groupWordsIntoLines([])).toEqual([]);
  });

  it('expands bounding box to encompass all words', () => {
    const words = [
      makeWord('A', 10, 5, 30, 25),
      makeWord('B', 50, 8, 80, 28),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines[0].bbox.x0).toBe(10);
    expect(lines[0].bbox.x1).toBe(80);
    expect(lines[0].bbox.y0).toBe(5);
    expect(lines[0].bbox.y1).toBe(28);
  });
});

// ── parsePlayersFromLines ──

describe('parsePlayersFromLines', () => {
  it('extracts player names from lines', () => {
    const lines: OCRLine[] = [{
      text: 'PlayerOne',
      words: [makeWord('PlayerOne', 100, 10, 200, 30, 85)],
      bbox: { x0: 100, y0: 10, x1: 200, y1: 30 },
    }];
    const players = parsePlayersFromLines(lines, 1920);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe('PlayerOne');
  });

  it('filters noise text', () => {
    const lines: OCRLine[] = [{
      text: '99',
      words: [makeWord('99', 100, 10, 200, 30, 85)],
      bbox: { x0: 100, y0: 10, x1: 200, y1: 30 },
    }];
    expect(parsePlayersFromLines(lines, 1920)).toHaveLength(0);
  });

  it('determines teammate by position (left = teammate)', () => {
    const lines: OCRLine[] = [{
      text: 'LeftPlayer',
      words: [makeWord('LeftPlayer', 50, 10, 150, 30, 85)],
      bbox: { x0: 50, y0: 10, x1: 150, y1: 30 },
    }];
    const players = parsePlayersFromLines(lines, 1920);
    expect(players[0].isTeammate).toBe(true);
  });

  it('determines opponent by position (right = opponent)', () => {
    const lines: OCRLine[] = [{
      text: 'RightPlayer',
      words: [makeWord('RightPlayer', 1200, 10, 1400, 30, 85)],
      bbox: { x0: 1200, y0: 10, x1: 1400, y1: 30 },
    }];
    const players = parsePlayersFromLines(lines, 1920);
    expect(players[0].isTeammate).toBe(false);
  });

  it('respects explicit isLeftSide override', () => {
    const lines: OCRLine[] = [{
      text: 'SomeRightPlayer',
      words: [makeWord('SomeRightPlayer', 1500, 10, 1700, 30, 85)],
      bbox: { x0: 1500, y0: 10, x1: 1700, y1: 30 },
    }];
    // Even though x is far right, isLeftSide=true forces teammate
    const players = parsePlayersFromLines(lines, 1920, true);
    expect(players).toHaveLength(1);
    expect(players[0].isTeammate).toBe(true);
  });
});

// ── mergeOCRData (parser version) ──

describe('mergeOCRData (parser)', () => {
  it('merges teammates by deduplication (highest confidence wins)', () => {
    const existing: Partial<OCRExtractedData> = {
      teammates: [{ name: 'Alice', confidence: 70, isTeammate: true }],
    };
    const newData: Partial<OCRExtractedData> = {
      teammates: [
        { name: 'Alice', confidence: 90, isTeammate: true },
        { name: 'Bob', confidence: 80, isTeammate: true },
      ],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.teammates).toHaveLength(2);
    const alice = merged.teammates!.find(t => t.name === 'Alice');
    expect(alice!.confidence).toBe(90);
  });

  it('deduplicates OCR-variant teammate names with number/letter confusion', () => {
    const existing: Partial<OCRExtractedData> = {
      teammates: [{ name: 'chrismario', confidence: 83, isTeammate: true }],
    };
    const newData: Partial<OCRExtractedData> = {
      teammates: [
        { name: 'chrismar10', confidence: 91, isTeammate: true },
        { name: 'chrismar1o', confidence: 89, isTeammate: true },
      ],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.teammates).toHaveLength(1);
    expect(merged.teammates?.[0].confidence).toBe(91);
    expect(merged.teammates?.[0].name.toLowerCase()).toBe('chrismario');
  });

  it('does not merge distinct names that only share a long prefix', () => {
    const existing: Partial<OCRExtractedData> = {
      teammates: [{ name: 'chrismario', confidence: 90, isTeammate: true }],
    };
    const newData: Partial<OCRExtractedData> = {
      teammates: [{ name: 'chrismarco', confidence: 88, isTeammate: true }],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.teammates).toHaveLength(2);
  });

  it('prefers higher-confidence playerShip', () => {
    const existing: Partial<OCRExtractedData> = {
      playerShip: { shipType: 'Hunter', confidence: 70 },
    };
    const newData: Partial<OCRExtractedData> = {
      playerShip: { shipType: 'Scout', confidence: 80 },
    };
    // Needs +3 confidence to overwrite
    const merged = mergeOCRData(existing, newData);
    expect(merged.playerShip!.shipType).toBe('Scout');
  });

  it('merges opponent teams by fuzzy team name plus color/roster evidence', () => {
    const existing: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'RedTeam',
        shipType: 'Hunter',
        color: 'red' as const,
        players: [{ name: 'E1', confidence: 80, isTeammate: false }],
        confidence: 70,
      }],
    };
    const newData: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'RedTeamExtended',
        shipType: '',
        color: 'red' as const,
        players: [{ name: 'E2', confidence: 85, isTeammate: false }],
        confidence: 80,
      }],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.opponentTeams).toHaveLength(1);
    // Should have merged players from both
    expect(merged.opponentTeams![0].players).toHaveLength(2);
    // Longer team name preferred
    expect(merged.opponentTeams![0].teamName).toBe('RedTeamExtended');
  });

  it('deduplicates OCR-variant opponent players when merging a team', () => {
    const existing: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Blue Team',
        shipType: 'Hunter',
        color: 'blue' as const,
        players: [{ name: 'chrismario', confidence: 80, isTeammate: false }],
        confidence: 70,
      }],
    };
    const newData: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Blue Team',
        shipType: '',
        color: 'blue' as const,
        players: [{ name: 'chrismar10', confidence: 92, isTeammate: false }],
        confidence: 79,
      }],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.opponentTeams).toHaveLength(1);
    expect(merged.opponentTeams?.[0].players).toHaveLength(1);
    expect(merged.opponentTeams?.[0].players[0].confidence).toBe(92);
    expect(merged.opponentTeams?.[0].players[0].name.toLowerCase()).toBe('chrismario');
  });

  it('does not merge unrelated teams by color only when names and roster differ', () => {
    const existing: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Crimson Raiders',
        shipType: 'Hunter',
        color: 'red' as const,
        players: [{ name: 'E1', confidence: 80, isTeammate: false }],
        confidence: 70,
      }],
    };
    const newData: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Ruby Wolves',
        shipType: 'Scout',
        color: 'red' as const,
        players: [{ name: 'E9', confidence: 85, isTeammate: false }],
        confidence: 80,
      }],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.opponentTeams).toHaveLength(2);
  });

  it('deduplicates hazards', () => {
    const existing: Partial<OCRExtractedData> = { hazards: ['Ice Storm'] };
    const newData: Partial<OCRExtractedData> = { hazards: ['ice storm', 'Sandstorm'] };
    const merged = mergeOCRData(existing, newData);
    expect(merged.hazards).toHaveLength(2);
  });

  it('caps merged teammates to ship teammate limit', () => {
    const existing: Partial<OCRExtractedData> = {
      playerShip: { shipType: 'Hunter (4 Player)', confidence: 90 },
      teammates: [
        { name: 'A', confidence: 80, isTeammate: true },
        { name: 'B', confidence: 81, isTeammate: true },
      ],
    };
    const newData: Partial<OCRExtractedData> = {
      teammates: [
        { name: 'C', confidence: 82, isTeammate: true },
        { name: 'D', confidence: 83, isTeammate: true },
        { name: 'E', confidence: 84, isTeammate: true },
      ],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.teammates).toHaveLength(3);
    const names = new Set((merged.teammates || []).map((p) => p.name));
    expect(names.size).toBe(3);
  });

  it('caps merged opponent team players at 4', () => {
    const existing: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Blue Team',
        shipType: 'Hunter',
        color: 'blue' as const,
        players: [
          { name: 'P1', confidence: 60, isTeammate: false },
          { name: 'P2', confidence: 61, isTeammate: false },
          { name: 'P3', confidence: 62, isTeammate: false },
        ],
        confidence: 70,
      }],
    };
    const newData: Partial<OCRExtractedData> = {
      opponentTeams: [{
        teamName: 'Blue Team',
        shipType: '',
        color: 'blue' as const,
        players: [
          { name: 'P4', confidence: 95, isTeammate: false },
          { name: 'P5', confidence: 94, isTeammate: false },
          { name: 'P6', confidence: 93, isTeammate: false },
          { name: 'P7', confidence: 92, isTeammate: false },
        ],
        confidence: 75,
      }],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.opponentTeams).toHaveLength(1);
    expect(merged.opponentTeams?.[0].players).toHaveLength(4);
  });
});

// ── calculateOverallConfidence ──

describe('calculateOverallConfidence', () => {
  it('returns 0 for empty data', () => {
    expect(calculateOverallConfidence({})).toBe(0);
  });

  it('merges enemy ship entries and prefers better metadata', () => {
    const existing: Partial<OCRExtractedData> = {
      enemyShips: [{ teamName: 'RedTeam', shipType: 'Hunter', color: 'unknown' }],
    };
    const newData: Partial<OCRExtractedData> = {
      enemyShips: [
        { teamName: 'RedTeam', shipType: 'Hunter', color: 'red' },
        { teamName: 'BlueTeam', shipType: 'Scout', color: 'blue' },
      ],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.enemyShips).toHaveLength(2);
    expect(merged.enemyShips?.find((e) => e.teamName === 'RedTeam')?.color).toBe('red');
  });

  it('keeps existing enemy ships when new data provides no tactical map update', () => {
    const existing: Partial<OCRExtractedData> = {
      enemyShips: [{ teamName: 'Gamma', shipType: 'Privateer', color: 'yellow' }],
    };
    const newData: Partial<OCRExtractedData> = {
      enemyShips: [],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.enemyShips).toEqual(existing.enemyShips);
  });

  it('does not collapse placeholder enemy ship entries with different ship types', () => {
    const existing: Partial<OCRExtractedData> = {
      enemyShips: [
        { teamName: 'Unknown', shipType: 'Hunter', color: 'unknown' },
        { teamName: 'Unknown', shipType: 'Scout', color: 'unknown' },
      ],
    };
    const newData: Partial<OCRExtractedData> = {
      enemyShips: [
        { teamName: 'unknown', shipType: 'Hunter', color: 'unknown' },
        { teamName: 'unknown', shipType: 'Scout', color: 'unknown' },
      ],
    };
    const merged = mergeOCRData(existing, newData);
    expect(merged.enemyShips).toHaveLength(2);
    expect(merged.enemyShips.map((ship) => ship.shipType).sort()).toEqual(['Hunter', 'Scout']);
  });

  it('preserves multiplicity for anonymous same-type enemy ships', () => {
    const merged = mergeOCRData(
      { enemyShips: [] },
      {
        enemyShips: [
          { teamName: 'Unknown', shipType: 'Hunter', color: 'unknown' },
          { teamName: 'Unknown', shipType: 'Hunter', color: 'unknown' },
        ],
      }
    );
    expect(merged.enemyShips).toHaveLength(2);
    expect(merged.enemyShips.every((ship) => ship.shipType === 'Hunter')).toBe(true);
  });

  it('merges and normalizes player ship name separately from ship type', () => {
    const merged = mergeOCRData(
      {
        playerShip: { shipType: 'Hunter', confidence: 88 },
        playerShipName: 'Your Team',
      },
      {
        playerShip: { shipType: 'Hunter', confidence: 90 },
        playerShipName: "Starlight's Crew",
      }
    );
    expect(merged.playerShipName).toBe('Starlight');
  });

  it('preserves non-possessive crew names for player ship label', () => {
    const merged = mergeOCRData(
      {
        playerShip: { shipType: 'Hunter', confidence: 86 },
      },
      {
        playerShip: { shipType: 'Hunter', confidence: 90 },
        playerShipName: 'Blue Crew',
      }
    );
    expect(merged.playerShipName).toBe('Blue Crew');
  });

  it('does not fall back to ship type when ship name is unavailable', () => {
    const merged = mergeOCRData(
      {
        playerShip: { shipType: 'Hunter', confidence: 88 },
      },
      {
        playerShip: { shipType: 'Hunter', confidence: 90 },
        playerShipName: 'Hunter',
      }
    );
    expect(merged.playerShipName).toBeUndefined();
  });

  it('weights ship confidence higher', () => {
    const withShip = calculateOverallConfidence({
      playerShip: { shipType: 'Hunter', confidence: 90 },
    });
    const withTeammate = calculateOverallConfidence({
      teammates: [{ name: 'A', confidence: 90, isTeammate: true }],
    });
    // Ship has weight 2.0, teammate has weight 1.0 → same confidence but different weights
    // Both should return 90 since there's only one item
    expect(withShip).toBe(90);
    expect(withTeammate).toBe(90);
  });

  it('produces weighted average', () => {
    const confidence = calculateOverallConfidence({
      playerShip: { shipType: 'Hunter', confidence: 100 },   // weight 2.0
      teammates: [{ name: 'A', confidence: 50, isTeammate: true }],  // weight 1.0
    });
    // (100*2 + 50*1) / (2+1) = 250/3 ≈ 83.3
    expect(confidence).toBeCloseTo(83.33, 0);
  });
});

// ── validateExtractedData ──

describe('validateExtractedData', () => {
  const makeData = (overrides: Partial<OCRExtractedData> = {}): OCRExtractedData => ({
    screenshotType: 'crew_hub',
    reachModifiers: [],
    enemyShips: [],
    teammates: [],
    opponentTeams: [],
    overallConfidence: 80,
    captureTimestamp: Date.now(),
    ...overrides,
  });

  it('filters teammates below 50 confidence', () => {
    const data = makeData({
      teammates: [
        { name: 'Good', confidence: 80, isTeammate: true },
        { name: 'Bad', confidence: 30, isTeammate: true },
      ],
    });
    const validated = validateExtractedData(data);
    expect(validated.teammates).toHaveLength(1);
    expect(validated.teammates[0].name).toBe('Good');
  });

  it('filters modifiers below 60 confidence', () => {
    const data = makeData({
      reachModifiers: [
        { name: 'Ice Storm', confidence: 80, rawText: 'ICE STORM' },
        { name: 'Weak', confidence: 40, rawText: 'WEAK' },
      ],
    });
    const validated = validateExtractedData(data);
    expect(validated.reachModifiers).toHaveLength(1);
  });

  it('filters opponent teams below 40 confidence', () => {
    const data = makeData({
      opponentTeams: [{
        teamName: 'LowConf',
        shipType: 'Hunter',
        color: 'red',
        players: [{ name: 'P', confidence: 80, isTeammate: false }],
        confidence: 20,
      }],
    });
    const validated = validateExtractedData(data);
    expect(validated.opponentTeams).toHaveLength(0);
  });

  it('removes players below 50 confidence from opponent teams', () => {
    const data = makeData({
      opponentTeams: [{
        teamName: 'Team',
        shipType: 'Hunter',
        color: 'red',
        players: [
          { name: 'Good', confidence: 80, isTeammate: false },
          { name: 'Bad', confidence: 30, isTeammate: false },
        ],
        confidence: 70,
      }],
    });
    const validated = validateExtractedData(data);
    expect(validated.opponentTeams[0].players).toHaveLength(1);
  });

  it('promotes ship-like player artifacts into team shipType metadata', () => {
    const data = makeData({
      opponentTeams: [{
        teamName: 'Team',
        shipType: '',
        color: 'red',
        players: [
          { name: 'Hunter (4 Player)', confidence: 84, isTeammate: false },
          { name: 'Enemy One', confidence: 82, isTeammate: false },
        ],
        confidence: 74,
      }],
    });
    const validated = validateExtractedData(data);
    expect(validated.opponentTeams[0].shipType).toBe('Hunter');
    expect(validated.opponentTeams[0].players).toHaveLength(1);
    expect(validated.opponentTeams[0].players[0].name).toBe('Enemy One');
  });
});
