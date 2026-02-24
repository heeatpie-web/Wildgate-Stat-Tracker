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

describe('SquadronPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameData.activeShip = 'Hunter';
    gameData.shipSource = 'telemetry';
    gameData.telemetryDetectedShip = 'Hunter (2 Player)';
    gameData.activeHero = 'Adrian';
    gameData.heroSource = 'telemetry';
    gameData.telemetryDetectedHero = 'Adrian';
  });

  it('shows telemetry-selected weapon and equipment details in standard mode without a header telemetry badge', () => {
    render(<SquadronPanel />);

    expect(screen.getByText('Ship Weapons')).toBeInTheDocument();
    expect(screen.getByText('Equipment')).toBeInTheDocument();
    expect(screen.queryByText(/telemetry active/i)).not.toBeInTheDocument();
    expect(screen.getByText('Double Whammy')).toBeInTheDocument();
    expect(screen.getByText('Repair Drone')).toBeInTheDocument();
  });

  it('shows telemetry-selected weapon and equipment details in compact mode without a header telemetry badge', () => {
    render(<SquadronPanel density="compact" />);

    expect(screen.getByText('Ship Weapons')).toBeInTheDocument();
    expect(screen.getByText('Equipment')).toBeInTheDocument();
    expect(screen.queryByText(/telemetry active/i)).not.toBeInTheDocument();
  });

  it('highlights ship selection when telemetry and active ship use equivalent labels', () => {
    render(<SquadronPanel />);

    const hunterButton = screen.getByRole('button', { name: 'Hunter' });
    expect(hunterButton.className).toContain('border-md-sys-primary/45');
  });
});
