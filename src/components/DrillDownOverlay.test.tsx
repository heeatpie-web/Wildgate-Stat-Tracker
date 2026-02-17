import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import { DrillDownOverlay } from './DrillDownOverlay';

const setDrillDownTarget = vi.fn();

const matches: Match[] = [
  {
    id: 1,
    timestamp: 1_700_000_000_000,
    date: '2026-02-17',
    mode: 'Artifact Brawl',
    player: 'Pilot',
    teammates: ['Wingman'],
    opponents: ['EnemyOne', 'EnemyTwo'],
    hero: 'Hero',
    ship: 'Hunter (4 Player)',
    reachModifiers: [],
    kills: {},
    result: 'Win',
    subType: 'Combat',
  },
];

const gameDataState = {
  matches,
  drillDownTarget: { type: 'Teammate', name: 'Wingman' } as { type: 'Teammate'; name: string } | null,
  setDrillDownTarget,
};

const uiState = {
  activeMode: 'Artifact Brawl' as const,
};

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameDataState,
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

describe('DrillDownOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameDataState.drillDownTarget = { type: 'Teammate', name: 'Wingman' };
  });

  it('renders with dialog semantics', () => {
    render(<DrillDownOverlay />);
    expect(screen.getByRole('dialog', { name: /wingman/i })).toBeInTheDocument();
    expect(screen.getByText(/deep dive analysis/i)).toBeInTheDocument();
  });

  it('closes on escape key', () => {
    render(<DrillDownOverlay />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setDrillDownTarget).toHaveBeenCalledWith(null);
  });
});
