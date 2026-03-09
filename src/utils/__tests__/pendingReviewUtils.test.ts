import { describe, expect, it } from 'vitest';
import type { PendingReview } from '../../store/slices/createDataSlice';
import { getRosterCandidatePruneIdsForAcceptedName } from '../pendingReviewUtils';

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
});
