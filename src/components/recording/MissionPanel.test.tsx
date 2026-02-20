import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CHARACTER_EQUIPMENT, CHARACTER_WEAPONS } from '../../types';

const selectedCharacterWeapon = CHARACTER_WEAPONS[0] || 'Unknown Weapon';
const selectedCharacterEquipment = CHARACTER_EQUIPMENT[0] || 'Unknown Equipment';

const gameData = {
  timeMin: '00',
  setTimeMin: vi.fn(),
  timeSec: '00',
  setTimeSec: vi.fn(),
  damageTaken: '0',
  setDamageTaken: vi.fn(),
  damageSource: 'manual',
  poiEasy: 0,
  setPoiEasy: vi.fn(),
  poiMedium: 0,
  setPoiMedium: vi.fn(),
  poiEpic: 0,
  setPoiEpic: vi.fn(),
  selectedReachModifiers: [] as string[],
  modifiersSource: 'manual',
  toggleReachModifier: vi.fn(),
  setSelectedReachModifiers: vi.fn(),
  currentNote: '',
  setCurrentNote: vi.fn(),
  activeWeapons: {
    [selectedCharacterWeapon]: 1,
    [selectedCharacterEquipment]: 1,
  } as Record<string, number>,
  setActiveWeapons: vi.fn(),
  currentLoadout: {
    hero: null,
    ship: null,
    weapons: [],
    equipment: [],
    characterWeapons: [selectedCharacterWeapon],
    characterEquipment: [selectedCharacterEquipment],
  },
};

const uiState = {
  showArtifactSelect: false,
  setShowArtifactSelect: vi.fn(),
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../../utils/scanService', () => ({
  captureScreen: vi.fn(),
  processMatchScreenshot: vi.fn(),
}));

describe('MissionPanel', () => {
  it('shows selected character loadout and auto telemetry indicator on section headers', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel accordionMode />);

    const charWeaponsHeader = screen.getByRole('button', { name: /char weapons/i });
    expect(within(charWeaponsHeader).getByText(selectedCharacterWeapon)).toBeInTheDocument();
    expect(within(charWeaponsHeader).getByText('Auto')).toBeInTheDocument();

    const equipmentHeader = screen.getByRole('button', { name: /equipment/i });
    expect(within(equipmentHeader).getByText(selectedCharacterEquipment)).toBeInTheDocument();
    expect(within(equipmentHeader).getByText('Auto')).toBeInTheDocument();
  });
});

