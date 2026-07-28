import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OcrTeamAssignmentBoard } from './OcrTeamAssignmentBoard';

describe('OcrTeamAssignmentBoard', () => {
  it('shows a fuzzy roster badge for OCR-normalized friendly names', () => {
    const onPlayerChange = vi.fn();

    render(
      <OcrTeamAssignmentBoard
        teams={[
          {
            key: 'friendly:Friendly Team',
            color: 'friendly',
            teamName: 'Friendly Team',
            shipType: 'Hunter',
            players: ['C0mbat Barbie'],
          },
        ]}
        shipOptions={['Hunter']}
        pilotRegistry={['Combat Barbie']}
        friendlyTeamIndex={0}
        fuzzyMatches={{ 'combat barbie': 'Combat Barbie' }}
        onTeamShipChange={vi.fn()}
        onPlayerChange={onPlayerChange}
        onPlayerRemove={vi.fn()}
        onPlayerAdd={vi.fn()}
        onPlayerMove={vi.fn()}
      />
    );

    const fuzzyButton = screen.getByRole('button', { name: /combat barbie/i });
    expect(fuzzyButton).toBeInTheDocument();
    expect(fuzzyButton).toHaveTextContent('~ Combat Barbie');

    fireEvent.click(fuzzyButton);
    expect(onPlayerChange).toHaveBeenCalledWith(0, 0, 'Combat Barbie');
  });

  it('keeps the ship selector grouped with the team name field', () => {
    const { container } = render(
      <OcrTeamAssignmentBoard
        teams={[
          {
            key: 'friendly:Friendly Team',
            color: 'friendly',
            teamName: 'Friendly Team',
            shipType: 'Hunter',
            players: ['Combat Barbie'],
          },
        ]}
        shipOptions={['Hunter']}
        friendlyTeamIndex={0}
        onTeamNameChange={vi.fn()}
        onTeamShipChange={vi.fn()}
        onPlayerChange={vi.fn()}
        onPlayerRemove={vi.fn()}
        onPlayerAdd={vi.fn()}
        onPlayerMove={vi.fn()}
      />
    );

    const teamNameField = container.querySelector('.ocr-assignment-team-name-field');
    const shipSelect = screen.getByLabelText(/team 1 ship/i);

    expect(teamNameField).toContainElement(shipSelect);
  });

  it('preserves detected accent colors for expanded OCR team palette entries', () => {
    const { container } = render(
      <OcrTeamAssignmentBoard
        teams={[
          {
            key: 'black:Carefree',
            color: 'black',
            teamName: 'Carefree',
            shipType: 'Scout',
            players: ['SoulOkk'],
          },
          {
            key: 'goldenrod:BananaCastle',
            color: 'goldenrod',
            teamName: 'BananaCastle',
            shipType: 'Hunter',
            players: ['Stoat'],
          },
          {
            key: 'hotPink:Vanguard',
            color: 'hotPink',
            teamName: 'Vanguard',
            shipType: 'Brig',
            players: ['Jack'],
          },
        ]}
        shipOptions={['Scout', 'Hunter', 'Brig']}
        onTeamShipChange={vi.fn()}
        onPlayerChange={vi.fn()}
        onPlayerRemove={vi.fn()}
        onPlayerAdd={vi.fn()}
        onPlayerMove={vi.fn()}
      />
    );

    expect(screen.getByTestId('ocr-team-card-0')).toHaveClass('ocr-assignment-team-card--color-black');
    expect(screen.getByTestId('ocr-team-card-1')).toHaveClass('ocr-assignment-team-card--color-goldenrod');
    expect(screen.getByTestId('ocr-team-card-2')).toHaveClass('ocr-assignment-team-card--color-magenta');

    const blackDot = container.querySelector('.ocr-assignment-team-dot--black');
    const goldDot = container.querySelector('.ocr-assignment-team-dot--goldenrod');
    const magentaDot = container.querySelector('.ocr-assignment-team-dot--magenta');

    expect(blackDot).toBeInTheDocument();
    expect(goldDot).toBeInTheDocument();
    expect(magentaDot).toBeInTheDocument();
  });

  describe('roster membership badge', () => {
    const renderBoard = (props: Record<string, unknown> = {}) => render(
      <OcrTeamAssignmentBoard
        teams={[{
          key: 'friendly:Friendly Team',
          color: 'friendly',
          teamName: 'Friendly Team',
          shipType: 'Hunter',
          players: ['Combat Barbie'],
        }]}
        shipOptions={['Hunter']}
        friendlyTeamIndex={0}
        onTeamShipChange={vi.fn()}
        onPlayerChange={vi.fn()}
        onPlayerRemove={vi.fn()}
        onPlayerAdd={vi.fn()}
        onPlayerMove={vi.fn()}
        onAddToRoster={vi.fn()}
        {...props}
      />
    );

    it('shows the Roster badge and no add button for a pilot already on the roster', () => {
      renderBoard({ pilotRegistry: ['Combat Barbie'] });

      expect(screen.getByTitle('Matched to roster')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add combat barbie to roster/i })).not.toBeInTheDocument();
    });

    it('offers the add button for a pilot who is not on the roster', () => {
      renderBoard({ pilotRegistry: ['SomeoneElse'] });

      expect(screen.queryByTitle('Matched to roster')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add combat barbie to roster/i })).toBeInTheDocument();
    });

    it('prefers an explicit rosterExactKeys set over pilotRegistry', () => {
      // The OCR modal builds the matcher once and hands down its own roster
      // keys, so the badge and the fuzzy suggestion cannot disagree.
      renderBoard({ pilotRegistry: [], rosterExactKeys: new Set(['combat barbie']) });

      expect(screen.getByTitle('Matched to roster')).toBeInTheDocument();
    });
  });
});
