import { describe, expect, it } from 'vitest';
import { normalizeLoadoutPerks, sanitizeLoadout } from '../loadout';

describe('loadout utilities', () => {
    it('mirrors legacy perks into characterPerks and trims to 2 slots', () => {
        const normalized = normalizeLoadoutPerks({
            hero: 'Adrian',
            ship: 'Hunter',
            weapons: [],
            equipment: [],
            perks: ['Boarder', 'Defender', 'Engineering'],
        }, 2);
        expect(normalized?.perks).toEqual(['Boarder', 'Defender']);
        expect(normalized?.characterPerks).toEqual(['Boarder', 'Defender']);
    });

    it('sanitizes tertiary slots and keeps perk compatibility fields', () => {
        const sanitized = sanitizeLoadout({
            hero: 'Adrian',
            ship: 'Hunter',
            weapons: ['Pulse Cannon', 'Tertiary Weapon'],
            equipment: ['Shield', 'Tertiary Equipment'],
            characterWeapons: ['Foam Gun', 'Rocket Launcher', 'Hand Cannon'],
            characterEquipment: ['Repulsor', 'Plasma Grenade', 'Extra'],
            perks: ['Boarder', 'Defender', 'Engineering'],
        } as any, { shipWeaponSlots: 10, prospectorSlots: 2, perkSlots: 2 });

        expect(sanitized?.weapons).toEqual(['Pulse Cannon']);
        expect(sanitized?.equipment).toEqual(['Shield']);
        expect(sanitized?.characterWeapons).toEqual(['Foam Gun', 'Rocket Launcher']);
        expect(sanitized?.characterEquipment).toEqual(['Repulsor', 'Plasma Grenade']);
        expect(sanitized?.perks).toEqual(['Boarder', 'Defender']);
        expect(sanitized?.characterPerks).toEqual(['Boarder', 'Defender']);
    });
});
