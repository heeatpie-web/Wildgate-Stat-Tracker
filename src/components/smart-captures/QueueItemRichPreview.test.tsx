import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueueItemRichPreview } from './QueueItemRichPreview';
import type { Match } from '../../types';

const baseMatch: Match = {
  id: 12345,
  timestamp: new Date('2026-02-14T17:45:00.000Z').getTime(),
  date: '2026-02-14',
  mode: 'Artifact Brawl',
  player: 'TestPilot',
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
  it('renders essential queue fields and omits confidence noise', () => {
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

    expect(screen.getByText('#73')).toBeInTheDocument();
    const previewButton = screen.getByRole('button', { name: /73/i });
    expect(previewButton).toHaveAttribute('title', expect.stringContaining('Match 73 - '));
    expect(previewButton).toHaveAttribute('title', expect.stringContaining('14th'));
    expect(screen.getByText(/Feb 14th 10:45am/i)).toBeInTheDocument();
    expect(screen.getByText(/Hunter \(4 Player\)/)).toBeInTheDocument();
    expect(screen.queryByText(/ID 12345/)).toBeNull();
    expect(screen.getByText(/^Win$/)).toBeInTheDocument();
    expect(screen.getByLabelText('Status Ready to save')).toBeInTheDocument();
    expect(screen.queryByText('85%')).toBeNull();
    expect(screen.queryByText(/Spec:/i)).toBeNull();
    expect(screen.queryByText(/Practical:/i)).toBeNull();
    expect(screen.queryByText(/\b\d+\s+warnings?\b/i)).toBeNull();
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
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('SAVE')).toBeInTheDocument();
  });

  it('does not show pending label when match is saved without confidence', () => {
    const savedNoConfidence: Match = {
      ...baseMatch,
      ocrState: 'saved',
      ocrDebug: undefined,
    };

    render(
      <QueueItemRichPreview
        match={savedNoConfidence}
        displayNumber={12}
        rawMatchId={savedNoConfidence.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Status Saved')).toBeInTheDocument();
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText(/\b\d+\s+warnings?\b/i)).toBeNull();
  });

  it('does not render telemetry mismatch warning badges in queue rows', () => {
    const durationMismatch: Match = {
      ...baseMatch,
      time: '05:00',
      telemetryConsistency: {
        telemetryDurationSeconds: 420,
        durationToleranceSeconds: 45,
      },
    };

    render(
      <QueueItemRichPreview
        match={durationMismatch}
        displayNumber={18}
        rawMatchId={durationMismatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Duration Off by/i)).toBeNull();
    expect(screen.queryByLabelText('Duration mismatch')).toBeNull();
    expect(screen.getByLabelText('Status Ready to save')).toBeInTheDocument();
    expect(screen.queryByText(/\b\d+\s+warnings?\b/i)).toBeNull();
  });

  it('shows awaiting result for telemetry drafts that already reached postmatch', () => {
    const telemetryReadyMatch: Match = {
      ...baseMatch,
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      telemetryDraftState: 'ready',
      artifacts: [],
      ocrDebug: undefined,
      ocrState: 'queued',
    };

    render(
      <QueueItemRichPreview
        match={telemetryReadyMatch}
        displayNumber={24}
        rawMatchId={telemetryReadyMatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Awaiting Result')).toBeInTheDocument();
    expect(screen.queryByText(/^Ongoing$/)).toBeNull();
  });

  it('shows a practice range indicator when the match came from training', () => {
    render(
      <QueueItemRichPreview
        match={{ ...baseMatch, isPracticeRange: true }}
        displayNumber={31}
        rawMatchId={baseMatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Practice Range')).toHaveAttribute('title', 'Practice Range');
  });

  it('renders a category badge in both expanded and compact queue rows', () => {
    const categorizedMatch: Match = {
      ...baseMatch,
      matchCategory: 'Winter Cup',
    };

    const { rerender } = render(
      <QueueItemRichPreview
        match={categorizedMatch}
        displayNumber={44}
        rawMatchId={categorizedMatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Winter Cup')).toBeInTheDocument();

    rerender(
      <QueueItemRichPreview
        match={categorizedMatch}
        compact
        displayNumber={44}
        rawMatchId={categorizedMatch.id}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Winter Cup')).toBeInTheDocument();
  });
});

