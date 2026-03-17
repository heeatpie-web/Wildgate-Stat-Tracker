import { describe, expect, it } from 'vitest';
import type { Match } from '../../types';
import {
  buildRosterAutoPopulateDecisions,
  ROSTER_AUTO_POPULATE_DETECT_MIN,
  ROSTER_AUTO_POPULATE_REVIEW_MIN,
} from '../rosterAutoPopulate';

const createMatch = (
  names: { teammates?: string[]; opponents?: string[] },
  confidenceByName: Record<string, number>,
): Match => ({
  id: 1,
  timestamp: Date.now(),
  date: new Date().toISOString(),
  mode: 'Artifact Brawl',
  player: 'ActiveUser',
  teammates: names.teammates || [],
  opponents: names.opponents || [],
  hero: 'Adrian',
  ship: 'Hunter',
  reachModifiers: [],
  kills: {},
  result: 'Win',
  subType: 'Combat',
  ocrDebug: {
    nameConfidence: confidenceByName,
  },
});

describe('buildRosterAutoPopulateDecisions', () => {
  it('auto-adds a new player at the 78% detect threshold when there is no strong fuzzy match', () => {
    const [decision] = buildRosterAutoPopulateDecisions({
      match: createMatch({ opponents: ['FreshPilot'] }, { FreshPilot: ROSTER_AUTO_POPULATE_DETECT_MIN }),
      pilotRegistry: ['PilotOne'],
    });

    expect(decision.type).toBe('add');
    expect(decision.confidence).toBe(ROSTER_AUTO_POPULATE_DETECT_MIN);
    expect(decision.bestScore).toBeLessThan(ROSTER_AUTO_POPULATE_REVIEW_MIN);
  });

  it('merges into an existing roster player at the 78% detect threshold when fuzzy confidence is strong enough', () => {
    const [decision] = buildRosterAutoPopulateDecisions({
      match: createMatch({ opponents: ['PilotOnee'] }, { PilotOnee: ROSTER_AUTO_POPULATE_DETECT_MIN }),
      pilotRegistry: ['PilotOne'],
    });

    expect(decision.type).toBe('merge');
    expect(decision.bestMatch).toBe('PilotOne');
    expect(decision.bestScore).toBeGreaterThanOrEqual(ROSTER_AUTO_POPULATE_DETECT_MIN);
  });

  it('queues borderline names for review in the 70-77% band', () => {
    const [decision] = buildRosterAutoPopulateDecisions({
      match: createMatch({ opponents: ['BorderlinePilot'] }, { BorderlinePilot: ROSTER_AUTO_POPULATE_DETECT_MIN - 1 }),
      pilotRegistry: ['PilotOne'],
    });

    expect(decision.type).toBe('review');
    expect(decision.confidence).toBe(ROSTER_AUTO_POPULATE_DETECT_MIN - 1);
    expect(decision.confidence).toBeGreaterThanOrEqual(ROSTER_AUTO_POPULATE_REVIEW_MIN);
  });
});
