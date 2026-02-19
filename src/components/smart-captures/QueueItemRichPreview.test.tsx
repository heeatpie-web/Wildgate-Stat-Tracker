import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueueItemRichPreview } from './QueueItemRichPreview';
import type { Match } from '../../types';

const baseMatch: Match = {
  id: 12345,
  timestamp: Date.now(),
  date: '2026-02-14',
  mode: 'Artifact Brawl',
  player: 'Alec',
  teammates: ['Rook'],
  opponents: ['Bandit'],
  hero: 'Sal',
  ship: 'Hunter (4 Player)',
  reachModifiers: [],
  kills: {},
  result: 'Win',
  subType: 'Combat',
  artifacts: ['capture-1.png'],
  ocrDebug: { confidence: 85 },
};

describe('QueueItemRichPreview', () => {
  it('renders match, outcome, status and confidence', () => {
    render(
      <QueueItemRichPreview
        match={baseMatch}
        displayNumber={73}
        rawMatchId={baseMatch.id}
        isSelected={false}
        isMultiSelected={false}
        onClick={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/^73$/)).toBeInTheDocument();
    expect(screen.queryByText(/ID 12345/)).toBeNull();
    expect(screen.getByText('Win')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/bundled/i)).toBeInTheDocument();
  });

  it('renders compact collapsed row with icon and short number', () => {
    render(
      <QueueItemRichPreview
        match={baseMatch}
        compact
        displayNumber={7}
        rawMatchId={baseMatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /7/ })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
