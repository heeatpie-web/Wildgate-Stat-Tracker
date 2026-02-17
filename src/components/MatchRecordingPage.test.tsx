import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MatchRecordingPage } from './MatchRecordingPage';
import type { Match } from '../types';

const updateMatch = vi.fn();
const setActiveView = vi.fn();

const matches: Match[] = [
  {
    id: 1001,
    timestamp: 1_700_000_000_000,
    date: '2026-02-17',
    mode: 'Artifact Brawl',
    player: 'Pilot',
    teammates: ['Wingman'],
    opponents: ['Enemy'],
    hero: 'Hero',
    ship: 'Hunter (4 Player)',
    reachModifiers: [],
    kills: {},
    result: 'Win',
    subType: 'Combat',
    artifacts: ['capture://one.png'],
  },
];

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => ({
    matches,
    updateMatch,
  }),
}));

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => ({
    activeMode: 'Artifact Brawl',
    setActiveView,
  }),
}));

vi.mock('../utils/artifactService', () => ({
  getMatchArtifactsStructured: vi.fn(async () => ({ images: [] })),
}));

describe('MatchRecordingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens screenshot lightbox dialog and closes on Escape', async () => {
    render(<MatchRecordingPage />);

    const openButton = await screen.findByRole('button', { name: /open screenshot 1 preview/i });
    fireEvent.click(openButton);

    const dialog = screen.getByRole('dialog', { name: /screenshot preview/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /screenshot preview/i })).not.toBeInTheDocument();
    });
  });
});
