import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders label and helper text', () => {
    render(<Input label="Pilot" helperText="Enter your pilot name" />);
    expect(screen.getByText('Pilot')).toBeInTheDocument();
    expect(screen.getByText('Enter your pilot name')).toBeInTheDocument();
  });

  it('renders error state with aria-invalid', () => {
    render(<Input label="Alias" error="Alias is required" />);
    const input = screen.getByLabelText('Alias');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('wg-input--error');
    expect(screen.getByText('Alias is required')).toBeInTheDocument();
  });

  it('supports disabled state', () => {
    render(<Input label="Disabled field" disabled />);
    expect(screen.getByLabelText('Disabled field')).toBeDisabled();
  });

  it('sets filled marker when value exists', () => {
    render(<Input label="Filled" value="abc" readOnly />);
    const wrap = document.querySelector('.wg-input-wrap');
    expect(wrap).toHaveAttribute('data-filled', 'true');
  });
});
