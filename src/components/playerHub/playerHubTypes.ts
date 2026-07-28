import type { RosterEntryMeta } from '../../store/slices/createDataSlice';
import type { Match } from '../../types';

export type SortMode = 'alpha' | 'favorites' | 'recent' | 'encounters';
export type PlayerFilterMode = 'active' | 'all' | 'roster' | 'tracked-only' | 'needs-review' | 'archived';
export type PlayerHubMode = 'roster' | 'ocr-work' | 'merges';

export interface PlayerDetail {
    name: string;
    isFavorite: boolean;
    isRoster: boolean;
    isTrackedOnly: boolean;
    /** Manual archive override for tracked-only pilots (see archivedTrackedPilotKeys). */
    isManuallyArchived: boolean;
    isDetected: boolean;
    needsReview: boolean;
    rosterMeta: RosterEntryMeta | null;
    note: string;
    asTeammate: { wins: number; total: number } | null;
    asOpponent: { wins: number; total: number } | null;
    totalEncounters: number;
    encounterMatchIds: number[];
    roleConflictMatchIds: number[];
    firstSeen: number | null;
    lastSeen: number | null;
    shipsObserved: Record<string, number>;
    teamsObserved: Record<string, number>;
    ocrSightings: number;
    manualSightings: number;
    lastOcrConfidence: number | null;
    profileIds: string[];
}

export interface EncounterSnapshot {
    totalEncounters: number;
    encounterMatchIds: number[];
    roleConflictMatchIds: number[];
    firstSeen: number | null;
    lastSeen: number | null;
    asTeammate: { wins: number; total: number } | null;
    asOpponent: { wins: number; total: number } | null;
}

export interface AliasInsight {
    label: string;
    count?: number;
    source: 'manual' | 'learned';
}

export interface DuplicateCandidate {
    name: string;
    score: number;
    similarity: number;
    reasons: string[];
    totalEncounters: number;
}

export interface EncounterMatchListItem {
    id: number;
    label: string;
    displayTimestamp: string;
    relativeTimestamp: string;
    roleLabel: string;
    result: Match['result'];
    shipLabel: string;
    timestamp: number;
}

export interface RoleConflictWorkbenchItem {
    key: string;
    playerName: string;
    matchId: number;
    displayTimestamp: string;
    relativeTimestamp: string;
    shipLabel: string;
    result: Match['result'];
}
