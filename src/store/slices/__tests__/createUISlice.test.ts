import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createUISlice, type UISlice } from '../createUISlice';

const makeStore = () => createStore<UISlice>()(createUISlice);

describe('createUISlice notifications', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('routes setToast notifications into history and popup queue', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });

    const state = store.getState();
    expect(state.notifications).toHaveLength(2);
    expect(state.toast?.message).toBe('First');
    expect(state.notificationQueue).toHaveLength(1);
  });

  it('dismisses active popup and advances queue in order', () => {
    store.getState().setToast({ message: 'First', type: 'info' });
    store.getState().setToast({ message: 'Second', type: 'warning' });

    store.getState().dismissActiveNotification();
    expect(store.getState().toast?.message).toBe('Second');
    expect(store.getState().notificationQueue).toHaveLength(0);

    store.getState().dismissActiveNotification();
    expect(store.getState().toast).toBeNull();
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

    store.getState().markAllNotificationsRead();
    expect(store.getState().notifications.every((item) => item.readAt != null)).toBe(true);
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
