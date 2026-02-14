import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OutcomePill } from './OutcomePill';

describe('OutcomePill', () => {
  it('renders match outcome label', () => {
    render(<OutcomePill result="Win" />);
    expect(screen.getByText('Win')).toBeInTheDocument();
  });
});

