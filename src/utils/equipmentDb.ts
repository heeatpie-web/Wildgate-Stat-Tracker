
export interface EquipmentItem {
    id: string;
    name: string;
    type: 'Weapon' | 'Utility' | 'System' | 'CharacterWeapon' | 'CharacterEquipment';
    description?: string;
    compatibleChars: string[]; // "All" or list of names
    defaultAmmo?: number;
    icon?: string;
}

export const EQUIPMENT_DB: EquipmentItem[] = [
    // Weapons (Ship)
    { id: '1', name: 'Quad Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '2', name: 'Scatter Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '3', name: 'Spec Ops Scatter Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '4', name: 'Thermic Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '5', name: 'Bomb Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '6', name: 'Sniper Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '7', name: 'Macro Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '8', name: 'Laser Ram', type: 'Weapon', compatibleChars: ['All'] },
    { id: '9', name: 'Mine Layer', type: 'Weapon', compatibleChars: ['All'] },
    { id: '10', name: 'Entropy Cannon', type: 'Weapon', compatibleChars: ['All'] },
    { id: '11', name: 'Plasma Beam', type: 'Weapon', compatibleChars: ['All'] },

    // Character Weapons
    { id: 'cw1', name: 'AIM-e', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 30, description: "Auto Lock On | Burst Dmg: 30" },
    { id: 'cw2', name: 'MK2 Blaster', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 30, description: "Full Auto | Dmg: 17 | Crit: 2x" },
    { id: 'cw3', name: 'Beam Rifle', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 6, description: "Sniper | Dmg: 80 | Crit: 2x" },
    { id: 'cw4', name: 'The Doctor', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 200, description: "Auto Lock Beam | Heal: 60/s | Dmg: 70/s" },
    { id: 'cw5', name: 'Surefire', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 15, description: "Semi-Auto | Dmg: 20 | Crit: 2x" },
    { id: 'cw6', name: 'Sidelong', type: 'CharacterWeapon', compatibleChars: ['All'], description: "Piercing | Dmg: 35" },
    { id: 'cw7', name: 'Sonic Boom', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 4, description: "3 Projectiles | Dmg: 25->5" },
    { id: 'cw8', name: 'Painter', type: 'CharacterWeapon', compatibleChars: ['All'], description: "Goo Gun | Dmg: 16 | Ramping Fire Rate" },
    { id: 'cw9', name: 'Double Whammy', type: 'CharacterWeapon', compatibleChars: ['All'], defaultAmmo: 4, description: "Anti-Ship | Burst: 100" },
    { id: 'cw10', name: 'Ancient Starlance', type: 'CharacterWeapon', compatibleChars: ['All'], description: "Long Range | Shield Break" },
    { id: 'cw11', name: 'Resonator', type: 'CharacterWeapon', compatibleChars: ['All'], description: "Pulse weapon | Resonance burst" },
    { id: 'cw12', name: 'Rocket Launcher', type: 'CharacterWeapon', compatibleChars: ['All'] },
    { id: 'cw13', name: 'Hand Cannon', type: 'CharacterWeapon', compatibleChars: ['All'] },
    { id: 'cw14', name: 'Foam Sprayer', type: 'CharacterWeapon', compatibleChars: ['All'] },

    // Character Equipment
    { id: 'ce1', name: 'Teleport Reloader', type: 'CharacterEquipment', compatibleChars: ['All'], description: "Passive | Reload on Teleport" },
    { id: 'ce2', name: 'Adventure Gear', type: 'CharacterEquipment', compatibleChars: ['All'], description: "Passive | More Ammo | 50% Dmg Red" },
    { id: 'ce3', name: 'Blast Can', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 3, description: "Throw | Bounces | Area Dmg" },
    { id: 'ce4', name: 'Sensor Trap', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2, description: "Trap | Dmg: 30 | Reveal: 4s" },
    { id: 'ce5', name: 'Foam Can', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 3, description: "Throw | Extinguishes Fire | Slows" },
    { id: 'ce6', name: 'Repair Drone', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2, description: "Drone | Heals Ship | 30s" },
    { id: 'ce6b', name: 'Healing Drone', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2 },
    { id: 'ce7', name: 'Attack Drone', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2, description: "Drone | Damages Enemies | 30s" },
    { id: 'ce8', name: 'Impact Can', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 3, description: "Throw | Explodes on Impact | Dmg: 60" },
    { id: 'ce9', name: 'Flash Shield', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 1, description: "Active | Invulnerable 0.7s" },
    { id: 'ce10', name: 'Drill Charge', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2, description: "Throw | Stick | Dmg: 800 (Ship)" },
    { id: 'ce11', name: 'Thunder Dash', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 2, description: "Active | Speed Boost | Smoke" },
    { id: 'ce12', name: 'Rock!', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 3, description: "Throw | High Single Target Dmg: 80" },
    { id: 'ce13', name: 'Shield Wall', type: 'CharacterEquipment', compatibleChars: ['All'], defaultAmmo: 1, description: "Deploy | Blocking Shield" },
    { id: 'ce14', name: 'Plasma Can', type: 'CharacterEquipment', compatibleChars: ['All'] },

    // Systems / Utility (Ship)
    { id: 'u1', name: 'Standard Shield', type: 'System', compatibleChars: ['All'] },
    { id: 'u2', name: 'Boost Drive', type: 'System', compatibleChars: ['All'] },
];

export const getEquipmentForCharacter = (charName: string): EquipmentItem[] => {
    return EQUIPMENT_DB.filter(item =>
        item.compatibleChars.includes('All') || item.compatibleChars.includes(charName)
    );
};
