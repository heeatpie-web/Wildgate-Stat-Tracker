import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const playSoundCue = vi.fn();
const dismissNotification = vi.fn();

type MockNotification = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'tip' | 'info';
  popup: boolean;
  durationMs: number;
  readAt: number | null;
  action?: { label: string; onClick: () => void };
};

const mockStoreState = {
  toast: null as { id: string } | null,
  activeNotificationId: null as string | null,
  notificationQueue: [] as string[],
  notifications: [] as MockNotification[],
  dismissNotification: (id: string) => dismissNotification(id),
};

vi.mock('../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => ({ soundEnabled: false }),
}));

vi.mock('../utils/soundCues', () => ({
  playSoundCue: (...args: unknown[]) => playSoundCue(...args),
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

describe('Toast', () => {
  beforeEach(() => {
    mockStoreState.toast = null;
    mockStoreState.activeNotificationId = null;
    mockStoreState.notificationQueue = [];
    mockStoreState.notifications = [];
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders as a top-right popup and auto-closes on duration', async () => {
    const onClose = vi.fn();
    const { Toast } = await import('./Toast');

    render(
      <Toast
        message="Saved"
        type="info"
        duration={1200}
        onClose={onClose}
      />
    );

    const popup = screen.getByRole('status');
    const stack = popup.parentElement;
    expect(stack).toHaveClass('fixed');
    expect(stack).toHaveClass('top-4');
    expect(stack).toHaveClass('right-4');
    expect(stack).toHaveClass('bottom-auto');
    expect(stack).toHaveClass('left-auto');
    expect(popup).toHaveClass('bg-md-sys-surface');
    expect(popup).toHaveClass('text-md-sys-on-surface');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dismissNotification).not.toHaveBeenCalled();
    expect(playSoundCue).not.toHaveBeenCalled();
  });

  it('renders stacked store toasts and auto-dismisses each toast by id', async () => {
    mockStoreState.notifications = [
      { id: 'first', message: 'First toast', type: 'info', popup: true, durationMs: 800, readAt: null },
      { id: 'second', message: 'Second toast', type: 'warning', popup: true, durationMs: 1300, readAt: null },
    ];
    mockStoreState.notificationQueue = ['first', 'second'];
    mockStoreState.activeNotificationId = 'first';
    mockStoreState.toast = { id: 'first' };

    const onClose = vi.fn();
    const { Toast } = await import('./Toast');

    render(
      <Toast
        message="Fallback"
        type="info"
        duration={1200}
        onClose={onClose}
      />
    );

    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(dismissNotification).toHaveBeenCalledTimes(1);
    expect(dismissNotification).toHaveBeenNthCalledWith(1, 'first');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(dismissNotification).toHaveBeenCalledTimes(2);
    expect(dismissNotification).toHaveBeenNthCalledWith(2, 'second');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('caps visible stack to the latest five store toasts', async () => {
    mockStoreState.notifications = [
      { id: 't1', message: 'Toast 1', type: 'info', popup: true, durationMs: 3000, readAt: null },
      { id: 't2', message: 'Toast 2', type: 'info', popup: true, durationMs: 3000, readAt: null },
      { id: 't3', message: 'Toast 3', type: 'info', popup: true, durationMs: 3000, readAt: null },
      { id: 't4', message: 'Toast 4', type: 'info', popup: true, durationMs: 3000, readAt: null },
      { id: 't5', message: 'Toast 5', type: 'info', popup: true, durationMs: 3000, readAt: null },
      { id: 't6', message: 'Toast 6', type: 'info', popup: true, durationMs: 3000, readAt: null },
    ];
    mockStoreState.notificationQueue = ['t1', 't2', 't3', 't4', 't5', 't6'];
    mockStoreState.activeNotificationId = 't1';
    mockStoreState.toast = { id: 't1' };

    const { Toast } = await import('./Toast');
    render(<Toast message="" onClose={vi.fn()} />);

    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 5')).toBeInTheDocument();
    expect(screen.queryByText('Toast 6')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(5);
  });
});
