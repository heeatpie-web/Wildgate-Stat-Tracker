import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows selected character loadout on section headers', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel accordionMode />);

    // Find the character weapons section by the weapon name shown in its indicator
    const weaponsButtons = screen.getAllByRole('button', { name: /weapons/i });
    const charWeaponsHeader = weaponsButtons.find(btn => btn.textContent?.includes(selectedCharacterWeapon));
    expect(charWeaponsHeader).toBeInTheDocument();
    expect(within(charWeaponsHeader!).getByText(selectedCharacterWeapon)).toBeInTheDocument();

    // Find the character equipment section by the equipment name shown in its indicator
    const equipmentButtons = screen.getAllByRole('button', { name: /equipment/i });
    const equipmentHeader = equipmentButtons.find(btn => btn.textContent?.includes(selectedCharacterEquipment));
    expect(equipmentHeader).toBeInTheDocument();
    expect(within(equipmentHeader!).getByText(selectedCharacterEquipment)).toBeInTheDocument();
  });

  it('uses MM:SS text inputs and sanitizes timer values', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel />);

    const minutesInput = screen.getByLabelText('Minutes');
    const secondsInput = screen.getByLabelText('Seconds');

    expect(minutesInput).toHaveAttribute('type', 'text');
    expect(secondsInput).toHaveAttribute('type', 'text');

    fireEvent.change(minutesInput, { target: { value: '1a7' } });
    expect(gameData.setTimeMin).toHaveBeenCalledWith('17');

    fireEvent.change(secondsInput, { target: { value: '99' } });
    expect(gameData.setTimeSec).toHaveBeenCalledWith('59');
  });

  it('shows telemetry source badges directly on prospector loadout sections', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel accordionMode />);

    expect(screen.getAllByText(/^Telemetry$/i).length).toBeGreaterThanOrEqual(1);

    // Find the Weapons section header that contains the telemetry badge
    const weaponsTelemetryBadge = screen.getByTestId('telemetry-prospector-weapons');
    const charWeaponsHeader = weaponsTelemetryBadge.closest('button');
    expect(charWeaponsHeader).toBeInTheDocument();
    expect(within(charWeaponsHeader!).getByTestId('telemetry-prospector-weapons')).toHaveTextContent('Source: Telemetry');

    // Find the Equipment section header that contains the telemetry badge
    const equipmentTelemetryBadge = screen.getByTestId('telemetry-prospector-equipment');
    const equipmentHeader = equipmentTelemetryBadge.closest('button');
    expect(equipmentHeader).toBeInTheDocument();
    expect(within(equipmentHeader!).getByTestId('telemetry-prospector-equipment')).toHaveTextContent('Source: Telemetry');
  });
});
