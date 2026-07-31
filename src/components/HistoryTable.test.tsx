import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const matches: any[] = [
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
    artifacts: ['C:\\captures\\match-1.png'],
    isPinned: false,
  },
];

const gameData = {
  matches,
  deleteMatch: vi.fn(),
  updateMatch: vi.fn(),
  toggleMatchPin: vi.fn(),
  toggleMatchArchive: vi.fn(),
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
const confirmSpy = vi.spyOn(window, 'confirm');

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
  LocalImage: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt} />,
}));

const buildMatch = (overrides: Partial<(typeof matches)[number]> = {}) => ({
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
  artifacts: ['C:\\captures\\match-1.png'],
  isPinned: false,
  mapSeed: 'A1B2C3D4',
  canonicalMatchNumber: 1,
  mapType: 'Cryon',
  artifactSource: 'ice',
  ocrDebug: { hazards: ['Quake'] },
  ...overrides,
});

vi.mock('../utils/artifactService', () => ({
  getMatchArtifactsStructured: vi.fn(),
  rerunOCROnArtifact: vi.fn(),
  removeAllMatchArtifacts: vi.fn().mockResolvedValue({ removedPaths: [], failedPaths: [] }),
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
    confirmSpy.mockReturnValue(true);
    matches.length = 1;
    matches[0].isPracticeRange = false;
    matches[0].matchCategory = undefined;
    matches[0].mapSeed = 'A1B2C3D4';
    matches[0].canonicalMatchNumber = 1;
    matches[0].mapType = 'Cryon';
    matches[0].artifactSource = 'ice';
    matches[0].ocrDebug = { hazards: ['Storm'] };
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), write: vi.fn() } });
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

  it('cleans up artifacts before deleting a single history match', async () => {
    const { removeAllMatchArtifacts } = await import('../utils/artifactService');
    vi.mocked(removeAllMatchArtifacts).mockResolvedValue({
      removedPaths: ['C:\\captures\\match-1.png'],
      failedPaths: [],
    });
    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    fireEvent.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(removeAllMatchArtifacts).toHaveBeenCalledWith(1, ['C:\\captures\\match-1.png']);
      expect(gameData.deleteMatch).toHaveBeenCalledWith(1);
    });
  });

  it('runs shared artifact cleanup for bulk deletes before removing the selected matches', async () => {
    const { removeAllMatchArtifacts } = await import('../utils/artifactService');
    vi.mocked(removeAllMatchArtifacts).mockResolvedValue({
      removedPaths: ['C:\\captures\\match-1.png'],
      failedPaths: [],
    });
    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    fireEvent.click(screen.getByLabelText('Select match'));
    fireEvent.click(screen.getByTitle('Delete selected matches'));
    fireEvent.click(await screen.findByRole('button', { name: /delete all/i }));

    await waitFor(() => {
      expect(removeAllMatchArtifacts).toHaveBeenCalledWith(1, ['C:\\captures\\match-1.png']);
      expect(gameData.deleteMatch).toHaveBeenCalledWith(1);
    });
  });

  it('shows a hover indicator for practice-range matches', async () => {
    matches[0].isPracticeRange = true;
    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    expect(screen.getByLabelText('Practice Range')).toHaveAttribute('title', 'Practice Range');
  });

  it('shows match categories in history rows and the detail modal', async () => {
    matches[0].matchCategory = 'League Night';
    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    expect(screen.getByText('League Night')).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText('Win'));

    expect(await screen.findAllByText('League Night')).not.toHaveLength(0);
  });

  it('copies the seed from the combined history row and opens smart captures from the match number', async () => {
    matches[0] = buildMatch();
    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    fireEvent.click(screen.getByRole('button', { name: /a1b2c3d4/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('A1B2C3D4');

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(uiState.setSmartCapturesFocusMatchId).toHaveBeenCalledWith(1);
    expect(uiState.setActiveView).toHaveBeenCalledWith('smart-captures');
  });

  it('opens the match details modal to show the tactical map preview, seed, and combined hazards', async () => {
    matches[0] = buildMatch();
    const { getMatchArtifactsStructured } = await import('../utils/artifactService');
    vi.mocked(getMatchArtifactsStructured).mockResolvedValue({
      images: ['C:/caps/capture_map_1.png'],
      imageFiles: [
        { artifactId: 'b', filename: 'capture_map_1.png', path: 'C:/caps/capture_map_1.png', screenshotType: 'tactical_map' },
      ],
      telemetry: [],
      missingImages: [],
      resolvedFromDisk: true,
    });

    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    fireEvent.doubleClick(screen.getByText('Win'));

    expect(screen.getByText('Map Screen')).toBeInTheDocument();
    expect(await screen.findByAltText('Tactical map capture')).toHaveAttribute('src', 'C:/caps/capture_map_1.png');
    expect(screen.getAllByText('A1B2C3D4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Storm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quake').length).toBeGreaterThan(0);
  });

  it('lets multiple hazards be selected from the condensed hazard filter', async () => {
    matches[0] = buildMatch({ id: 1, reachModifiers: ['Storm'], ocrDebug: { hazards: ['Quake'] }, mapSeed: 'AAAA1111' });
    matches.push(buildMatch({
      id: 2,
      mapSeed: 'BBBB2222',
      reachModifiers: ['Ashfall'],
      ocrDebug: { hazards: ['Hail'] },
      canonicalMatchNumber: 2,
      result: 'Loss',
    }));

    const { default: HistoryTable } = await import('./HistoryTable');
    render(<HistoryTable />);

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByRole('button', { name: /selected|select hazards or modifiers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Storm' }));
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ashfall' }));

    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });
});
