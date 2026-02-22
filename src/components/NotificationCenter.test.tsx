import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const uiState = {
  notifications: [] as any[],
  notificationCenterOpen: false,
  setNotificationCenterOpen: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  clearNotifications: vi.fn(),
  setActiveView: vi.fn(),
  setShowSettings: vi.fn(),
  setShowIdMapper: vi.fn(),
  setShowReviewQueue: vi.fn(),
  setShowWizard: vi.fn(),
  setSmartCapturesFocusMatchId: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));

describe('NotificationCenter', () => {
  beforeEach(() => {
    uiState.notifications = [];
    uiState.notificationCenterOpen = false;
    vi.clearAllMocks();
  });

  it('shows unread count on bell button', async () => {
    uiState.notifications = [
      {
        id: 'n1',
        message: 'Unread one',
        type: 'info',
        source: 'system',
        popup: true,
        durationMs: 5000,
        createdAt: Date.now(),
        readAt: null,
      },
      {
        id: 'n2',
        message: 'Read one',
        type: 'success',
        source: 'history',
        popup: true,
        durationMs: 5000,
        createdAt: Date.now(),
        readAt: Date.now(),
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);

    expect(screen.getByRole('button', { name: /notifications \(1 unread\)/i })).toBeInTheDocument();
  });

  it('marks a notification read and executes deep links', async () => {
    uiState.notificationCenterOpen = true;
    uiState.notifications = [
      {
        id: 'n1',
        message: 'Map this ID',
        type: 'warning',
        source: 'id-mapper',
        popup: true,
        durationMs: 10_000,
        createdAt: Date.now(),
        readAt: null,
        deepLink: { type: 'openIdMapper' },
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole('button', { name: /map this id/i }));

    expect(uiState.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(uiState.setShowIdMapper).toHaveBeenCalledWith(true);
  });
});
