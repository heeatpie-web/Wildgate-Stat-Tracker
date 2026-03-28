import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CHARACTER_EQUIPMENT, CHARACTER_WEAPONS } from '../../types';
import { getPerkCatalog } from '../patch/patchEntityCatalog';

const selectedCharacterWeapon = CHARACTER_WEAPONS[0] || 'Unknown Weapon';
const selectedCharacterEquipment = CHARACTER_EQUIPMENT[0] || 'Unknown Equipment';
const selectedCharacterPerk = getPerkCatalog()[0] || 'Boarder';

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
  currentMatchCategory: '',
  setCurrentMatchCategory: vi.fn(),
  activeWeapons: {
    [selectedCharacterWeapon]: 1,
    [selectedCharacterEquipment]: 1,
  } as Record<string, number>,
  setActiveWeapons: vi.fn(),
  activeHero: 'Adrian',
  telemetryDetectedHero: 'Adrian',
  telemetryDetectedShip: 'Hunter (2 Player)',
  setCurrentLoadout: vi.fn(),
  currentLoadout: {
    hero: 'Adrian',
    ship: null,
    weapons: [],
    equipment: [],
    characterWeapons: [selectedCharacterWeapon],
    characterEquipment: [selectedCharacterEquipment],
    characterPerks: [selectedCharacterPerk],
  },
  matches: [] as Array<Record<string, unknown>>,
  pendingMatchData: null,
  updateMatch: vi.fn(),
};

const uiState = {
  activeUser: 'Pilot',
  showArtifactSelect: false,
  setShowArtifactSelect: vi.fn(),
  telemetryStatus: { lastEventAt: Date.now() },
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
    uiState.telemetryStatus = { lastEventAt: Date.now() };
    gameData.telemetryDetectedHero = 'Adrian';
    gameData.telemetryDetectedShip = 'Hunter (2 Player)';
    gameData.currentLoadout = {
      hero: 'Adrian',
      ship: null,
      weapons: [],
      equipment: [],
      characterWeapons: [selectedCharacterWeapon],
      characterEquipment: [selectedCharacterEquipment],
      characterPerks: [selectedCharacterPerk],
    };
    gameData.currentMatchCategory = '';
    gameData.matches = [];
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

    const perkButtons = screen.getAllByRole('button', { name: /perks/i });
    const perkHeader = perkButtons.find(btn => btn.textContent?.includes(selectedCharacterPerk));
    expect(perkHeader).toBeInTheDocument();
    expect(within(perkHeader!).getByText(selectedCharacterPerk)).toBeInTheDocument();
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

  it('shows a single mission telemetry summary badge and removes per-section telemetry badges', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel accordionMode />);

    const summary = screen.getByTestId('mission-telemetry-summary');
    expect(summary).toHaveTextContent('Telemetry 3/6');
    expect(summary).toHaveAttribute('title', expect.stringContaining('Weapons 1/2'));
    expect(summary).toHaveAttribute('title', expect.stringContaining('Equipment 1/2'));
    expect(summary).toHaveAttribute('title', expect.stringContaining('Perks 1/2'));

    expect(screen.queryByTestId('telemetry-prospector-weapons')).not.toBeInTheDocument();
    expect(screen.queryByTestId('telemetry-prospector-equipment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('telemetry-prospector-perks')).not.toBeInTheDocument();
  });

  it('shows the telemetry summary in transparent mode and ignores blank telemetry entries', async () => {
    gameData.currentLoadout = {
      hero: 'Adrian',
      ship: null,
      weapons: [],
      equipment: [],
      characterWeapons: ['  ', selectedCharacterWeapon],
      characterEquipment: [''],
      characterPerks: ['   ', selectedCharacterPerk],
    };
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel variant="transparent" accordionMode />);

    const summary = screen.getByTestId('mission-telemetry-summary');
    expect(summary).toHaveTextContent('Telemetry 2/6');
    expect(summary).toHaveAttribute('title', expect.stringContaining('Weapons 1/2'));
    expect(summary).toHaveAttribute('title', expect.stringContaining('Equipment 0/2'));
    expect(summary).toHaveAttribute('title', expect.stringContaining('Perks 1/2'));
  });

  it('suppresses the telemetry summary when no fresh telemetry identity is present', async () => {
    gameData.telemetryDetectedHero = undefined as unknown as string;
    gameData.telemetryDetectedShip = undefined as unknown as string;
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel accordionMode />);

    expect(screen.queryByTestId('mission-telemetry-summary')).not.toBeInTheDocument();
  });

  it('includes patch-era prospector loadout options for manual entry', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel />);

    expect(screen.getByText('Foam Gun')).toBeInTheDocument();
    expect(screen.getByText('Rocket Launcher')).toBeInTheDocument();
    expect(screen.getByText('Hand Cannon')).toBeInTheDocument();
    expect(screen.getByText('Repulsor')).toBeInTheDocument();
    expect(screen.getByText('Plasma Grenade')).toBeInTheDocument();
    expect(screen.getAllByText('Boarder').length).toBeGreaterThan(0);
    expect(screen.getByText('Adrian Jetpack')).toBeInTheDocument();
  });

  it('persists mission intel perk toggles into current loadout', async () => {
    gameData.currentLoadout = {
      hero: 'Adrian',
      ship: null,
      weapons: [],
      equipment: [],
      characterWeapons: [],
      characterEquipment: [],
      characterPerks: [],
    };
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel />);

    fireEvent.click(screen.getByRole('button', { name: /toggle perk boarder/i }));
    expect(gameData.setCurrentLoadout).toHaveBeenCalledWith(expect.objectContaining({
      hero: 'Adrian',
      characterPerks: ['Boarder'],
      perks: ['Boarder'],
    }));
  });

  it('lets users enter a sticky match category from the recording panel', async () => {
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel />);

    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    fireEvent.change(screen.getByPlaceholderText(/tournament, scrim, league/i), {
      target: { value: 'Spring Invitational' },
    });

    expect(gameData.setCurrentMatchCategory).toHaveBeenCalledWith('Spring Invitational');
  });

  it('mirrors the current category onto the active ongoing draft match', async () => {
    gameData.currentMatchCategory = 'Spring Invitational';
    gameData.matches = [{
      id: 77,
      timestamp: Date.now(),
      date: '2026-03-27',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: [],
      opponents: [],
      hero: 'Adrian',
      ship: 'Hunter (4 Player)',
      reachModifiers: [],
      kills: {},
      result: 'Ongoing',
      subType: 'Telemetry Draft',
      notes: '',
      artifacts: [],
    }];
    const { MissionPanel } = await import('./MissionPanel');
    render(<MissionPanel />);

    expect(gameData.updateMatch).toHaveBeenCalledWith(expect.objectContaining({
      id: 77,
      matchCategory: 'Spring Invitational',
    }));
  });
});
