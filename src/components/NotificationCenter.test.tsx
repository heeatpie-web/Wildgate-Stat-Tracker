import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
 
const dismissNotification = vi.fn();
const advanceTipLibraryIndex = vi.fn();
const setTipsEnabled = vi.fn();
const appStoreState = {
  dismissNotification: (id: string) => dismissNotification(id),
  advanceTipLibraryIndex,
  setTipsEnabled,
};

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
  setSmartCapturesOpenOcrReviewMatchId: vi.fn(),
};

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => uiState,
}));
vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
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

  it('opens smart captures OCR review deep links on the requested match', async () => {
    uiState.notificationCenterOpen = true;
    uiState.notifications = [
      {
        id: 'n_ocr',
        message: 'OCR ready',
        type: 'success',
        source: 'smart-capture',
        popup: true,
        durationMs: 10_000,
        createdAt: Date.now(),
        readAt: null,
        deepLink: { type: 'openSmartCaptureOcrReview', matchId: 119 },
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole('button', { name: /ocr ready/i }));

    expect(uiState.markNotificationRead).toHaveBeenCalledWith('n_ocr');
    expect(uiState.setActiveView).toHaveBeenCalledWith('smart-captures');
    expect(uiState.setSmartCapturesFocusMatchId).toHaveBeenCalledWith(119);
    expect(uiState.setSmartCapturesOpenOcrReviewMatchId).toHaveBeenCalledWith(119);
  });

  it('anchors the inbox panel at top-right and keeps read rows fully opaque', async () => {
    uiState.notificationCenterOpen = true;
    uiState.notifications = [
      {
        id: 'n1',
        message: 'Already read',
        type: 'info',
        source: 'system',
        popup: false,
        durationMs: 5000,
        createdAt: Date.now(),
        readAt: Date.now(),
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);

    const panel = screen.getByRole('dialog', { name: /notification inbox/i });
    expect(panel).toHaveClass('fixed');
    expect(panel).toHaveClass('right-4');
    expect(panel).toHaveClass('top-20');
    expect(panel).toHaveClass('text-md-sys-on-surface');

    const readRow = screen.getByRole('button', { name: /already read/i });
    expect(readRow).not.toHaveClass('opacity-90');
  });

  it('supports row-level dismiss from the inbox', async () => {
    uiState.notificationCenterOpen = true;
    uiState.notifications = [
      {
        id: 'n1',
        message: 'Dismiss this row',
        type: 'info',
        source: 'system',
        popup: true,
        durationMs: 5000,
        createdAt: Date.now(),
        readAt: null,
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));

    expect(dismissNotification).toHaveBeenCalledWith('n1');
    expect(screen.queryByText('Dismiss this row')).not.toBeInTheDocument();
  });

  it('advances and can disable tips from the pinned tip controls', async () => {
    uiState.notificationCenterOpen = true;
    uiState.notifications = [
      {
        id: 'tip_1',
        message: 'Tip: Test tip',
        type: 'tip',
        source: 'system',
        popup: true,
        durationMs: 5000,
        createdAt: Date.now(),
        readAt: null,
      },
    ];

    const { NotificationCenter } = await import('./NotificationCenter');
    render(<NotificationCenter />);

    fireEvent.click(screen.getByTitle('Next tip'));
    expect(advanceTipLibraryIndex).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTitle('Hide tips'));
    expect(setTipsEnabled).toHaveBeenCalledWith(false);
    expect(dismissNotification).toHaveBeenCalledWith('tip_1');
  });
});
