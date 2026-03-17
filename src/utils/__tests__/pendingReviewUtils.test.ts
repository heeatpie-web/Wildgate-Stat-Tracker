import { describe, expect, it } from 'vitest';
import type { PendingReview } from '../../store/slices/createDataSlice';
import {
    getAutoPrunablePendingReviewIds,
    getRosterCandidatePruneIdsForAcceptedName,
    shouldQueueCanonicalRosterCandidate,
} from '../pendingReviewUtils';

describe('getRosterCandidatePruneIdsForAcceptedName', () => {
    it('prunes exact and canonical roster-candidate matches for an accepted OCR name', () => {
        const pendingReviews: PendingReview[] = [
            {
                id: 'exact',
                type: 'roster_candidate',
                value: 'Bigtower',
                originalConfidence: 88,
                canonicalTargetKey: 'bigtower',
            },
            {
                id: 'canonical',
                type: 'roster_candidate',
                value: 'Big tower',
                originalConfidence: 77,
                canonicalTargetKey: 'bigtower',
            },
            {
                id: 'other',
                type: 'roster_candidate',
                value: 'Another Pilot',
                originalConfidence: 70,
                canonicalTargetKey: 'anotherpilot',
            },
        ];

        expect(getRosterCandidatePruneIdsForAcceptedName({
            pendingReviews,
            acceptedName: 'Bigtower',
        })).toEqual(['exact', 'canonical']);
    });

    it('ignores blank accepted names', () => {
        expect(getRosterCandidatePruneIdsForAcceptedName({
            pendingReviews: [],
            acceptedName: '   ',
        })).toEqual([]);
    });

    it('auto-prunes exact roster matches and OCR noise while keeping unresolved merge suggestions', () => {
        const pendingReviews: PendingReview[] = [
            {
                id: 'exact',
                type: 'player_name',
                value: 'PilotOne',
                originalConfidence: 66,
            },
            {
                id: 'noise',
                type: 'player_name',
                value: 'GPU: RTX 3080',
                originalConfidence: 61,
            },
            {
                id: 'merge',
                type: 'roster_candidate',
                value: 'PliotOne',
                originalConfidence: 83,
                canonicalTargetKey: 'pilotone',
            },
        ];

        expect(getAutoPrunablePendingReviewIds({
            pendingReviews,
            pilotRegistry: ['PilotOne'],
        })).toEqual(['exact', 'noise']);
    });

    it('refuses to queue OCR noise as a roster candidate', () => {
        expect(shouldQueueCanonicalRosterCandidate({
            rawName: 'GPU: RTX 3080',
            pendingReviews: [],
            pilotRegistry: [],
        })).toBe(false);
    });
});
