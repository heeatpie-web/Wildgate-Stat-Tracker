import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfidenceMeter } from './ConfidenceMeter';

describe('ConfidenceMeter', () => {
  it('renders a progress bar with clamped width', () => {
    const { container } = render(<ConfidenceMeter percent={120} />);
    const inner = container.querySelector('div[style*="width"]') as HTMLDivElement | null;
    expect(inner).toBeInTheDocument();
    expect(inner?.style.width).toBe('100%');
  });
});

