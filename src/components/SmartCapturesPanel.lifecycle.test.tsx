import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const gameData = {
  matches: [
    {
      id: 1,
      timestamp: 1_700_000_000_000,
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: ['Wingman'],
      opponents: ['Enemy'],
      hero: 'Adrian',
      ship: 'Hunter',
      reachModifiers: [],
      kills: {},
      artifacts: ['C:\\captures\\match-1.png'],
      result: 'Win',
      ocrState: 'queued',
    },
  ],
  updateMatch: vi.fn(),
  deleteMatch: vi.fn(),
  pilotRegistry: ['Pilot', 'Wingman'],
  addToRegistry: vi.fn(),
  setSelectedTeammates: vi.fn(),
  setSelectedOpponents: vi.fn(),
  setActiveShip: vi.fn(),
  setSessionTeams: vi.fn(),
  setSessionShipTypes: vi.fn(),
  setSelectedReachModifiers: vi.fn(),
  selectedTeammates: [],
  selectedOpponents: [],
  sessionTeams: {},
  sessionShipTypes: {},
  activeShip: 'Hunter',
  telemetryDetectedShip: undefined,
};

const uiState = {
  activeUser: 'Pilot',
  devMode: false,
  setToast: vi.fn(),
  setShowSettings: vi.fn(),
  smartCapturesFocusMatchId: null,
  setSmartCapturesFocusMatchId: vi.fn(),
  setActiveView: vi.fn(),
  showWizard: null,
  pushNotification: vi.fn(),
  setSmartCapturesOpenOcrReviewMatchId: vi.fn(),
};

const appStoreState = {
  ocrMode: 'local',
  ocrRegions: undefined,
  setOcrRegions: vi.fn(),
  activeSection: 'tools',
  setActiveSection: vi.fn(),
  selectedMatchId: null,
  setSelectedMatchId: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  queueOnly: false,
  setQueueOnly: vi.fn(),
  showResolved: true,
  setShowResolved: vi.fn(),
  addPendingReview: vi.fn(),
  pendingReviews: [],
  removePendingReviews: vi.fn(),
  queueCollapsed: false,
  toggleQueueCollapsed: vi.fn(),
  resolveOcrAlias: vi.fn(() => null),
  ocrAutoApplyMinScore: 0.85,
  ocrAutoApplyMinCount: 2,
  ocrLearningStrictMode: false,
  ocrLearningReviewMode: 'balanced',
  ocrLearningAutoPromoteCount: 3,
  dismissedRosterCandidateKeys: [],
  matches: gameData.matches,
  updateMatch: vi.fn(),
};

const previewArtifactRepair = vi.fn();
const applyArtifactRepair = vi.fn();
const rerunOCRMulti = vi.fn();
const getMatchArtifactsStructured = vi.fn();

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

const useAppStoreMock = Object.assign(
  (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
  {
    getState: () => appStoreState,
  }
);

vi.mock('../store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('../utils/artifactService', () => ({
  getMatchArtifactsStructured,
  rerunOCRMulti,
  removeMatchArtifact: vi.fn(),
  addMatchArtifact: vi.fn(),
  reassignMatchArtifact: vi.fn(),
  previewArtifactRepair,
  applyArtifactRepair,
}));

vi.mock('../utils/electronAPI', () => ({
  getElectronAPI: vi.fn(() => ({
    send: vi.fn(),
    invoke: vi.fn(async () => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnY4nQAAAAASUVORK5CYII='),
  })),
}));

vi.mock('./smart-captures/SmartCapturesShell', () => ({
  SmartCapturesShell: ({ content }: { content: React.ReactNode }) => <div>{content}</div>,
}));

vi.mock('./smart-captures/SmartCapturesToolsView', () => ({
  SmartCapturesToolsView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./OcrRegionEditorModal', () => ({
  default: () => null,
}));

vi.mock('./ui', () => ({
  Button: ({ children, loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button data-loading={loading === true ? 'true' : undefined} type="button" {...props}>{children}</button>
  ),
}));

describe('SmartCapturesPanel paused lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameData.matches = [
      {
        id: 1,
        timestamp: 1_700_000_000_000,
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: ['Wingman'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        artifacts: ['C:\\captures\\match-1.png'],
        result: 'Win',
        ocrState: 'queued',
      },
    ];
    appStoreState.matches = gameData.matches;
    previewArtifactRepair.mockResolvedValue({
      summary: {
        candidatesScanned: 4,
        candidatesEligible: 2,
        plannedLinks: 1,
      },
    });
    applyArtifactRepair.mockResolvedValue({
      summary: {
        candidatesScanned: 4,
        candidatesEligible: 2,
        plannedLinks: 1,
        appliedLinks: 1,
      },
    });
    rerunOCRMulti.mockResolvedValue({
      perFile: [
        {
          success: true,
          imagePath: 'C:\\captures\\match-1.png',
          data: {
            captureTimestamp: Date.now(),
            teammates: [],
            opponentTeams: [],
            reachModifiers: [],
            artifacts: ['C:\\captures\\match-1.png'],
          },
        },
      ],
      data: {
        captureTimestamp: Date.now(),
        teammates: [],
        opponentTeams: [],
        reachModifiers: [],
        artifacts: ['C:\\captures\\match-1.png'],
      },
    });
    getMatchArtifactsStructured.mockResolvedValue({
      images: [],
      imageFiles: [],
      telemetry: [],
      missingImages: [],
      resolvedFromDisk: false,
    });
    uiState.smartCapturesFocusMatchId = null;
    uiState.setSmartCapturesFocusMatchId = vi.fn((id: number | null) => {
      uiState.smartCapturesFocusMatchId = id;
    });
    appStoreState.selectedMatchId = null;
    appStoreState.setSelectedMatchId = vi.fn((id: number | null) => {
      appStoreState.selectedMatchId = id;
    });
    appStoreState.searchQuery = '';
    appStoreState.setSearchQuery = vi.fn((query: string) => {
      appStoreState.searchQuery = query;
    });
    appStoreState.queueOnly = false;
    appStoreState.setQueueOnly = vi.fn((value: boolean) => {
      appStoreState.queueOnly = value;
    });
    appStoreState.activeSection = 'tools';
    appStoreState.ocrMode = 'local';
  });

  it('does not auto-run artifact repair on mount or rerender', async () => {
    const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
    const { rerender } = render(<SmartCapturesPanel />);

    expect(previewArtifactRepair).not.toHaveBeenCalled();
    expect(applyArtifactRepair).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<SmartCapturesPanel isActive={false} />);
    });
    expect(previewArtifactRepair).not.toHaveBeenCalled();
    expect(applyArtifactRepair).not.toHaveBeenCalled();

    gameData.matches = [
      ...gameData.matches,
      {
        id: 2,
        timestamp: 1_700_000_100_000,
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: [],
        opponents: [],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        artifacts: ['C:\\captures\\match-2.png'],
        result: 'Loss',
        ocrState: 'queued',
      },
    ];
    appStoreState.matches = gameData.matches;

    await act(async () => {
      rerender(<SmartCapturesPanel isActive={false} />);
    });

    expect(previewArtifactRepair).not.toHaveBeenCalled();
    expect(applyArtifactRepair).not.toHaveBeenCalled();
  });

  it('uses the latest OCR mode for keyboard-triggered re-analysis after a mode change', async () => {
    appStoreState.activeSection = 'capture';
    appStoreState.selectedMatchId = 1;
    const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
    const { rerender } = render(<SmartCapturesPanel />);

    appStoreState.ocrMode = 'cloud';
    rerender(<SmartCapturesPanel />);

    fireEvent.keyDown(window, { key: 'r' });

    await waitFor(() => {
      expect(rerunOCRMulti).toHaveBeenCalledWith(
        ['C:\\captures\\match-1.png'],
        'Pilot',
        'cloud',
        undefined,
        expect.anything(),
      );
    });
  });

  it('does not trigger artifact repair just because smart-capture rows appear', async () => {
    gameData.matches = [
      {
        id: 202,
        timestamp: Date.parse('2026-03-17T00:26:00-06:00'),
        date: '3/17/2026',
        mode: 'Artifact Brawl',
        player: 'Pilot',
        teammates: ['Wingman'],
        opponents: ['Enemy'],
        hero: 'Adrian',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        artifacts: [],
        result: 'Win',
        ocrState: 'queued',
      },
    ];
    appStoreState.matches = gameData.matches;

    const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
    render(<SmartCapturesPanel />);

    expect(previewArtifactRepair).not.toHaveBeenCalled();
    expect(applyArtifactRepair).not.toHaveBeenCalled();
  });

  it('reveals a focused match by clearing filters before selecting it', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-17T12:00:00-06:00'));
      appStoreState.activeSection = 'capture';
      appStoreState.queueOnly = true;
      appStoreState.searchQuery = 'adrian';
      gameData.matches = [
        {
          id: 401,
          timestamp: Date.parse('2026-03-17T09:15:00-06:00'),
          date: '3/17/2026',
          mode: 'Artifact Brawl',
          player: 'Pilot',
          teammates: ['Wingman'],
          opponents: ['Enemy'],
          hero: 'Adrian',
          ship: 'Hunter',
          reachModifiers: [],
          kills: {},
          artifacts: ['C:\\captures\\match-401.png'],
          result: 'Win',
          ocrState: 'queued',
        },
        {
          id: 402,
          timestamp: Date.parse('2026-03-16T22:40:00-06:00'),
          date: '3/16/2026',
          mode: 'Fleet Battle',
          player: 'Pilot',
          teammates: ['Wingman'],
          opponents: ['Specter'],
          hero: 'Kae',
          ship: 'Scout',
          reachModifiers: [],
          kills: {},
          artifacts: ['C:\\captures\\match-402.png'],
          result: 'Loss',
          ocrState: 'queued',
        },
      ];
      appStoreState.matches = gameData.matches;
      uiState.smartCapturesFocusMatchId = 402;

      const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
      await act(async () => {
        render(<SmartCapturesPanel />);
        await Promise.resolve();
      });

      expect(appStoreState.setQueueOnly).toHaveBeenCalledWith(false);
      expect(appStoreState.setSearchQuery).toHaveBeenCalledWith('');
      expect(appStoreState.setSelectedMatchId).toHaveBeenCalledWith(402);
      expect(uiState.setSmartCapturesFocusMatchId).toHaveBeenCalledWith(null);
      expect(screen.getByPlaceholderText('Search players, heroes, ships...')).toHaveValue('');
      expect(screen.getByLabelText('Match day')).toHaveValue('2026-03-16');
      expect(
        screen.getAllByText((_, element) => Boolean(
          element?.textContent?.includes('Scout') && element.textContent.includes('Kae')
        )).length
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('portals the screenshot viewer outside the clipped detail pane', async () => {
    appStoreState.activeSection = 'capture';
    appStoreState.selectedMatchId = 1;
    getMatchArtifactsStructured.mockResolvedValue({
      images: ['C:\\captures\\match-1.png'],
      imageFiles: [],
      telemetry: [],
      missingImages: [],
      resolvedFromDisk: false,
    });

    const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
    const { container } = render(<SmartCapturesPanel />);

    await waitFor(() => {
      expect(container.querySelector('.sc-shot-thumb button')).not.toBeNull();
    });

    const screenshotButton = container.querySelector('.sc-shot-thumb button') as HTMLButtonElement | null;
    expect(screenshotButton).not.toBeNull();
    fireEvent.click(screenshotButton!);

    const dialog = await screen.findByRole('dialog', { name: /match screenshots/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const detailPane = container.querySelector('.sc-detail-pane');
    expect(detailPane?.contains(dialog)).toBe(false);
  });

  it('switches the queue day to the new local day when midnight passes and a new match arrives', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-16T23:58:00-06:00'));
      appStoreState.activeSection = 'capture';
      previewArtifactRepair.mockResolvedValue({
        summary: {
          candidatesScanned: 0,
          candidatesEligible: 0,
          plannedLinks: 0,
        },
      });
      applyArtifactRepair.mockResolvedValue({
        summary: {
          candidatesScanned: 0,
          candidatesEligible: 0,
          plannedLinks: 0,
          appliedLinks: 0,
        },
      });
      gameData.matches = [
        {
          id: 101,
          timestamp: Date.parse('2026-03-16T23:45:00-06:00'),
          date: '3/16/2026',
          mode: 'Artifact Brawl',
          player: 'Pilot',
          teammates: [],
          opponents: ['Enemy'],
          hero: 'Adrian',
          ship: 'Hunter',
          reachModifiers: [],
          kills: {},
          artifacts: ['C:\\captures\\match-101.png'],
          result: 'Win',
          ocrState: 'queued',
        },
      ];
      appStoreState.matches = gameData.matches;

      const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
      const { rerender } = render(<SmartCapturesPanel />);

      expect(screen.getByLabelText('Match day')).toHaveValue('2026-03-16');

      act(() => {
        vi.setSystemTime(new Date('2026-03-17T00:26:00-06:00'));
        gameData.matches = [
          {
            id: 202,
            timestamp: Date.parse('2026-03-17T00:26:00-06:00'),
            date: '3/17/2026',
            mode: 'Artifact Brawl',
            player: 'Pilot',
            teammates: ['Wingman'],
            opponents: ['Enemy'],
            hero: 'Adrian',
            ship: 'Hunter',
            reachModifiers: [],
            kills: {},
            artifacts: [],
            result: 'Win',
            ocrState: 'queued',
          },
          ...gameData.matches,
        ];
        appStoreState.matches = gameData.matches;
        rerender(<SmartCapturesPanel />);
      });

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByLabelText('Match day')).toHaveValue('2026-03-17');
    } finally {
      vi.useRealTimers();
    }
  });
});
