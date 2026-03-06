import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
    showSetupWizard: true,
    setShowSetupWizard: vi.fn(),
    setToast: vi.fn(),
    setActiveUser: vi.fn(),
};

const gameData = {
    addPlayer: vi.fn(),
};

const userPrefs = {
    appearanceMode: 'twilight' as const,
    setAppearanceMode: vi.fn(),
    colorTheme: 'ocean',
    setColorTheme: vi.fn(),
    customHue: '0',
    setCustomHue: vi.fn(),
    soundEnabled: true,
    setSoundEnabled: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameData,
}));

vi.mock('../providers/UserPreferencesProvider', () => ({
    useUserPreferences: () => userPrefs,
}));

vi.mock('../hooks/useFocusTrap', () => ({
    useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
    useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../utils/electronAPI', () => ({
    getElectronAPI: () => null,
}));

describe('SetupWizard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        window.sessionStorage.clear();
        uiState.showSetupWizard = true;
    });

    it('marks startup health check as seen when setup is completed', async () => {
        const { SetupWizard } = await import('./SetupWizard');
        render(<SetupWizard />);

        fireEvent.change(screen.getByPlaceholderText('Callsign...'), { target: { value: 'Ace' } });
        fireEvent.click(screen.getByRole('button', { name: /continue/i }));

        for (let idx = 0; idx < 3; idx += 1) {
            fireEvent.click(screen.getByRole('button', { name: /continue/i }));
        }

        fireEvent.click(screen.getByRole('button', { name: /start wild gate stat tracker/i }));

        expect(gameData.addPlayer).toHaveBeenCalledWith('Ace');
        expect(uiState.setActiveUser).toHaveBeenCalledWith('Ace');
        expect(uiState.setShowSetupWizard).toHaveBeenCalledWith(false);
        expect(window.localStorage.getItem('wg_startup_health_check_seen_v2:ace')).toBe('1');
        expect(window.sessionStorage.getItem('wg_startup_health_check_skipped_launch_v2:ace')).toBeNull();
    });
});
