import { describe, it, expect } from 'vitest';
import { generateShareCode, parseShareCode } from '../export';

describe('generateShareCode / parseShareCode roundtrip', () => {
  const mockMatch = {
    id: 1,
    timestamp: Date.now(),
    date: '2025-01-01',
    mode: 'Artifact Brawl' as const,
    result: 'Win' as const,
    player: 'TestPlayer',
    teammates: ['Ally1', 'Ally2'],
    opponents: ['Enemy1'],
    hero: 'Adrian',
    ship: 'Hunter (2 Player)',
    subType: 'Standard',
    reachModifiers: ['The Bull'],
    kills: { Hunter: 2, Bastion: 1 },
    damageTaken: 1500,
    time: '12:34',
    notes: 'Great game',
  };

  it('encodes to a non-empty base64 string', () => {
    const code = generateShareCode(mockMatch as any);
    expect(code).toBeTruthy();
    expect(typeof code).toBe('string');
    // Valid base64 characters only
    expect(code).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('decodes back to matching data', () => {
    const code = generateShareCode(mockMatch as any);
    const parsed = parseShareCode(code);

    expect(parsed.mode).toBe('Artifact Brawl');
    expect(parsed.result).toBe('Win');
    expect(parsed.ship).toBe('Hunter (2 Player)');
    expect(parsed.hero).toBe('Adrian');
    expect(parsed.teammates).toEqual(['Ally1', 'Ally2']);
    expect(parsed.opponents).toEqual(['Enemy1']);
    expect(parsed.damageTaken).toBe(1500);
    expect(parsed.time).toBe('12:34');
    expect(parsed.reachModifiers).toEqual(['The Bull']);
    expect(parsed.kills).toEqual({ Hunter: 2, Bastion: 1 });
    expect(parsed.notes).toBe('Great game');
  });

  it('preserves Loss result', () => {
    const lossMatch = { ...mockMatch, result: 'Loss' as const };
    const code = generateShareCode(lossMatch as any);
    const parsed = parseShareCode(code);
    expect(parsed.result).toBe('Loss');
  });

  it('preserves Draw result', () => {
    const drawMatch = { ...mockMatch, result: 'Draw' as const };
    const code = generateShareCode(drawMatch as any);
    const parsed = parseShareCode(code);
    expect(parsed.result).toBe('Draw');
  });

  it('preserves Fleet Battle mode', () => {
    const fbMatch = { ...mockMatch, mode: 'Fleet Battle' as const };
    const code = generateShareCode(fbMatch as any);
    const parsed = parseShareCode(code);
    expect(parsed.mode).toBe('Fleet Battle');
  });

  it('throws on invalid share code', () => {
    expect(() => parseShareCode('not-valid-base64!!!')).toThrow('Invalid share code');
  });
});
