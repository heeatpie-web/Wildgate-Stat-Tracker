import { describe, expect, it } from 'vitest';

import { sanitizeOpponentTeamsAgainstFriendlyRoster } from '../friendlyTeamDeduper';

describe('sanitizeOpponentTeamsAgainstFriendlyRoster', () => {
    it('drops opponent teams that are actually the friendly roster and promotes their players', () => {
        const result = sanitizeOpponentTeamsAgainstFriendlyRoster({
            teams: [
                {
                    teamName: 'Starlight',
                    shipType: 'Hunter',
                    players: ['Pilot', 'Wing1', 'Wing2'],
                },
                {
                    teamName: 'Enemy Team',
                    shipType: 'Scout',
                    players: ['Enemy1', 'Enemy2'],
                },
            ],
            activeUser: 'Pilot',
            friendlyPlayers: ['Wing1'],
            friendlyTeamLabels: ['Starlight', "Starlight's Crew", 'Hunter'],
        });

        expect(result.promotedFriendlyPlayers).toEqual(['Wing1', 'Wing2']);
        expect(result.teams).toEqual([
            {
                teamName: 'Enemy Team',
                shipType: 'Scout',
                players: ['Enemy1', 'Enemy2'],
            },
        ]);
    });

    it('removes friendly bleed from mixed enemy teams without dropping the whole team', () => {
        const result = sanitizeOpponentTeamsAgainstFriendlyRoster({
            teams: [{
                teamName: 'Enemy Team',
                shipType: 'Scout',
                players: ['Wing1', 'Enemy1', 'Enemy2'],
            }],
            activeUser: 'Pilot',
            friendlyPlayers: ['Wing1'],
            friendlyTeamLabels: ['Starlight'],
        });

        expect(result.promotedFriendlyPlayers).toEqual([]);
        expect(result.teams).toEqual([{
            teamName: 'Enemy Team',
            shipType: 'Scout',
            players: ['Enemy1', 'Enemy2'],
        }]);
    });

    it('drops placeholder player labels instead of promoting them onto the friendly roster', () => {
        const result = sanitizeOpponentTeamsAgainstFriendlyRoster({
            teams: [
                {
                    teamName: 'Starlight',
                    shipType: 'Hunter',
                    players: ['Pilot', 'Wing1', 'Unknown Player'],
                },
                {
                    teamName: 'Enemy Team',
                    shipType: 'Scout',
                    players: ['Enemy1', 'Unknown Player'],
                },
            ],
            activeUser: 'Pilot',
            friendlyPlayers: ['Wing1'],
            friendlyTeamLabels: ['Starlight', 'Hunter'],
        });

        expect(result.promotedFriendlyPlayers).toEqual(['Wing1']);
        expect(result.teams).toEqual([
            {
                teamName: 'Enemy Team',
                shipType: 'Scout',
                players: ['Enemy1'],
            },
        ]);
    });
});
