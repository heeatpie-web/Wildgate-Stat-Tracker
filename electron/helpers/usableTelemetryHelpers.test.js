import { describe, expect, it } from 'vitest';
import {
  buildUsableTelemetryEvent,
  extractUsableTelemetryEvents,
} from './usableTelemetryHelpers.cjs';

describe('usableTelemetryHelpers', () => {
  it('extracts nested ship and loadout ids from raw telemetry', () => {
    const usable = buildUsableTelemetryEvent({
      ClientTimestamp: 1740000000,
      EventName: 'NebLoadoutSaved',
      Payload: {
        event: {
          matchId: 'NebMatchAsset:MATCH123',
          sessionId: 'NebSessionAsset:SESSION123',
          loadout: {
            guidShip: 'NebShipAsset:SHIP123',
            guidHero: 'NebHeroAsset:HERO123',
            guidWeaponPrimary: 'NebWeaponAsset:WEAPON_A',
            guidWeaponSecondary: 'NebWeaponAsset:WEAPON_B',
            guidEquipmentPrimary: 'NebEquipmentAsset:EQUIPMENT_A',
            guidEquipmentSecondary: 'NebEquipmentAsset:EQUIPMENT_B',
            guidPerkPrimary: 'NebPerkAsset:PERK_A',
            guidTraitSecondary: 'NebTraitAsset:PERK_B',
          },
        },
      },
    });

    expect(usable).toMatchObject({
      timestamp: 1740000000000,
      eventName: 'NebLoadoutSaved',
      matchId: 'MATCH123',
      sessionId: 'SESSION123',
      heroIds: ['HERO123'],
      shipIds: ['SHIP123'],
      weaponIds: ['WEAPON_A', 'WEAPON_B'],
      equipmentIds: ['EQUIPMENT_A', 'EQUIPMENT_B'],
      perkIds: ['PERK_A', 'PERK_B'],
    });
  });

  it('preserves ids when re-normalizing already-usable telemetry events', () => {
    const original = {
      timestamp: 1740000000000,
      eventName: 'NebLoadoutSaved',
      matchId: 'MATCH123',
      sessionId: 'SESSION123',
      outcome: 'Win',
      playerIds: ['PLAYER123'],
      heroIds: ['HERO123'],
      shipIds: ['SHIP123'],
      weaponIds: ['WEAPON_A', 'WEAPON_B'],
      equipmentIds: ['EQUIPMENT_A', 'EQUIPMENT_B'],
      perkIds: ['PERK_A', 'PERK_B'],
    };

    const rebuilt = buildUsableTelemetryEvent(original);
    const extracted = extractUsableTelemetryEvents({ telemetry: [original] });

    expect(rebuilt).toEqual(original);
    expect(extracted).toEqual([original]);
  });
});
