import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SystemPulse from './SystemPulse';
import { runtimeConfig } from '../config/runtimeConfig';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available';

const uiState = {
  updateStatus: 'idle' as UpdateStatus,
  enableAutoLogRecording: false,
  telemetryStatus: { exists: false as boolean, lastEventAt: undefined as number | undefined },
};

const gameData = {
  isMatchInProgress: false,
  pendingReviews: [] as unknown[],
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

vi.mock('../providers/GameDataProvider', () => ({
  useGameData: () => gameData,
}));

vi.mock('../utils/electronAPI', () => ({
  getElectronAPI: () => null,
}));

describe('SystemPulse telemetry indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    uiState.updateStatus = 'idle';
    uiState.enableAutoLogRecording = false;
    uiState.telemetryStatus = { exists: false, lastEventAt: undefined };
    gameData.isMatchInProgress = false;
    gameData.pendingReviews = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lights the session indicator only when telemetry is recent', () => {
    uiState.telemetryStatus = {
      exists: true,
      lastEventAt: Date.now() - (runtimeConfig.systemPulse.telemetryReceivingWindowMs - 1_000),
    };

    render(<SystemPulse />);

    const sessionChip = screen.getByTitle('Session: receiving telemetry');
    expect(sessionChip).toHaveClass('bg-md-sys-surface-container-highest/92');
    expect(sessionChip.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows connected idle without active lighting when telemetry is stale', () => {
    uiState.telemetryStatus = {
      exists: true,
      lastEventAt: Date.now() - (runtimeConfig.systemPulse.telemetryReceivingWindowMs + 1),
    };

    render(<SystemPulse />);

    const sessionChip = screen.getByTitle('Session: connected (idle)');
    expect(sessionChip).not.toHaveClass('bg-md-sys-surface-container-highest/92');
    expect(sessionChip.querySelector('.animate-pulse')).toBeNull();
  });

  it('shows offline when telemetry is not connected', () => {
    uiState.telemetryStatus = { exists: false, lastEventAt: Date.now() };

    render(<SystemPulse />);

    const sessionChip = screen.getByTitle('Session: offline');
    expect(sessionChip).not.toHaveClass('bg-md-sys-surface-container-highest/92');
    expect(sessionChip.querySelector('.animate-pulse')).toBeNull();
  });
});
