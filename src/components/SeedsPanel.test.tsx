import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

const emptyArtifacts = () => ({
    images: [],
    imageFiles: [],
    telemetry: [],
    missingImages: [],
    resolvedFromDisk: true,
});

const getRow = (seed: string): HTMLElement => {
    const seedEl = screen.getByText(seed);
    const row = seedEl.closest('[role="button"]');
    if (!row) throw new Error(`row for seed ${seed} not found`);
    return row as HTMLElement;
};

describe('SeedsPanel data table', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStoreState.matches = [];
        appStoreState.performanceMode = false;
        appStoreState.disableAnimations = false;
        getMatchArtifactsStructured.mockResolvedValue(emptyArtifacts());
    });

    it('renders one row per seed with seed hex, ship, result and captured date', async () => {
        appStoreState.matches = [buildMatch()];
        render(<SeedsPanel />);

        expect(await screen.findByText('A1B2C3D4')).toBeInTheDocument();
        expect(screen.getByText('Sparrow')).toBeInTheDocument();
        expect(screen.getByText('Win')).toBeInTheDocument();
    });

    it('filters seeds by search term', async () => {
        appStoreState.matches = [
            buildMatch({ id: 1, mapSeed: 'AAAA1111' }),
            buildMatch({ id: 2, mapSeed: 'BBBB2222' }),
        ];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        expect(screen.getByText('BBBB2222')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('textbox', { name: 'Filter seeds' }), { target: { value: 'aaaa' } });

        expect(screen.getByText('AAAA1111')).toBeInTheDocument();
        expect(screen.queryByText('BBBB2222')).not.toBeInTheDocument();
    });

    it('shows a ×N reused badge and a multi-ship pill when a seed has multiple matches', async () => {
        appStoreState.matches = [
            buildMatch({ id: 1, mapSeed: 'CCCC3333', ship: 'Sparrow', timestamp: Date.now() }),
            buildMatch({ id: 2, mapSeed: 'CCCC3333', ship: 'Frigate', timestamp: Date.now() - 1000 }),
        ];
        render(<SeedsPanel />);

        await screen.findByText('CCCC3333');
        expect(screen.getByText('×2')).toBeInTheDocument();
        expect(screen.getByText('2 ships')).toBeInTheDocument();
    });

    it('filters by hazard when a hazard chip is clicked, and reflects the active chip', async () => {
        appStoreState.matches = [
            buildMatch({ id: 1, mapSeed: 'AAAA1111', reachModifiers: ['Cosmic Storm'] }),
            buildMatch({ id: 2, mapSeed: 'BBBB2222', reachModifiers: ['Sandstorm'] }),
        ];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        const hazardChip = screen.getByRole('button', { name: 'Cosmic Storm · 1' });
        fireEvent.click(hazardChip);

        expect(hazardChip).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('AAAA1111')).toBeInTheDocument();
        expect(screen.queryByText('BBBB2222')).not.toBeInTheDocument();
    });

    it('filters by hazard when clicking a hazard tag inside a row, without expanding the row', async () => {
        appStoreState.matches = [
            buildMatch({ id: 1, mapSeed: 'AAAA1111', reachModifiers: ['Cosmic Storm'] }),
            buildMatch({ id: 2, mapSeed: 'BBBB2222', reachModifiers: ['Sandstorm'] }),
        ];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        const row = getRow('AAAA1111');
        fireEvent.click(within(row).getByText('Cosmic Storm'));

        expect(row).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('AAAA1111')).toBeInTheDocument();
        expect(screen.queryByText('BBBB2222')).not.toBeInTheDocument();
    });

    it('expands and collapses a row on click, revealing match history', async () => {
        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111' })];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        const row = getRow('AAAA1111');
        expect(row).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(row);
        expect(row).toHaveAttribute('aria-expanded', 'true');
        // Ship name now appears both in the row and in the expanded match-history entry.
        expect(screen.getAllByText('Sparrow').length).toBeGreaterThan(1);

        fireEvent.click(row);
        expect(row).toHaveAttribute('aria-expanded', 'false');
    });

    it('allows multiple rows to be expanded at once', async () => {
        appStoreState.matches = [
            buildMatch({ id: 1, mapSeed: 'AAAA1111' }),
            buildMatch({ id: 2, mapSeed: 'BBBB2222', timestamp: Date.now() - 1000 }),
        ];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        fireEvent.click(getRow('AAAA1111'));
        fireEvent.click(getRow('BBBB2222'));

        expect(getRow('AAAA1111')).toHaveAttribute('aria-expanded', 'true');
        expect(getRow('BBBB2222')).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() => expect(getMatchArtifactsStructured).toHaveBeenCalled());
    });

    it('copies the seed hex to the clipboard and shows a toast without expanding the row', async () => {
        Object.assign(navigator, { clipboard: { writeText: vi.fn(), write: vi.fn() } });
        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111' })];
        render(<SeedsPanel />);

        const seedText = await screen.findByText('AAAA1111');
        fireEvent.click(seedText);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AAAA1111');
        expect(await screen.findByText('Copied AAAA1111')).toBeInTheDocument();
        expect(getRow('AAAA1111')).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows category pills derived from matchCategory', async () => {
        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111', matchCategory: 'Clip-Worthy' })];
        render(<SeedsPanel />);

        await screen.findByText('AAAA1111');
        expect(screen.getByText('Clip-Worthy')).toBeInTheDocument();
    });

    it('shows the tactical map capture for a match once its row is expanded', async () => {
        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111' })];
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
        await screen.findByText('AAAA1111');
        fireEvent.click(getRow('AAAA1111'));

        const thumbnail = await screen.findByAltText('Tactical map capture');
        expect(thumbnail).toHaveAttribute('src', 'C:/caps/capture_map_1.png');
    });

    it('opens the tactical map in a lightbox with a ship · date header', async () => {
        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111', ship: 'Sparrow', date: 'Jul 28' })];
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
        await screen.findByText('AAAA1111');
        fireEvent.click(getRow('AAAA1111'));

        fireEvent.click(await screen.findByRole('button', { name: /Open tactical map/i }));
        expect(await screen.findByAltText('Tactical map preview')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Sparrow · Jul 28' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close tactical map preview' }));
        await waitFor(() => expect(screen.queryByAltText('Tactical map preview')).not.toBeInTheDocument());
    });

    it('exposes an accessible label for the seed search input', async () => {
        appStoreState.matches = [buildMatch()];
        render(<SeedsPanel />);

        expect(await screen.findByRole('textbox', { name: 'Filter seeds' })).toBeInTheDocument();
    });
});

describe('SeedsPanel tactical map loading affordance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStoreState.matches = [];
        appStoreState.performanceMode = false;
        appStoreState.disableAnimations = false;
    });

    it('shows a loading status while the tactical map lookup is in flight, then resolves', async () => {
        let resolveArtifacts: (value: unknown) => void = () => {};
        const pending = new Promise((resolve) => { resolveArtifacts = resolve; });
        getMatchArtifactsStructured.mockReturnValue(pending);

        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111' })];
        render(<SeedsPanel />);
        await screen.findByText('AAAA1111');
        fireEvent.click(getRow('AAAA1111'));

        expect(await screen.findByRole('status', { name: 'Loading tactical map preview' })).toBeInTheDocument();

        resolveArtifacts({
            images: ['C:/caps/capture_map_1.png'],
            imageFiles: [
                { artifactId: 'b', filename: 'capture_map_1.png', path: 'C:/caps/capture_map_1.png', screenshotType: 'tactical_map' },
            ],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: true,
        });

        await waitFor(() =>
            expect(screen.queryByRole('status', { name: 'Loading tactical map preview' })).not.toBeInTheDocument()
        );
        expect(await screen.findByAltText('Tactical map capture')).toBeInTheDocument();
    });

    it('does not show a loading status once resolution finds no capture', async () => {
        let resolveArtifacts: (value: unknown) => void = () => {};
        const pending = new Promise((resolve) => { resolveArtifacts = resolve; });
        getMatchArtifactsStructured.mockReturnValue(pending);

        appStoreState.matches = [buildMatch({ mapSeed: 'AAAA1111' })];
        render(<SeedsPanel />);
        await screen.findByText('AAAA1111');
        fireEvent.click(getRow('AAAA1111'));

        expect(await screen.findByRole('status', { name: 'Loading tactical map preview' })).toBeInTheDocument();

        resolveArtifacts(emptyArtifacts());

        await waitFor(() =>
            expect(screen.queryByRole('status', { name: 'Loading tactical map preview' })).not.toBeInTheDocument()
        );
        expect(screen.queryByAltText('Tactical map capture')).not.toBeInTheDocument();
    });
});
