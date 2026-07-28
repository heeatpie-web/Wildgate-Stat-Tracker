import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import type { Match } from '../types';

const appStoreState: { matches: Match[]; performanceMode: boolean; disableAnimations: boolean } = {
    matches: [],
    performanceMode: false,
    disableAnimations: false,
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

const getMatchArtifactsStructured = vi.fn();
vi.mock('../utils/artifactService', () => ({
    getMatchArtifactsStructured: (...args: unknown[]) => getMatchArtifactsStructured(...args),
}));

// LocalImage reads from disk over IPC, which is unavailable under jsdom.
vi.mock('./LocalImage', () => ({
    LocalImage: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt} />,
}));

import { SeedsPanel } from './SeedsPanel';

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
    id: 1,
    timestamp: Date.now(),
    date: '2026-07-01',
    mode: 'Artifact Brawl',
    result: 'Win',
    ship: 'Sparrow',
    mapSeed: 'A1B2C3D4',
    ...overrides,
} as Match);

describe('SeedsPanel tactical map previews', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStoreState.matches = [];
        appStoreState.performanceMode = false;
        appStoreState.disableAnimations = false;
    });

    it('shows the tactical map capture for a match on the seed', async () => {
        appStoreState.matches = [buildMatch()];
        getMatchArtifactsStructured.mockResolvedValue({
            images: ['C:/caps/capture_result_1.png', 'C:/caps/capture_map_1.png'],
            imageFiles: [
                { artifactId: 'a', filename: 'capture_result_1.png', path: 'C:/caps/capture_result_1.png', screenshotType: 'result' },
                { artifactId: 'b', filename: 'capture_map_1.png', path: 'C:/caps/capture_map_1.png', screenshotType: 'tactical_map' },
            ],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: true,
        });

        render(<SeedsPanel />);

        const thumbnail = await screen.findByAltText('Tactical map capture');
        expect(thumbnail).toHaveAttribute('src', 'C:/caps/capture_map_1.png');
    });

    it('omits the preview when the match has no tactical map capture', async () => {
        appStoreState.matches = [buildMatch()];
        getMatchArtifactsStructured.mockResolvedValue({
            images: ['C:/caps/capture_result_1.png'],
            imageFiles: [
                { artifactId: 'a', filename: 'capture_result_1.png', path: 'C:/caps/capture_result_1.png', screenshotType: 'result' },
            ],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: true,
        });

        render(<SeedsPanel />);

        await waitFor(() => expect(getMatchArtifactsStructured).toHaveBeenCalled());
        expect(screen.queryByAltText('Tactical map capture')).not.toBeInTheDocument();
    });

    it('falls back to filename classification when the artifact lookup fails', async () => {
        appStoreState.matches = [buildMatch({ artifacts: ['C:/caps/capture_tactical_map_9.png'] })];
        getMatchArtifactsStructured.mockRejectedValue(new Error('ipc down'));

        render(<SeedsPanel />);

        const thumbnail = await screen.findByAltText('Tactical map capture');
        expect(thumbnail).toHaveAttribute('src', 'C:/caps/capture_tactical_map_9.png');
    });

    it('opens the tactical map in a lightbox', async () => {
        appStoreState.matches = [buildMatch()];
        getMatchArtifactsStructured.mockResolvedValue({
            images: ['C:/caps/capture_map_1.png'],
            imageFiles: [
                { artifactId: 'b', filename: 'capture_map_1.png', path: 'C:/caps/capture_map_1.png', screenshotType: 'tactical_map' },
            ],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: true,
        });

        render(<SeedsPanel />);

        fireEvent.click(await screen.findByRole('button', { name: /Open tactical map/i }));
        expect(await screen.findByAltText('Tactical map preview')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close tactical map preview' }));
        await waitFor(() => expect(screen.queryByAltText('Tactical map preview')).not.toBeInTheDocument());
    });
});
