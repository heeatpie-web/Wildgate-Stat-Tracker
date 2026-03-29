import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  telemetryLifecycleStage: 'idle',
  telemetryAutomationStatus: null as any,
};

const gameDataState = {
  matches: [] as any[],
};

const appStoreState = {
  activeUser: 'Pilot',
  sessionStartTime: 1_700_000_000_000,
  pregameAdviceEnabled: true,
};

vi.mock('./recording/ActionPanel', () => ({
  ActionPanel: (props: any) => (
    <div data-testid="ActionPanel" data-props={JSON.stringify(props)}>
      ActionPanel
    </div>
  ),
}));

vi.mock('./recording/SquadronPanel', () => ({
  SquadronPanel: (props: any) => (
    <div data-testid="SquadronPanel" data-props={JSON.stringify(props)}>
      SquadronPanel
    </div>
  ),
}));

vi.mock('./recording/RosterPanel', () => ({
  RosterPanel: () => <div data-testid="RosterPanel">RosterPanel</div>,
}));

vi.mock('./recording/MissionPanel', () => ({
  MissionPanel: () => <div data-testid="MissionPanel">MissionPanel</div>,
}));

vi.mock('./PregameAdvicePanel', () => ({
  PregameAdvicePanel: (props: any) => (
    <div data-testid="PregameAdvicePanel" data-props={JSON.stringify(props)}>
      PregameAdvicePanel
    </div>
  ),
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

function setViewport(w: number, h: number) {
  (window as any).innerWidth = w;
  (window as any).innerHeight = h;
}

const makeActiveDraftMatch = (overrides: Record<string, unknown> = {}) => ({
  id: 404,
  timestamp: 1_700_000_050_000,
  date: '2026-03-28',
  mode: 'Artifact Brawl',
  player: 'Pilot',
  teammates: ['Wing1'],
  opponents: ['Enemy1'],
  hero: 'Adrian',
  ship: 'Hunter',
  reachModifiers: [],
  kills: {},
  result: 'Ongoing',
  subType: 'Telemetry Draft',
  telemetryDraftState: 'active',
  ...overrides,
});

describe('RecordingView', () => {
  beforeEach(() => {
    setViewport(1920, 1080);
    uiState.telemetryLifecycleStage = 'idle';
    uiState.telemetryAutomationStatus = null;
    gameDataState.matches = [];
    appStoreState.activeUser = 'Pilot';
    appStoreState.sessionStartTime = 1_700_000_000_000;
    appStoreState.pregameAdviceEnabled = true;
  });

  it('renders standard layout with SquadronPanel primary and ActionPanel compact when no intel workspace is active', async () => {
    setViewport(1600, 1000);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    expect(screen.getByTestId('SquadronPanel')).toBeInTheDocument();
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /intel/i })).toBeNull();

    const squadProps = screen.getByTestId('SquadronPanel').getAttribute('data-props') || '';
    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(squadProps).toContain('"density":"compact"');
    expect(actionProps).toContain('"density":"compact"');

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root?.children[2]?.className).toContain('pl-1');
  }, 20000);

  it('renders compact left panel tabs on short heights and swaps Actions vs Loadout', async () => {
    setViewport(1600, 680);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('overflow-y-auto');

    const actionsBtn = screen.getAllByRole('button', { name: /actions/i })[0];
    const loadoutBtn = screen.getAllByRole('button', { name: /loadout/i })[0];
    expect(actionsBtn).toBeInTheDocument();
    expect(loadoutBtn).toBeInTheDocument();

    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('SquadronPanel')).toBeNull();

    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(actionProps).toContain('"density":"compact"');

    fireEvent.click(loadoutBtn);
    expect(screen.getByTestId('SquadronPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('ActionPanel')).toBeNull();

    const squadProps = screen.getByTestId('SquadronPanel').getAttribute('data-props') || '';
    expect(squadProps).toContain('"density":"compact"');

    fireEvent.click(actionsBtn);
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('SquadronPanel')).toBeNull();
  }, 20000);

  it('uses stacked layout on narrow widths with page-level scroll', async () => {
    setViewport(900, 900);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('overflow-y-auto');

    expect(screen.getAllByRole('button', { name: /actions/i })[0]).toBeInTheDocument();
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();

    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(actionProps).toContain('"density":"compact"');

    expect(screen.getByTestId('RosterPanel')).toBeInTheDocument();
    expect(screen.getByTestId('MissionPanel')).toBeInTheDocument();
  });

  it('shows a dedicated intel workspace tab only while an active telemetry draft exists', async () => {
    gameDataState.matches = [makeActiveDraftMatch()];
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    const intelTab = screen.getByRole('tab', { name: /intel/i });
    expect(intelTab).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /controls/i })).toBeInTheDocument();
    expect(screen.queryByTestId('PregameAdvicePanel')).toBeNull();

    fireEvent.click(intelTab);

    expect(screen.getByTestId('PregameAdvicePanel')).toBeInTheDocument();
    expect(screen.queryByTestId('ActionPanel')).toBeNull();
    expect(screen.queryByTestId('SquadronPanel')).toBeNull();
  });

  it('falls back to the controls workspace when the active match ends', async () => {
    gameDataState.matches = [makeActiveDraftMatch()];
    const { RecordingView } = await import('./RecordingView');

    const { rerender } = render(<RecordingView />);
    fireEvent.click(screen.getByRole('tab', { name: /intel/i }));
    expect(screen.getByTestId('PregameAdvicePanel')).toBeInTheDocument();

    gameDataState.matches = [];
    rerender(<RecordingView />);

    expect(screen.queryByRole('tab', { name: /intel/i })).toBeNull();
    expect(screen.queryByTestId('PregameAdvicePanel')).toBeNull();
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.getByTestId('SquadronPanel')).toBeInTheDocument();
  });
});
