import { describe, expect, it } from 'vitest';
import { EQUIPMENT_GUIDS, HERO_GUIDS, SHIP_GUIDS, WEAPON_GUIDS } from '../guids';

describe('guid mapping aliases', () => {
  it('resolves hero GUIDs case-insensitively', () => {
    const guid = 'C0C3960248AD43D20AA6DDA8AEB81424';
    expect(HERO_GUIDS[guid]).toBe('Sal');
    expect(HERO_GUIDS[guid.toLowerCase()]).toBe('Sal');
    expect(HERO_GUIDS[guid.toUpperCase()]).toBe('Sal');
  });

  it('resolves ship GUIDs case-insensitively', () => {
    const guid = '0BFFF89B44027290DC6348B95A6B0F11';
    expect(SHIP_GUIDS[guid]).toBe('Hunter');
    expect(SHIP_GUIDS[guid.toLowerCase()]).toBe('Hunter');
    expect(SHIP_GUIDS[guid.toUpperCase()]).toBe('Hunter');
  });

  it('resolves weapon GUIDs case-insensitively', () => {
    const guid = 'F350FD964B4A0E59F068AE88D6D9650C';
    expect(WEAPON_GUIDS[guid]).toBe('The Doctor');
    expect(WEAPON_GUIDS[guid.toLowerCase()]).toBe('The Doctor');
    expect(WEAPON_GUIDS[guid.toUpperCase()]).toBe('The Doctor');
  });

  it('resolves equipment GUIDs case-insensitively', () => {
    const guid = 'F2B54FEC47BBDBEA641EB9AD846A0A8D';
    expect(EQUIPMENT_GUIDS[guid]).toBe('Repair Drone');
    expect(EQUIPMENT_GUIDS[guid.toLowerCase()]).toBe('Repair Drone');
    expect(EQUIPMENT_GUIDS[guid.toUpperCase()]).toBe('Repair Drone');
  });

  it('includes Repulsor in the built-in equipment GUID table', () => {
    const guid = 'D758D49F45005A77CB13ABAE81E204EB';
    expect(EQUIPMENT_GUIDS[guid]).toBe('Repulsor');
    expect(EQUIPMENT_GUIDS[guid.toLowerCase()]).toBe('Repulsor');
    expect(EQUIPMENT_GUIDS[guid.toUpperCase()]).toBe('Repulsor');
  });

  it('includes the corrected built-in equipment GUID aliases', () => {
    expect(EQUIPMENT_GUIDS['1FC6C97040714EF444F7119B75377054']).toBe('Rock!');
    expect(EQUIPMENT_GUIDS['CD21C7B2468EC990E4AFDE8B27CFE398']).toBe('Adventure Gear');
  });

  it('maps the corrected Drill Charge equipment GUID', () => {
    expect(EQUIPMENT_GUIDS['20C5C5A04C5A86EFAF1F9FAF2C0DD60C']).toBe('Drill Charge');
  });
});
