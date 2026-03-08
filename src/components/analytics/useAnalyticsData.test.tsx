import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gameDataState = {
  matches: [] as Array<Record<string, unknown>>,
  playerProfiles: {},
  isMatchInProgress: false,
  matchStartTime: null as number | null,
};

const uiState = {
  activeMode: 'Fleet Battle',
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

describe('useAnalyticsData', () => {
  beforeEach(() => {
    gameDataState.playerProfiles = {};
    gameDataState.isMatchInProgress = false;
    gameDataState.matchStartTime = null;
    gameDataState.matches = [];
  });

  it('holds back completed matches written during an active match until the active flag drops', async () => {
    const now = Date.now();
    gameDataState.matches = [
      {
        id: 1,
        timestamp: now - 60_000,
        date: '2026-03-07',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
      },
      {
        id: 2,
        timestamp: now + 1_000,
        date: '2026-03-07',
        mode: 'Fleet Battle',
        player: 'Pilot',
        teammates: ['Wing'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Loss',
        subType: 'Combat',
      },
    ];
    gameDataState.isMatchInProgress = true;
    gameDataState.matchStartTime = now;

    const { useAnalyticsData } = await import('./useAnalyticsData');
    const { result, rerender } = renderHook(() => useAnalyticsData('all'));

    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1]);

    gameDataState.isMatchInProgress = false;
    rerender();

    expect(result.current.filteredMatches.map((match) => match.id)).toEqual([1, 2]);
  });
});
