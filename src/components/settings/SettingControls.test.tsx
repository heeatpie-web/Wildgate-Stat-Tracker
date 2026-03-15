import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SegmentedControl, OptionCycler, SettingRow } from './SettingControls';

const OPTIONS = [
  { id: 'a', label: 'Option A' },
  { id: 'b', label: 'Option B' },
  { id: 'c', label: 'Option C' },
];

describe('SegmentedControl', () => {
  it('renders all option labels', () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Option A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Option B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Option C' })).toBeInTheDocument();
  });

  it('calls onChange with clicked option id', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when clicking the already-active option', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('OptionCycler', () => {
  it('shows current option label', () => {
    render(<OptionCycler options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('next arrow advances to next option', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('prev arrow goes to previous option', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous option' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wraps from last to first on next', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="c" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wraps from first to last on prev', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous option' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SettingRow', () => {
  it('renders label and description for current value', () => {
    render(
      <SettingRow
        label="My Setting"
        value="a"
        descriptions={{ a: 'Description for A', b: 'Description for B' }}
      >
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('My Setting')).toBeInTheDocument();
    expect(screen.getByText('Description for A')).toBeInTheDocument();
    expect(screen.queryByText('Description for B')).not.toBeInTheDocument();
  });

  it('updates description when value changes', () => {
    const { rerender } = render(
      <SettingRow label="My Setting" value="a" descriptions={{ a: 'Desc A', b: 'Desc B' }}>
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('Desc A')).toBeInTheDocument();
    rerender(
      <SettingRow label="My Setting" value="b" descriptions={{ a: 'Desc A', b: 'Desc B' }}>
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('Desc B')).toBeInTheDocument();
    expect(screen.queryByText('Desc A')).not.toBeInTheDocument();
  });
});
