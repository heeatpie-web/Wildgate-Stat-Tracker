/**
 * @module guids
 * Hardcoded GUID to display-name mappings for heroes, ships, weapons,
 * equipment, and perks. Unknown GUIDs are tracked by
 * createMappingSlice.registerUnknownId() for user resolution.
 */
const withGuidCaseAliases = (entries: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    Object.entries(entries).forEach(([guid, name]) => {
        out[guid] = name;
        out[guid.toLowerCase()] = name;
        out[guid.toUpperCase()] = name;
    });
    return out;
};

export const HERO_GUIDS: Record<string, string> = withGuidCaseAliases({
    'C0C3960248AD43D20AA6DDA8AEB81424': 'Sal',
    'E7539B7C4483C338E55B15B102E2F006': 'Adrian',
    'E305EC254F7CD5BA4107A381E9BEA287': 'Venture'
});

export const SHIP_GUIDS: Record<string, string> = withGuidCaseAliases({
    '0BFFF89B44027290DC6348B95A6B0F11': 'Hunter',
    '238FE96442789BC0C2E416BBDFDBCC52': 'Scout',
    '5F6F4E8647A82086A1DB2C8566E100DA': 'Outlaw',
});

export const WEAPON_GUIDS: Record<string, string> = withGuidCaseAliases({
    'F350FD964B4A0E59F068AE88D6D9650C': 'The Doctor',
    '96E8EBE7458D6614EDCE83B6561C5FAE': 'Double Whammy',
    '77A11BF74EE089D011376584479CFEA2': 'Tertiary Weapon',
    'D6936A484DB111488285BC82D1841483': 'Sidelong',
    'F2A6D62B49145170B1CFE092C9F057CD': 'Resonator',
    '7B68346F45753D427AA78D961CDB45AF': 'Beam Rifle',
    'FA1A98164D7E396731D2CEBCA07C5A1E': 'Painter',
});

export const EQUIPMENT_GUIDS: Record<string, string> = withGuidCaseAliases({
    'F2B54FEC47BBDBEA641EB9AD846A0A8D': 'Repair Drone',
    '6EEA22004EA2D98A46779A9592E0C4B2': 'Teleport Reloader',
    'B1B367B8429C67883B88D5B315F997B0': 'Tertiary Equipment',
    '7331F55044069CD1196C43883CD12EDF': 'Shield Wall',
    '990B68A64D67094FADE3D3B4E229D6F4': 'Rock!',
    '58C97F0F43E24F47057BE7AE9321AC7D': 'Healing Drone',
    '5D1B66E148D64162F74218B269E68016': 'Foam Can',
});

export const PERK_GUIDS: Record<string, string> = withGuidCaseAliases({});
