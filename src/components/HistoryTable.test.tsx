import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const matches = [
  {
    id: 1,
    timestamp: 1_700_000_000_000,
    player: 'Pilot',
    ship: 'Hunter',
    hero: 'Adrian',
    result: 'Win',
    subType: 'Combat',
    time: '12:34',
    teammates: ['Wingman'],
    opponents: ['Enemy'],
    reachModifiers: ['Storm'],
    notes: '',
    kills: {},
    artifacts: [],
    isPinned: false,
  },
];

const gameData = {
  matches,
  deleteMatch: vi.fn(),
  updateMatch: vi.fn(),
  toggleMatchPin: vi.fn(),
  setDrillDownTarget: vi.fn(),
};

const uiState = {
  setActiveView: vi.fn(),
  setSmartCapturesFocusMatchId: vi.fn(),
  activeUser: 'Pilot',
  pushNotification: vi.fn(),
};

const appStoreState = {
  ocrMode: 'local',
  ocrRegions: undefined,
};

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => ({
    language: 'en',
  }),
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

vi.mock('./EditMatchModal', () => ({
  EditMatchModal: () => null,
}));

vi.mock('./LocalImage', () => ({
  LocalImage: () => null,
}));

vi.mock('../utils/artifactService', () => ({
  getMatchArtifactsStructured: vi.fn(),
  rerunOCROnArtifact: vi.fn(),
}));

vi.mock('./history/historyExport', () => ({
  exportMatchesAsImage: vi.fn(),
}));

vi.mock('./ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

describe('HistoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops the relative-time refresh while inactive and preserves search input state', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { default: HistoryTable } = await import('./HistoryTable');

    const { rerender } = render(<HistoryTable />);
    const intervalCountAfterActiveRender = setIntervalSpy.mock.calls.length;
    expect(intervalCountAfterActiveRender).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/search matches/i), {
      target: { value: 'Wingman' },
    });
    expect(screen.getByPlaceholderText(/search matches/i)).toHaveValue('Wingman');

    rerender(<HistoryTable isActive={false} />);

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(setIntervalSpy).toHaveBeenCalledTimes(intervalCountAfterActiveRender);
    expect(screen.getByPlaceholderText(/search matches/i)).toHaveValue('Wingman');

    rerender(<HistoryTable isActive />);

    expect(setIntervalSpy.mock.calls.length).toBe(intervalCountAfterActiveRender + 1);
    expect(screen.getByPlaceholderText(/search matches/i)).toHaveValue('Wingman');
  });
});
