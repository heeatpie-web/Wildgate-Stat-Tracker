import { describe, expect, it } from 'vitest';
import { classifyTacticalOcrLine, normalizeTacticalPlayerName } from '../tacticalScan';
import { KNOWN_HAZARD_NAMES, KNOWN_MAP_NAMES, MAP_TYPES, isKnownMapName } from '../../constants';

describe('normalizeTacticalPlayerName', () => {
  it('keeps plausible tactical-map player names', () => {
    expect(normalizeTacticalPlayerName('Amir9688')).toBe('Amir9688');
    expect(normalizeTacticalPlayerName('Dam-ned1024xd')).toBe('Dam-ned1024xd');
    expect(normalizeTacticalPlayerName('|          |')).toBe('| |');
  });

  it('rejects grid-label OCR garbage', () => {
    expect(normalizeTacticalPlayerName('||')).toBe('');
    expect(normalizeTacticalPlayerName('A1')).toBe('');
    expect(normalizeTacticalPlayerName('1')).toBe('');
  });
});

describe('classifyTacticalOcrLine (map-name exclusion)', () => {
  it('flags known map-name OCR lines as isMapName, keeping them out of nameLines', () => {
    ['GLOAMING EXPANSE', 'CRYON RIFT', 'DEADWORLDS', 'DEAD WORLDS'].forEach((line) => {
      const { isMapName, isShip, isModifier } = classifyTacticalOcrLine(line);
      expect(isMapName).toBe(true);
      // A map name should never simultaneously be treated as a ship or reach modifier bucket;
      // the important invariant is that at least one exclusion bucket catches it so it can
      // never fall through into nameLines (tacticalScan.ts's fabricated-player path).
      expect(isMapName || isShip || isModifier).toBe(true);
    });
  });

  it('does not flag a normal player name as a map name', () => {
    const { isMapName } = classifyTacticalOcrLine('Amir9688');
    expect(isMapName).toBe(false);
  });
});

describe('isKnownMapName', () => {
  it('matches known map display names case-insensitively', () => {
    expect(isKnownMapName('Cryon Rift')).toBe(true);
    expect(isKnownMapName('cryon rift')).toBe(true);
    expect(isKnownMapName('CRYON RIFT')).toBe(true);
    expect(isKnownMapName('Gloaming Expanse')).toBe(true);
  });

  it('handles the DEADWORLDS vs DEAD WORLDS spacing variance', () => {
    expect(isKnownMapName('DEADWORLDS')).toBe(true);
    expect(isKnownMapName('DEAD WORLDS')).toBe(true);
    expect(isKnownMapName('dead   worlds')).toBe(true);
  });

  it('matches when a longer, noisy OCR line contains a known map name', () => {
    expect(isKnownMapName('>> GLOAMING EXPANSE <<')).toBe(true);
    expect(isKnownMapName('MAP: CRYON RIFT')).toBe(true);
    expect(isKnownMapName('DEADWORLDS - SECTOR 4')).toBe(true);
  });

  it('returns false for unrelated names', () => {
    expect(isKnownMapName('Amir9688')).toBe(false);
    expect(isKnownMapName('Hunter')).toBe(false);
    expect(isKnownMapName('')).toBe(false);
    expect(isKnownMapName(null)).toBe(false);
    expect(isKnownMapName(undefined)).toBe(false);
  });
});

describe('map catalog / hazard catalog disjointness', () => {
  it('KNOWN_MAP_NAMES and KNOWN_HAZARD_NAMES never overlap', () => {
    const overlap = Array.from(KNOWN_MAP_NAMES).filter((name) => KNOWN_HAZARD_NAMES.has(name));
    expect(overlap).toEqual([]);
  });

  it('exposes the three known maps in MAP_TYPES', () => {
    expect(MAP_TYPES).toEqual(expect.arrayContaining(['Cryon Rift', 'Dead Worlds', 'Gloaming Expanse']));
  });
});
