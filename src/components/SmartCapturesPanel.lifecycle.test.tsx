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
  getElectronAPI: vi.fn(() => ({ send: vi.fn() })),
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
    appStoreState.selectedMatchId = null;
    appStoreState.activeSection = 'tools';
    appStoreState.ocrMode = 'local';
  });

  it('stops background auto-repair while inactive and preserves the current tools state', async () => {
    const { default: SmartCapturesPanel } = await import('./SmartCapturesPanel');
    const { rerender } = render(<SmartCapturesPanel />);

    await waitFor(() => {
      expect(previewArtifactRepair).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(applyArtifactRepair).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    await act(async () => {
      rerender(<SmartCapturesPanel isActive={false} />);
    });
    expect(screen.getByText('Planned')).toBeInTheDocument();

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

    expect(previewArtifactRepair).toHaveBeenCalledTimes(1);
    expect(applyArtifactRepair).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Planned')).toBeInTheDocument();
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
});
