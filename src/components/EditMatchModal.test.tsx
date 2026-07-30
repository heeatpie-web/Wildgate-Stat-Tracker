import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import { EditMatchModal } from './EditMatchModal';

const baseMatch = {
  id: 1,
  timestamp: Date.now(),
  date: '',
  mode: 'Free Roam',
  player: 'Pilot',
  ship: 'Hunter',
  hero: 'Adrian',
  result: 'Win',
  subType: 'Combat',
  time: '12:34',
  teammates: [],
  opponents: [],
  reachModifiers: [],
  notes: '',
  kills: {},
  weapons: {},
  matchCategory: 'ranked',
} as unknown as Match;

const historicalMatches: Match[] = [
  { ...baseMatch, id: 2, matchCategory: 'Ranked' } as Match,
  { ...baseMatch, id: 3, matchCategory: 'Scrim' } as Match,
  { ...baseMatch, id: 4, matchCategory: undefined } as Match,
];

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => ({ matches: historicalMatches }),
}));

describe('EditMatchModal category field', () => {
  it('shows the match\'s current category and lets it be corrected and saved', () => {
    const onSave = vi.fn();
    render(<EditMatchModal match={baseMatch} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText(/category/i) as HTMLInputElement;
    expect(input.value).toBe('ranked');

    fireEvent.change(input, { target: { value: 'League' } });
    fireEvent.click(screen.getByRole('button', { name: /save updates/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Match;
    expect(saved.matchCategory).toBe('League');
  });

  it('clears the category when the field is emptied', () => {
    const onSave = vi.fn();
    render(<EditMatchModal match={baseMatch} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText(/category/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save updates/i }));

    const saved = onSave.mock.calls[0][0] as Match;
    expect(saved.matchCategory).toBeUndefined();
  });

  it('offers previously used categories as autocomplete suggestions, deduped case-insensitively', () => {
    render(<EditMatchModal match={baseMatch} onSave={vi.fn()} onClose={vi.fn()} />);

    const options = Array.from(document.querySelectorAll('datalist option')).map(
      (opt) => (opt as HTMLOptionElement).value
    );
    // "Ranked" (id 2) and "ranked" (baseMatch, not part of `matches`) would
    // collide if the vocabulary weren't case-folded; only the first-seen
    // casing from the historical matches list should appear, once each.
    expect(options).toEqual(['Ranked', 'Scrim']);
  });
});
