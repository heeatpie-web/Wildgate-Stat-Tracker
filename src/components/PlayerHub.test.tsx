import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import PlayerHub from './PlayerHub';

const matches: Match[] = [
    {
        id: 1,
        timestamp: 1_700_000_000_000,
        date: '2026-02-17',
        mode: 'Artifact Brawl',
        player: 'PilotOne',
        teammates: ['Wingman'],
        opponents: ['Pilot0ne'],
        hero: 'Hero',
        ship: 'Hunter',
        reachModifiers: [],
        kills: {},
        result: 'Win',
        subType: 'Combat',
    },
];

const gameDataState = {
    pilotRegistry: ['PilotOne', 'Pilot0ne'],
    favorites: [],
    pilotNotes: {},
    pilotAliases: {
        PilotOne: ['Pilot One Old'],
    },
    toggleFavorite: vi.fn(),
    updatePilotNote: vi.fn(),
    removeFromRegistry: vi.fn(),
    renamePilot: vi.fn(),
    mergePilots: vi.fn(),
    undoLastMerge: vi.fn(),
    mergeHistory: [],
    pendingReviews: [],
    addToRegistry: vi.fn(),
    removePendingReview: vi.fn(),
    matches,
    playerProfiles: {
        PilotOne: {
            id: 'PilotOne',
            sightings: 3,
            firstSeen: 1_700_000_000_000,
            lastSeen: 1_700_000_000_000,
            teamsObserved: {},
            playedWith: { Wingman: 2 },
            playedAgainst: { Pilot0ne: 2 },
            shipsObserved: { Hunter: 2 },
            ocrSightings: 2,
            manualSightings: 1,
            lastOcrConfidence: 88,
        },
        Pilot0ne: {
            id: 'Pilot0ne',
            sightings: 2,
            firstSeen: 1_700_000_000_000,
            lastSeen: 1_700_000_000_000,
            teamsObserved: {},
            playedWith: {},
            playedAgainst: { PilotOne: 2 },
            shipsObserved: { Hunter: 2 },
            ocrSightings: 0,
            manualSightings: 1,
            lastOcrConfidence: null,
        },
    },
    setDrillDownTarget: vi.fn(),
};

const uiState = {
    setActiveView: vi.fn(),
    setToast: vi.fn(),
    setShowSettings: vi.fn(),
};

const appStoreState = {
    ocrAliasModel: {
        version: 1 as const,
        entries: {
            pil0tone: [{
                rawKey: 'PliotOne',
                normalizedKey: 'pil0tone',
                targetName: 'PilotOne',
                count: 3,
                lastUpdatedAt: Date.now(),
                source: 'review_modal' as const,
                confidenceWeight: 0.8,
                contexts: { unknown: 3 },
            }],
        },
        blocklist: {},
        stats: { totalEntries: 1, lastCompactedAt: Date.now() },
    },
    recordOcrAliasCorrection: vi.fn(),
};

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameDataState,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

vi.mock('./LocalImage', () => ({
    LocalImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

describe('PlayerHub', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gameDataState.pendingReviews = [];
    });

    it('shows former names, learned OCR variants, and duplicate candidates for the selected player', () => {
        render(<PlayerHub />);

        fireEvent.click(screen.getByRole('button', { name: /pilotone/i }));
        fireEvent.click(screen.getAllByRole('button', { name: /view full profile/i })[0]);

        expect(screen.getByText('Former Names & OCR Variants')).toBeInTheDocument();
        expect(screen.getByText('Pilot One Old')).toBeInTheDocument();
        expect(screen.getAllByText((_, element) => element?.textContent?.includes('PliotOne') ?? false)[0]).toBeInTheDocument();
        expect(screen.getByText('Possible Duplicates')).toBeInTheDocument();
        expect(screen.getAllByText('Pilot0ne')[0]).toBeInTheDocument();
    });

    it('lets the OCR workbench merge a candidate into an existing player suggestion', () => {
        gameDataState.pendingReviews = [{
            id: 'candidate-1',
            type: 'roster_candidate',
            value: 'PliotOne',
            originalConfidence: 77,
            bestMatch: 'PilotOne',
            bestScore: 91,
            suggestions: [{ name: 'PilotOne', score: 91 }],
            canonicalTargetKey: 'pilotone',
        }];

        render(<PlayerHub />);

        fireEvent.click(screen.getAllByRole('button', { name: /ocr work \(1\)/i })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: /merge into pilotone \(91%\)/i })[0]);

        expect(appStoreState.recordOcrAliasCorrection).toHaveBeenCalledWith('PliotOne', 'PilotOne', expect.any(Object));
        expect(gameDataState.removePendingReview).toHaveBeenCalledWith('candidate-1');
        expect(gameDataState.addToRegistry).toHaveBeenCalledWith('PilotOne');
    });
});
