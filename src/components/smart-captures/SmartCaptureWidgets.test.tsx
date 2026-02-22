import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InlinePlayerAdd } from './SmartCaptureWidgets';

describe('InlinePlayerAdd', () => {
  it('resolves typed names against roster suggestions when confirming', () => {
    const onAdd = vi.fn();

    render(<InlinePlayerAdd onAdd={onAdd} pilotRegistry={['PilotOne']} />);
    fireEvent.click(screen.getByRole('button', { name: /add player/i }));

    const input = screen.getByPlaceholderText('Name...');
    fireEvent.change(input, { target: { value: 'pilotone' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAdd).toHaveBeenCalledWith('PilotOne');
  });

  it('shows quick add-to-roster action for unknown players when callback is provided', () => {
    const onAdd = vi.fn();
    const onAddToRoster = vi.fn();

    render(
      <InlinePlayerAdd
        onAdd={onAdd}
        pilotRegistry={['PilotOne']}
        onAddToRoster={onAddToRoster}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add player/i }));

    const input = screen.getByPlaceholderText('Name...');
    fireEvent.change(input, { target: { value: 'NewPilot' } });

    const quickAdd = screen.getByRole('button', { name: /add player to roster/i });
    fireEvent.click(quickAdd);
    expect(onAddToRoster).toHaveBeenCalledWith('NewPilot');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does not show quick add-to-roster action for existing roster entries', () => {
    const onAdd = vi.fn();
    const onAddToRoster = vi.fn();

    render(
      <InlinePlayerAdd
        onAdd={onAdd}
        pilotRegistry={['PilotOne']}
        onAddToRoster={onAddToRoster}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add player/i }));

    const input = screen.getByPlaceholderText('Name...');
    fireEvent.change(input, { target: { value: 'pilotone' } });

    expect(screen.queryByRole('button', { name: /add player to roster/i })).toBeNull();
  });
});

