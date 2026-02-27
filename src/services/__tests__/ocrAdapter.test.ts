import { describe, expect, it, vi } from 'vitest';
import {
    getMatchArtifactsStructured,
    resetOcrAdapter,
    rerunOCROnArtifact,
    setOcrAdapter,
} from '../ocrAdapter';

describe('ocrAdapter', () => {
    it('delegates to injected adapter implementation', async () => {
        const mockAdapter = {
            bundleMatchArtifacts: vi.fn(async () => []),
            getMatchArtifactsStructured: vi.fn(async () => ({ images: ['x'], imageFiles: [], telemetry: [] })),
            rerunOCROnArtifact: vi.fn(async () => ({ success: true })),
            rerunOCRMulti: vi.fn(async () => ({ success: true, perFile: [] })),
            applyArtifactRepair: vi.fn(async () => ({ summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [] })),
        };

        setOcrAdapter(mockAdapter as any);

        const artifacts = await getMatchArtifactsStructured(55, ['fallback.png']);
        const rerun = await rerunOCROnArtifact('image.png', 'Alec', 'both');

        expect(mockAdapter.getMatchArtifactsStructured).toHaveBeenCalledWith(55, ['fallback.png']);
        expect(mockAdapter.rerunOCROnArtifact).toHaveBeenCalledWith('image.png', 'Alec', 'both', undefined, undefined);
        expect(artifacts.images).toEqual(['x']);
        expect(rerun.success).toBe(true);
    });

    it('can reset to default adapter', async () => {
        const mockAdapter = {
            bundleMatchArtifacts: vi.fn(async () => []),
            getMatchArtifactsStructured: vi.fn(async () => ({ images: [], imageFiles: [], telemetry: [] })),
            rerunOCROnArtifact: vi.fn(async () => ({ success: false })),
            rerunOCRMulti: vi.fn(async () => ({ success: false, perFile: [] })),
            applyArtifactRepair: vi.fn(async () => ({ summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [] })),
        };
        setOcrAdapter(mockAdapter as any);
        resetOcrAdapter();

        // Default adapter requires Electron bridge and should fail predictably in test env.
        await expect(rerunOCROnArtifact('image.png', 'Alec', 'both')).rejects.toThrow('Electron API not available');
    });
});

