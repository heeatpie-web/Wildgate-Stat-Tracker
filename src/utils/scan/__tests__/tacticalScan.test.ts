import { describe, expect, it } from 'vitest';
import { normalizeTacticalPlayerName } from '../tacticalScan';

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
