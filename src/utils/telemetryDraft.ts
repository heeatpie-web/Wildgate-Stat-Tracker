import type { Match } from '../types';
import { cloneLoadout } from './loadout';

export const buildAutoCaptureTelemetryDraft = ({
    matchId,
    timestamp,
    mode,
    matchMode,
    player,
    hero,
    ship,
    loadout,
}: {
    matchId: number;
    timestamp: number;
    mode: Match['mode'];
    matchMode?: Match['matchMode'];
    player?: string | null;
    hero?: string | null;
    ship?: string | null;
    loadout?: Match['loadout'] | null;
}): Match => {
    const normalizedLoadout = cloneLoadout(loadout) || {
        hero: loadout?.hero || null,
        ship: loadout?.ship || null,
        perks: [],
        shipPerks: [],
        characterPerks: [],
        shipWeapons: [],
        weapons: [],
        equipment: [],
        characterWeapons: [],
        characterEquipment: [],
    };
    const normalizedPlayer = String(player || '').trim() || 'Unknown Player';
    const normalizedHero = (
        normalizedLoadout?.hero
        && !String(normalizedLoadout.hero).startsWith('Unknown')
    )
        ? String(normalizedLoadout.hero)
        : (String(hero || '').trim() || 'Unknown');
    const normalizedShip = (
        normalizedLoadout?.ship
        && !String(normalizedLoadout.ship).startsWith('Unknown')
    )
        ? String(normalizedLoadout.ship)
        : (String(ship || '').trim() || 'Unknown');

    return {
        id: matchId,
        timestamp,
        date: new Date(timestamp).toLocaleDateString(),
        mode,
        player: normalizedPlayer,
        teammates: [],
        opponents: [],
        hero: normalizedHero,
        ship: normalizedShip,
        loadout: normalizedLoadout,
        weapons: {},
        reachModifiers: [],
        kills: { 'AI Legion': 0 },
        result: 'Ongoing',
        subType: 'Telemetry Draft',
        time: '00:00',
        damageTaken: 0,
        notes: '',
        timelineEvents: [],
        artifacts: [],
        ocrState: 'queued',
        telemetryDraftState: 'active',
        matchMode,
    };
};
