import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { canonicalizeSeedFromText } = require('./mapScreenExtractor.cjs');

describe('canonicalizeSeedFromText (ported from scripts/ocr_seed_extract.py)', () => {
  it('extracts a clean 8-hex seed from realistic full-screen OCR text', () => {
    const text = [
      'YOUR SHIP',
      'DODGE THE BULLET',
      'SCOUT',
      'ENEMY SHIPS',
      'RED TEAM HUNTER',
      'KNOWN HAZARDS & FEATURES',
      'COSMIC STORM',
      'LEECH SWARMS',
      'MAP SEED: A1B2C3D4',
    ].join('\n');
    expect(canonicalizeSeedFromText(text)).toEqual({ seed: 'A1B2C3D4', flags: [] });
  });

  it('uppercases lowercase OCR output', () => {
    expect(canonicalizeSeedFromText('map seed: deadbeef')).toEqual({ seed: 'DEADBEEF', flags: [] });
  });

  it('tolerates missing space between MAP and SEED (OCR merges words)', () => {
    // From scripts/seed_extract_results.json seed_raw: "mapseed15640 | beed:1915B | ..."
    expect(canonicalizeSeedFromText('mapseed15640')).toEqual({
      seed: '15640',
      flags: ['LENGTH_5_NOT_8'],
    });
  });

  it('tolerates missing colon and extra whitespace', () => {
    expect(canonicalizeSeedFromText('MAP   SEED   1915B6C7')).toEqual({ seed: '1915B6C7', flags: [] });
  });

  it('translates O/I/L confusions back to 0/1/1 and flags the substitution', () => {
    expect(canonicalizeSeedFromText('MAP SEED: O1L25IO0')).toEqual({
      seed: '01125100',
      flags: ['SUBST(O1L25IO0->01125100)'],
    });
  });

  it('flags substitution and wrong length together', () => {
    // From seed_raw: "mapseed352ea0" (LENGTH_6_NOT_8 in the dataset)
    expect(canonicalizeSeedFromText('mapseed352ea0')).toEqual({
      seed: '352EA0',
      flags: ['LENGTH_6_NOT_8'],
    });
    expect(canonicalizeSeedFromText('MAPSEED:D7I1')).toEqual({
      seed: 'D711',
      flags: ['LENGTH_4_NOT_8', 'SUBST(D7I1->D711)'],
    });
    // Candidates shorter than 4 chars are rejected by the {4,12} bound (parity
    // with the python regex) — treated as no seed found.
    expect(canonicalizeSeedFromText('MAPSEED:D7I')).toEqual({
      seed: '',
      flags: ['NO_SEED_FOUND'],
    });
  });

  it('returns NO_SEED_FOUND with an empty seed when no marker is present', () => {
    expect(canonicalizeSeedFromText('YOUR SHIP\nKNOWN HAZARDS\nCOSMIC STORM')).toEqual({
      seed: '',
      flags: ['NO_SEED_FOUND'],
    });
    expect(canonicalizeSeedFromText('')).toEqual({ seed: '', flags: ['NO_SEED_FOUND'] });
    expect(canonicalizeSeedFromText(null)).toEqual({ seed: '', flags: ['NO_SEED_FOUND'] });
  });

  it('does not match lookalike fragments like "beed" or "apseed" alone', () => {
    // From seed_raw: "magseedD7e01 | maeedD701 | beed:D7I | eeDeo, | apseed:D7E7"
    // None of these contain a MAP SEED marker; real captures pair them with one.
    expect(canonicalizeSeedFromText('beed:D7I apseed:D7E7')).toEqual({
      seed: '',
      flags: ['NO_SEED_FOUND'],
    });
  });

  it('picks the MAP SEED marker out of noisy multi-alternative OCR text', () => {
    // Mirrors seed_raw "mase15640 | seed:1915B | apseed:1915B6." with a real marker present
    const text = 'mase15640 | mapseed:1915B6C7 | seed:1915B | apseed:1915B6.';
    expect(canonicalizeSeedFromText(text)).toEqual({ seed: '1915B6C7', flags: [] });
  });

  it('handles combined substitution + substitution flag content', () => {
    // O -> 0 inside an otherwise valid seed
    expect(canonicalizeSeedFromText('MAP SEED: 3052EA0O')).toEqual({
      seed: '3052EA00',
      flags: ['SUBST(3052EA0O->3052EA00)'],
    });
  });

  it('ignores a second longer run by taking the first marker match', () => {
    const text = 'MAP SEED: AAAA1111 MAP SEED: BBBB2222';
    expect(canonicalizeSeedFromText(text)).toEqual({ seed: 'AAAA1111', flags: [] });
  });
});
