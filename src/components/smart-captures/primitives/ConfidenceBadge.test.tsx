import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfidenceBadge } from './ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('renders percent with dual confidence labels', () => {
    render(<ConfidenceBadge percent={78} />);
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByText('Spec: warning')).toBeInTheDocument();
    expect(screen.getByText('Practical: Good')).toBeInTheDocument();
  });
});

