import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OutcomePill } from './OutcomePill';

describe('OutcomePill', () => {
  it('renders match outcome label', () => {
    render(<OutcomePill result="Win" />);
    const outcome = screen.getByText('Win');
    expect(outcome).toBeInTheDocument();
    expect(outcome).not.toHaveClass('border');
    expect(outcome).not.toHaveClass('rounded-pill');
  });

  it('renders ongoing label', () => {
    render(<OutcomePill result="Ongoing" />);
    expect(screen.getByText('Ongoing')).toBeInTheDocument();
  });
});

