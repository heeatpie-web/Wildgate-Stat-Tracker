import { describe, expect, it } from 'vitest';
import { resolveTagShipMetadata } from '../tesseractScan';

describe('resolveTagShipMetadata', () => {
  it('prefers explicit OCR ship metadata when available', () => {
    expect(resolveTagShipMetadata('[Red Team]', 'Hunter (4 Player)')).toBe('Hunter');
  });

  it('extracts ship type from colored tag text', () => {
    expect(resolveTagShipMetadata('[Bastion (2 Player)]', '')).toBe('Bastion');
    expect(resolveTagShipMetadata('[Solo Outlaw]', undefined)).toBe('Solo Outlaw');
  });

  it('returns empty when tag text is not ship-like', () => {
    expect(resolveTagShipMetadata('[Crimson Raiders]', '')).toBe('');
  });
});

