import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SmartCaptureDetailLayout } from './SmartCaptureDetailLayout';

describe('SmartCaptureDetailLayout', () => {
  it('renders default summary/editor/rail/footer structure', () => {
    const { container } = render(
      <SmartCaptureDetailLayout
        summary={<div>Summary</div>}
        editor={<div>Editor</div>}
        rail={<div>Rail</div>}
        footer={<div>Footer</div>}
      />,
    );

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Rail')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();

    const shell = container.querySelector('.sc-detail-shell');
    const summary = container.querySelector('.sc-detail-summary');
    const main = container.querySelector('.sc-detail-main');

    expect(shell).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col');
    expect(summary).toHaveClass('sticky', 'top-0', 'overflow-visible');
    expect(main).toHaveClass('min-h-0', 'mt-4');
  });

  it('supports hidden summary mode', () => {
    const { container } = render(
      <SmartCaptureDetailLayout
        summary={<div>Summary</div>}
        editor={<div>Editor</div>}
        rail={<div>Rail</div>}
        summaryMode="hidden"
      />,
    );

    expect(screen.queryByText('Summary')).toBeNull();
    expect(container.querySelector('.sc-detail-summary')).toBeNull();
    expect(container.querySelector('.sc-detail-main')).toHaveClass('min-h-0');
  });

  it('uses compact summary padding when requested', () => {
    const { container } = render(
      <SmartCaptureDetailLayout
        summary={<div>Summary</div>}
        editor={<div>Editor</div>}
        rail={<div>Rail</div>}
        summaryMode="compact"
      />,
    );

    const summary = container.querySelector('.sc-detail-summary');
    expect(summary).toBeInTheDocument();
    expect(summary?.className).toContain('py-1');
  });
});
