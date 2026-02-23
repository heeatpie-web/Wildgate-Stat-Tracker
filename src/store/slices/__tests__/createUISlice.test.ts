import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createUISlice, type UISlice } from '../createUISlice';

const makeStore = () => createStore<UISlice>()(createUISlice);

describe('createUISlice notifications', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('routes setToast notifications into history and stacks popup ids', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });

    const state = store.getState();
    expect(state.notifications).toHaveLength(2);
    expect(state.toast?.message).toBe('Second');
    expect(state.notificationQueue).toHaveLength(2);
  });

  it('dismisses the active popup while keeping remaining stacked popups visible', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });

    store.getState().dismissActiveNotification();
    expect(store.getState().toast?.message).toBe('First');
    expect(store.getState().notificationQueue).toHaveLength(1);
  });

  it('keeps history and maintains a stacked popup burst', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });
    store.getState().setToast({ message: 'Third', type: 'success' });

    const stateAfterBurst = store.getState();
    expect(stateAfterBurst.notifications).toHaveLength(3);
    expect(stateAfterBurst.toast?.message).toBe('Third');
    expect(stateAfterBurst.notificationQueue).toHaveLength(3);

    store.getState().dismissActiveNotification();
    const stateAfterFirstDismiss = store.getState();
    expect(stateAfterFirstDismiss.toast?.message).toBe('Second');
    expect(stateAfterFirstDismiss.notificationQueue).toHaveLength(2);

    store.getState().dismissActiveNotification();
    const stateAfterSecondDismiss = store.getState();
    expect(stateAfterSecondDismiss.toast?.message).toBe('First');
    expect(stateAfterSecondDismiss.notificationQueue).toHaveLength(1);
  });

  it('dismisses a specific popup id without draining the stack', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });
    store.getState().setToast({ message: 'Third', type: 'success' });

    const second = store.getState().notifications.find((item) => item.message === 'Second');
    expect(second).toBeDefined();

    store.getState().dismissNotification(second!.id);

    const state = store.getState();
    expect(state.notificationQueue).toHaveLength(2);
    expect(state.notificationQueue).not.toContain(second!.id);
    expect(state.notifications.find((item) => item.id === second!.id)?.readAt).not.toBeNull();
    expect(state.toast?.message).toBe('Third');
  });

  it('supports duration override and deep-link metadata', () => {
    store.getState().pushNotification({
      message: 'Smart Capture prompt',
      type: 'info',
      durationMs: 10_000,
      source: 'smart-capture',
      deepLink: { type: 'openView', view: 'recording' },
    });

    const [latest] = store.getState().notifications;
    expect(latest.durationMs).toBe(10_000);
    expect(latest.source).toBe('smart-capture');
    expect(latest.deepLink).toEqual({ type: 'openView', view: 'recording' });
  });

  it('marks notifications as read and supports mark-all', () => {
    store.getState().pushNotification({ message: 'One', type: 'info' });
    store.getState().pushNotification({ message: 'Two', type: 'warning' });

    const [first] = store.getState().notifications;
    store.getState().markNotificationRead(first.id);
    expect(store.getState().notifications.find((item) => item.id === first.id)?.readAt).not.toBeNull();
    expect(store.getState().notificationQueue).toHaveLength(1);

    store.getState().markAllNotificationsRead();
    expect(store.getState().notifications.every((item) => item.readAt != null)).toBe(true);
    expect(store.getState().notificationQueue).toHaveLength(0);
    expect(store.getState().toast).toBeNull();
  });

  it('enforces a notification history cap of 200 items', () => {
    for (let i = 1; i <= 205; i += 1) {
      store.getState().pushNotification({
        message: `Item ${i}`,
        type: 'info',
        popup: false,
      });
    }

    const state = store.getState();
    expect(state.notifications).toHaveLength(200);
    expect(state.notifications[0].message).toBe('Item 205');
    expect(state.notifications[state.notifications.length - 1].message).toBe('Item 6');
  });
});
