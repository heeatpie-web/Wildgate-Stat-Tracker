import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SmartCaptureConfidenceMeter } from './ConfidenceMeter';

describe('SmartCaptureConfidenceMeter', () => {
  it('renders a progress bar with clamped width', () => {
    const { container } = render(<SmartCaptureConfidenceMeter percent={120} />);
    const inner = container.querySelector('div[style*="width"]') as HTMLDivElement | null;
    expect(inner).toBeInTheDocument();
    expect(inner?.style.width).toBe('100%');
  });
});

