/**
 * @module guids
 * Hardcoded GUID to display-name mappings for heroes, ships, weapons,
 * and equipment. Unknown GUIDs are tracked by
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
    '0BFFF89B44027290DC6348B95A6B0F11': 'Hunter'
});

export const WEAPON_GUIDS: Record<string, string> = withGuidCaseAliases({
    'F350FD964B4A0E59F068AE88D6D9650C': 'The Doctor',
    '96E8EBE7458D6614EDCE83B6561C5FAE': 'Double Whammy',
    '77A11BF74EE089D011376584479CFEA2': 'Tertiary Weapon'
});

export const EQUIPMENT_GUIDS: Record<string, string> = withGuidCaseAliases({
    'F2B54FEC47BBDBEA641EB9AD846A0A8D': 'Repair Drone',
    '6EEA22004EA2D98A46779A9592E0C4B2': 'Teleport Reloader',
    'B1B367B8429C67883B88D5B315F997B0': 'Tertiary Equipment'
});
