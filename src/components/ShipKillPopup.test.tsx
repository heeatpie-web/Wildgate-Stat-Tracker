import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ShipKillPopup } from './ShipKillPopup';
import { SHIPS } from '../utils/constants';

const firstShip = SHIPS[0];

const getShipRow = (ship: string) => screen.getByText(ship).closest('div')!;

describe('ShipKillPopup auto-dismiss behavior', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('auto-dismisses after the default 30s when untouched', () => {
        const onDismiss = vi.fn();
        render(<ShipKillPopup matchId={1} onSave={vi.fn()} onDismiss={onDismiss} />);

        vi.advanceTimersByTime(29_999);
        expect(onDismiss).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('restarts (not cancels) the timer on +/- interaction', () => {
        const onDismiss = vi.fn();
        render(
            <ShipKillPopup matchId={1} onSave={vi.fn()} onDismiss={onDismiss} autoDismissMs={10_000} />
        );

        // Interact just before the timer would fire.
        vi.advanceTimersByTime(9_000);
        const row = getShipRow(firstShip);
        const plusButton = within(row).getAllByRole('button')[1];
        fireEvent.click(plusButton);

        // Old timer would have fired here — it must not have, because the
        // interaction restarted the countdown instead of cancelling it forever.
        vi.advanceTimersByTime(9_500);
        expect(onDismiss).not.toHaveBeenCalled();

        // But it should still fire ~10s after the *last* interaction.
        vi.advanceTimersByTime(600);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('never auto-dismisses when autoDismissMs is 0', () => {
        const onDismiss = vi.fn();
        render(
            <ShipKillPopup matchId={1} onSave={vi.fn()} onDismiss={onDismiss} autoDismissMs={0} />
        );

        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses via onSave when the user clicks Save', () => {
        const onDismiss = vi.fn();
        const onSave = vi.fn();
        render(<ShipKillPopup matchId={7} onSave={onSave} onDismiss={onDismiss} autoDismissMs={0} />);

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(onSave).toHaveBeenCalledWith(7, {});
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
