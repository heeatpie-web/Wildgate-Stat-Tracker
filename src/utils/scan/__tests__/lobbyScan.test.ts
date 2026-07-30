import { describe, expect, it } from 'vitest';
import { resolveTeamNameCandidate } from '../lobbyScan';

const DEFAULT_TEAM_NAME = 'Unknown Ship';

describe('resolveTeamNameCandidate (lobbyScan teamName guard)', () => {
  it('rejects known ship class names, falling back to the Unknown Ship placeholder', () => {
    expect(resolveTeamNameCandidate('Hunter')).toBe(DEFAULT_TEAM_NAME);
    expect(resolveTeamNameCandidate('Battle Scout')).toBe(DEFAULT_TEAM_NAME);
    expect(resolveTeamNameCandidate('Solo Outlaw')).toBe(DEFAULT_TEAM_NAME);
  });

  it('rejects known map names, falling back to the Unknown Ship placeholder', () => {
    expect(resolveTeamNameCandidate('Deadworlds')).toBe(DEFAULT_TEAM_NAME);
    expect(resolveTeamNameCandidate('DEADWORLDS')).toBe(DEFAULT_TEAM_NAME);
    expect(resolveTeamNameCandidate('Cryon Rift')).toBe(DEFAULT_TEAM_NAME);
    expect(resolveTeamNameCandidate('Gloaming Expanse')).toBe(DEFAULT_TEAM_NAME);
  });

  it('preserves a plausible real team/tag name', () => {
    expect(resolveTeamNameCandidate('Void Reavers')).toBe('Void Reavers');
    expect(resolveTeamNameCandidate('[TAG]')).toBe('[TAG]');
  });
});
