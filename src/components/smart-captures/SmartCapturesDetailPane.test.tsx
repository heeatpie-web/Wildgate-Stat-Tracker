import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SmartCapturesDetailPane } from './SmartCapturesDetailPane';

describe('SmartCapturesDetailPane', () => {
  it('renders a non-clipping flex shell with scrollable content', () => {
    const { container } = render(
      <SmartCapturesDetailPane
        header={<div>Detail Header</div>}
        content={<div>Detail Body</div>}
        className="custom-pane"
      />,
    );

    expect(screen.getByText('Detail Header')).toBeInTheDocument();
    expect(screen.getByText('Detail Body')).toBeInTheDocument();

    const pane = container.querySelector('section');
    // overflow-hidden is required so sticky positioning within the pane works correctly
    expect(pane).toHaveClass('sc-detail-pane', 'overflow-hidden', 'flex', 'flex-col', 'custom-pane');

    const scroller = screen.getByText('Detail Body').parentElement;
    expect(scroller).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto', 'overflow-x-hidden');
  });

  it('dims the detail pane and renders a blocking overlay when provided', () => {
    const { container } = render(
      <SmartCapturesDetailPane
        header={<div>Detail Header</div>}
        content={<div>Detail Body</div>}
        contentOverlay={<div>Processing overlay</div>}
      />,
    );

    expect(screen.getByTestId('smart-captures-detail-overlay')).toBeInTheDocument();
    expect(screen.getByText('Processing overlay')).toBeInTheDocument();

    const pane = container.querySelector('section');
    expect(pane).toHaveAttribute('aria-busy', 'true');

    const header = screen.getByText('Detail Header').parentElement;
    expect(header).toHaveClass('opacity-55', 'pointer-events-none');

    const scroller = screen.getByText('Detail Body').parentElement;
    expect(scroller).toHaveClass('opacity-45', 'pointer-events-none');
  });
});
