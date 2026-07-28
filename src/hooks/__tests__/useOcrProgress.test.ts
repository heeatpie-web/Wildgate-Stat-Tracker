import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const listeners = new Map<string, Array<(payload: Record<string, unknown>) => void>>();
const on = vi.fn((channel: string, handler: (payload: Record<string, unknown>) => void) => {
    const existing = listeners.get(channel) || [];
    existing.push(handler);
    listeners.set(channel, existing);
    return () => {
        listeners.set(channel, (listeners.get(channel) || []).filter((entry) => entry !== handler));
    };
});

vi.mock('../../utils/electronAPI', () => ({
    getElectronAPI: () => ({ on }),
}));

const emit = (payload: Record<string, unknown>) => {
    act(() => {
        (listeners.get('ocr-progress') || []).forEach((handler) => handler(payload));
    });
};

const { getOcrStageLabel, useOcrProgress, useOcrProgressListener } = await import('../useOcrProgress');

describe('useOcrProgress', () => {
    beforeEach(() => {
        listeners.clear();
        on.mockClear();
    });

    it('does not subscribe while inactive', () => {
        renderHook(() => useOcrProgress(false));
        expect(on).not.toHaveBeenCalled();
    });

    it('starts at null and reports the latest event once active', () => {
        const { result } = renderHook(() => useOcrProgress(true));
        expect(result.current).toBeNull();

        emit({ stage: 'recognize', fraction: 0.5, imageFraction: 0.5, imageIndex: 0, imageCount: 1 });

        expect(result.current).toEqual({
            stage: 'recognize',
            fraction: 0.5,
            imageFraction: 0.5,
            imageIndex: 0,
            imageCount: 1,
        });
    });

    it('clamps out-of-range fractions and defaults a missing image count', () => {
        const { result } = renderHook(() => useOcrProgress(true));

        emit({ stage: 'extract', fraction: 4, imageFraction: -1 });

        expect(result.current?.fraction).toBe(1);
        expect(result.current?.imageFraction).toBe(0);
        expect(result.current?.imageCount).toBe(1);
    });

    it('ignores malformed payloads rather than reporting NaN', () => {
        const { result } = renderHook(() => useOcrProgress(true));

        emit({ stage: 'recognize' });
        emit({});

        expect(result.current).toBeNull();
    });

    it('unsubscribes and clears state when the run ends', () => {
        const { result, rerender } = renderHook(({ active }) => useOcrProgress(active), {
            initialProps: { active: true },
        });
        emit({ stage: 'recognize', fraction: 0.5, imageFraction: 0.5, imageIndex: 0, imageCount: 1 });
        expect(result.current).not.toBeNull();

        rerender({ active: false });

        expect(result.current).toBeNull();
        expect(listeners.get('ocr-progress')).toHaveLength(0);
    });

    it('useOcrProgressListener forwards every event to the current callback', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = renderHook(
            ({ handler }) => useOcrProgressListener(true, handler),
            { initialProps: { handler: first } },
        );

        emit({ stage: 'decode', fraction: 0.1, imageFraction: 0.1, imageIndex: 0, imageCount: 1 });
        expect(first).toHaveBeenCalledTimes(1);

        // The callback is held in a ref, so swapping it must not resubscribe.
        rerender({ handler: second });
        emit({ stage: 'extract', fraction: 0.9, imageFraction: 0.9, imageIndex: 0, imageCount: 1 });

        expect(second).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledTimes(1);
        expect(on).toHaveBeenCalledTimes(1);
    });

    it('labels every pipeline stage and falls back for unknown ones', () => {
        ['decode', 'preprocess', 'recognize', 'classify', 'extract', 'complete'].forEach((stage) => {
            expect(getOcrStageLabel(stage).length).toBeGreaterThan(0);
        });
        expect(getOcrStageLabel('something-new')).toBe('Processing...');
    });
});
