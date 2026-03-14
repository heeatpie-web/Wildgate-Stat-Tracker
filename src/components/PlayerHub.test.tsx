import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Match } from '../types';
import PlayerHub from './PlayerHub';
import { buildRosterMergeSuggestionGroups } from '../utils/rosterMergeSuggestions';

const baseMatches: Match[] = [
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
    rosterEntryMeta: {},
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
    activeMergeNotificationId: null,
    dismissActiveMergeNotification: vi.fn(),
    pendingReviews: [],
    dismissedRosterMergePairKeys: [],
    dismissedRosterCandidateKeys: [],
    dismissRosterMergeSuggestionPairs: vi.fn(),
    dismissRosterCandidateKeys: vi.fn(),
    addToRegistry: vi.fn(),
    confirmRosterEntry: vi.fn(),
    addPilotAlias: vi.fn(),
    removePilotAlias: vi.fn(),
    removePendingReview: vi.fn(),
    matches: [...baseMatches],
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
    removeOcrAliasCorrection: vi.fn(),
    ocrAutoApplyMinScore: 0.83,
};

vi.mock('../utils/rosterMergeSuggestions', async () => {
    const actual = await vi.importActual<typeof import('../utils/rosterMergeSuggestions')>('../utils/rosterMergeSuggestions');
    return {
        ...actual,
        buildRosterMergeSuggestionGroups: vi.fn(actual.buildRosterMergeSuggestionGroups),
    };
});

vi.mock('../providers/GameDataProvider', () => ({
    useGameData: () => gameDataState,
}));

vi.mock('../providers/UIStateProvider', () => ({
    useUIState: () => uiState,
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof gameDataState & typeof appStoreState) => unknown) => selector({
        ...gameDataState,
        ...appStoreState,
    }),
}));

vi.mock('./LocalImage', () => ({
    LocalImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

describe('PlayerHub', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gameDataState.pilotRegistry = ['PilotOne', 'Pilot0ne'];
        gameDataState.rosterEntryMeta = {};
        gameDataState.pilotAliases = { PilotOne: ['Pilot One Old'] };
        gameDataState.matches = [...baseMatches];
        gameDataState.playerProfiles = {
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
        };
        gameDataState.pendingReviews = [];
        gameDataState.mergeHistory = [];
        gameDataState.activeMergeNotificationId = null;
        gameDataState.dismissedRosterMergePairKeys = [];
        gameDataState.dismissedRosterCandidateKeys = [];
        appStoreState.ocrAliasModel = {
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
        };
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
        expect(gameDataState.addToRegistry).toHaveBeenCalledWith('PilotOne', { origin: 'ocr', status: 'confirmed' });
    });

    it('shows detected roster badges and exposes confirm or dismiss actions for OCR-added entries', () => {
        gameDataState.pilotRegistry = ['PilotOne'];
        gameDataState.rosterEntryMeta = {
            pilotone: {
                origin: 'ocr',
                status: 'detected',
                firstSeenAt: 1_700_000_000_000,
                lastSeenAt: 1_700_000_100_000,
                lastConfidence: 88,
                firstSeenMatchId: 'match-17',
            },
        };

        render(<PlayerHub />);

        expect(screen.getByRole('button', { name: /pilotone/i })).toHaveTextContent('Detected');

        fireEvent.click(screen.getByRole('button', { name: /pilotone/i }));

        expect(screen.getAllByText('Detected').length).toBeGreaterThan(0);
        expect(screen.getByText(/auto-added from ocr and still awaiting confirmation/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /confirm detected roster entry/i }));
        expect(gameDataState.confirmRosterEntry).toHaveBeenCalledWith('PilotOne', 'ocr');

        fireEvent.click(screen.getByRole('button', { name: /dismiss detected roster entry/i }));
        expect(gameDataState.removeFromRegistry).toHaveBeenCalledWith('PilotOne');
    });

    it('lets the selected player add and remove former names and OCR variants from the players tab', () => {
        render(<PlayerHub />);

        fireEvent.click(screen.getByRole('button', { name: /pilotone/i }));
        fireEvent.click(screen.getByRole('button', { name: /manage ocr aliases/i }));

        expect(screen.getByText('PliotOne')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText(/add former name or ocr variant/i), {
            target: { value: 'PilotOneAlt' },
        });
        fireEvent.click(screen.getByRole('button', { name: /add former name/i }));

        expect(gameDataState.addPilotAlias).toHaveBeenCalledWith('PilotOne', 'PilotOneAlt');
        expect(appStoreState.recordOcrAliasCorrection).toHaveBeenCalledWith('PilotOneAlt', 'PilotOne', {
            source: 'manual_correction',
            context: 'unknown',
            confidenceWeight: 1,
        });

        fireEvent.change(screen.getByPlaceholderText(/add former name or ocr variant/i), {
            target: { value: 'PilotOneOCR' },
        });
        fireEvent.click(screen.getByRole('button', { name: /add ocr variant/i }));

        expect(appStoreState.recordOcrAliasCorrection).toHaveBeenNthCalledWith(2, 'PilotOneOCR', 'PilotOne', {
            source: 'manual_correction',
            context: 'unknown',
            confidenceWeight: 1,
        });

        fireEvent.click(screen.getByRole('button', { name: /remove former name pilot one old/i }));
        fireEvent.click(screen.getByRole('button', { name: /remove ocr variant pliotone/i }));

        expect(gameDataState.removePilotAlias).toHaveBeenCalledWith('PilotOne', 'Pilot One Old');
        expect(appStoreState.removeOcrAliasCorrection).toHaveBeenCalledWith('Pilot One Old', 'PilotOne');
        expect(appStoreState.removeOcrAliasCorrection).toHaveBeenCalledWith('PliotOne', 'PilotOne');
    });

    it('uses recent matches from OCR variants when showing last encounter recency', () => {
        const now = Date.UTC(2026, 2, 9, 18, 0, 0);
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
        gameDataState.pilotRegistry = ['PilotOne'];
        gameDataState.playerProfiles = {
            PilotOne: {
                id: 'PilotOne',
                sightings: 4,
                firstSeen: now - (16 * 24 * 60 * 60 * 1000),
                lastSeen: now - (16 * 24 * 60 * 60 * 1000),
                teamsObserved: {},
                playedWith: {},
                playedAgainst: {},
                shipsObserved: { Hunter: 1 },
                ocrSightings: 2,
                manualSightings: 2,
                lastOcrConfidence: 88,
            },
        };
        gameDataState.matches = [{
            id: 2,
            timestamp: now - (24 * 60 * 60 * 1000),
            date: '2026-03-08',
            mode: 'Artifact Brawl',
            player: 'ActiveUser',
            teammates: ['PliotOne'],
            opponents: [],
            hero: 'Hero',
            ship: 'Hunter',
            reachModifiers: [],
            kills: {},
            result: 'Win',
            subType: 'Combat',
        }];

        render(<PlayerHub />);

        const pilotButton = screen.getByRole('button', { name: /pilotone/i });
        expect(pilotButton).toHaveTextContent('1 encounter');
        expect(pilotButton).toHaveTextContent('1d ago');

        fireEvent.click(pilotButton);
        expect(screen.getByText(/last seen 1d ago/i)).toBeInTheDocument();

        dateNowSpy.mockRestore();
    });

    it('shows a dismissible merge notification banner for the active merge', () => {
        gameDataState.mergeHistory = [{
            id: 'merge-1',
            timestamp: Date.now(),
            sourceName: 'Pilot0ne',
            targetName: 'PilotOne',
        }];
        gameDataState.activeMergeNotificationId = 'merge-1';

        render(<PlayerHub />);

        expect(screen.getByText(/merged/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /dismiss merge notification/i }));

        expect(gameDataState.dismissActiveMergeNotification).toHaveBeenCalledTimes(1);
    });

    it('surfaces possible roster merges in the OCR workbench and lets them be merged or dismissed', () => {
        gameDataState.pilotRegistry = ['Ace Pilot', 'Ace Squad'];

        render(<PlayerHub />);

        fireEvent.click(screen.getAllByRole('button', { name: /^ocr work$/i })[0]);

        expect(screen.getAllByRole('button', { name: /collapse possible merges/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/keep ace pilot/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/ace squad \(82%\)/i).length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByRole('button', { name: /merge possible roster variants into ace pilot/i })[0]);
        expect(gameDataState.mergePilots).toHaveBeenCalledWith('Ace Squad', 'Ace Pilot');

        fireEvent.click(screen.getAllByRole('button', { name: /dismiss possible merge suggestions for ace pilot/i })[0]);
        expect(gameDataState.dismissRosterMergeSuggestionPairs).toHaveBeenCalledWith(['ace pilot::ace squad']);
    });

    it('keeps OCR merge suggestions lazy in details mode and supports large-roster search with virtualization', async () => {
        const mergeSuggestionsSpy = vi.mocked(buildRosterMergeSuggestionGroups);
        gameDataState.pilotRegistry = Array.from({ length: 450 }, (_, index) => `Pilot ${String(index).padStart(3, '0')}`);
        gameDataState.playerProfiles = {};

        render(<PlayerHub />);

        expect(mergeSuggestionsSpy).not.toHaveBeenCalled();

        fireEvent.change(screen.getByPlaceholderText(/search players/i), {
            target: { value: 'Pilot 399' },
        });

        expect(await screen.findByRole('button', { name: /pilot 399/i })).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: /^ocr work$/i })[0]);

        expect(mergeSuggestionsSpy).toHaveBeenCalled();
    });
});
