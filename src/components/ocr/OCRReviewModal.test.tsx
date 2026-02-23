import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { OCRExtractedData } from '../../utils/ocr/ocrTypes';

const appStoreState = {
  recordOcrCorrection: vi.fn(),
  ocrBestGuessThresholds: {
    cloud: { player: 80, mod: 80, ship: 80 },
    merged: { player: 80, mod: 80, ship: 80 },
    local: { player: 80, mod: 80, ship: 80 },
    lowConfidenceBump: 5,
  },
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector?: ((state: typeof appStoreState) => unknown)) => (
    typeof selector === 'function' ? selector(appStoreState) : appStoreState
  ),
}));

const buildData = (): OCRExtractedData => ({
  screenshotType: 'crew_hub',
  teammates: [{ name: 'PilotOne', confidence: 86 }],
  opponentTeams: [],
  reachModifiers: [],
  enemyShips: [],
  overallConfidence: 84,
  captureTimestamp: Date.now(),
});

describe('OCRReviewModal accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders with dialog semantics and closes via Escape', async () => {
    const { OCRReviewModal } = await import('./OCRReviewModal');
    const onCancel = vi.fn();

    render(
      <OCRReviewModal
        data={buildData()}
        onApply={vi.fn()}
        onCancel={onCancel}
        pilotRegistry={['PilotOne']}
      />
    );

    expect(screen.getByRole('dialog', { name: /review and correct ocr data/i })).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes screenshot lightbox with Escape before cancelling modal', async () => {
    const { OCRReviewModal } = await import('./OCRReviewModal');
    const onCancel = vi.fn();
    const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP8z8DwHwAFgwJ/l4s46QAAAABJRU5ErkJggg==';

    render(
      <OCRReviewModal
        data={buildData()}
        onApply={vi.fn()}
        onCancel={onCancel}
        pilotRegistry={['PilotOne']}
        screenshots={[screenshot]}
      />
    );

    const thumb = screen.getByAltText('Screenshot 1');
    const thumbButton = thumb.closest('button');
    expect(thumbButton).not.toBeNull();
    fireEvent.click(thumbButton as HTMLButtonElement);

    expect(screen.getByRole('dialog', { name: /screenshot 1 of 1/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /screenshot 1 of 1/i })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('allows approving fuzzy teammate suggestion directly', async () => {
    const { OCRReviewModal } = await import('./OCRReviewModal');
    const data: OCRExtractedData = {
      ...buildData(),
      teammates: [{ name: 'Ace', confidence: 72 }],
    };

    render(
      <OCRReviewModal
        data={data}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pilotRegistry={['Ace Pilot']}
      />
    );

    expect(screen.getByText(/~ Ace Pilot/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approve fuzzy match for teammate 1/i }));

    expect(screen.getByDisplayValue('Ace Pilot')).toBeInTheDocument();
  });

  it('applies manual merge targets for teammate and opponent rows', async () => {
    const { OCRReviewModal } = await import('./OCRReviewModal');
    const data: OCRExtractedData = {
      ...buildData(),
      teammates: [{ name: 'UnknownMate', confidence: 70 }],
      opponentTeams: [{
        teamName: 'Enemy Team 1',
        shipType: 'Hunter',
        color: 'red',
        confidence: 65,
        players: [{ name: 'UnknownEnemy', confidence: 66 }],
      }],
    };

    render(
      <OCRReviewModal
        data={data}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pilotRegistry={['TeammateTarget', 'OpponentTarget']}
      />
    );

    const teammateMergeInput = screen.getByRole('combobox', { name: /merge teammate 1 to roster/i });
    fireEvent.change(teammateMergeInput, { target: { value: 'TeammateTarget' } });
    fireEvent.click(screen.getByRole('button', { name: /apply merge for teammate 1/i }));
    expect(screen.getByRole('button', { name: /remove teammate teammatetarget/i })).toBeInTheDocument();

    const opponentMergeInput = screen.getByRole('combobox', { name: /merge opponent 1 on team 1 to roster/i });
    fireEvent.change(opponentMergeInput, { target: { value: 'OpponentTarget' } });
    fireEvent.click(screen.getByRole('button', { name: /apply merge for opponent 1 on team 1/i }));
    expect(screen.getByRole('button', { name: /remove opponent opponenttarget/i })).toBeInTheDocument();
  });
});
