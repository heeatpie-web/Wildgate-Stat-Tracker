import { describe, expect, it } from 'vitest';
import { isReachModifierUiPlayerNoise } from '../reachModifierUiNoise';

describe('isReachModifierUiPlayerNoise', () => {
  it('flags glued REACH stat lines mistaken for player names', () => {
    expect(isReachModifierUiPlayerNoise('reducefiresonshipby50')).toBe(true);
    expect(isReachModifierUiPlayerNoise('REDUCEFIRESONSHIPBY50')).toBe(true);
    expect(isReachModifierUiPlayerNoise('reduce fires on ship by 50')).toBe(true);
    expect(isReachModifierUiPlayerNoise('reducefires')).toBe(true);
    expect(isReachModifierUiPlayerNoise('shipby50')).toBe(true);
    expect(isReachModifierUiPlayerNoise('SHIP BY 50')).toBe(true);
  });

  it('still allows normal gamertags', () => {
    expect(isReachModifierUiPlayerNoise('ShipwreckSam')).toBe(false);
    expect(isReachModifierUiPlayerNoise('ReduceReuse')).toBe(false);
    expect(isReachModifierUiPlayerNoise('Firestorm42')).toBe(false);
  });
});
