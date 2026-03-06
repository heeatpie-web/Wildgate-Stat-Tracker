import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SquadronPanel } from './SquadronPanel';

const gameData = {
  activeShip: 'Hunter (2 Player)',
  shipSource: 'telemetry' as 'manual' | 'telemetry' | 'ocr',
  telemetryDetectedShip: 'Hunter (2 Player)',
  setActiveShip: vi.fn(),
  activeHero: 'Adrian',
  heroSource: 'telemetry' as 'manual' | 'telemetry' | 'ocr',
  telemetryDetectedHero: 'Adrian',
  setActiveHero: vi.fn(),
  isMatchInProgress: true,
  currentLoadout: {
    hero: 'Adrian',
    ship: 'Hunter (2 Player)',
    weapons: ['Double Whammy'],
    equipment: ['Repair Drone'],
  },
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

const uiState = {
  telemetryStatus: { exists: true, lastEventAt: Date.now() },
};

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

describe('SquadronPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.telemetryStatus = { exists: true, lastEventAt: Date.now() };
    gameData.activeShip = 'Hunter';
    gameData.shipSource = 'telemetry';
    gameData.telemetryDetectedShip = 'Hunter (2 Player)';
    gameData.activeHero = 'Adrian';
    gameData.heroSource = 'telemetry';
    gameData.telemetryDetectedHero = 'Adrian';
    gameData.isMatchInProgress = true;
  });

  it('shows ship and prospector sections in standard mode with a single telemetry summary badge', () => {
    render(<SquadronPanel />);

    expect(screen.getByText('Ship and Loadout')).toBeInTheDocument();
    expect(screen.getByText('Ship')).toBeInTheDocument();
    expect(screen.getByText('Prospector')).toBeInTheDocument();
    expect(screen.getByTestId('recording-telemetry-summary')).toHaveTextContent('Telemetry 3/3');
    expect(screen.queryAllByText(/^Telemetry$/i)).toHaveLength(0);
  });

  it('shows ship and prospector sections in compact mode with a single telemetry summary badge', () => {
    render(<SquadronPanel density="compact" />);

    expect(screen.getByText('Ship and Loadout')).toBeInTheDocument();
    expect(screen.getByText('Ship')).toBeInTheDocument();
    expect(screen.getByText('Prospector')).toBeInTheDocument();
    expect(screen.getByTestId('recording-telemetry-summary')).toHaveTextContent('Telemetry 3/3');
    expect(screen.queryAllByText(/^Telemetry$/i)).toHaveLength(0);
  });

  it('highlights ship selection when telemetry and active ship use equivalent labels', () => {
    render(<SquadronPanel />);

    const hunterButton = screen.getByRole('button', { name: 'Hunter' });
    expect(hunterButton.className).toContain('border-md-sys-primary/45');
  });

  it('does not show a match telemetry signal from stale idle status alone', () => {
    gameData.telemetryDetectedShip = undefined as unknown as string;
    gameData.telemetryDetectedHero = undefined as unknown as string;
    gameData.isMatchInProgress = false;
    uiState.telemetryStatus = { exists: true, lastEventAt: Date.now() - 120_000 };

    render(<SquadronPanel />);

    expect(screen.queryByTestId('recording-telemetry-summary')).not.toBeInTheDocument();
  });
});
