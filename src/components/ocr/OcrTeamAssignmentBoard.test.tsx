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
});
