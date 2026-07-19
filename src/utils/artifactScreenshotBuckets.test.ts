import { describe, expect, it } from 'vitest';

import type { ArtifactFile } from './artifactService';
import { buildRerunOcrCallGroups, classifyArtifactScreenshotBucket, normalizeArtifactScreenshotType } from './artifactScreenshotBuckets';

describe('artifactScreenshotBuckets', () => {
    it('normalizes persisted screenshot types and OCR aliases', () => {
        expect(normalizeArtifactScreenshotType('crew_hub')).toBe('crew_hub');
        expect(normalizeArtifactScreenshotType('crewhub')).toBe('crew_hub');
        expect(normalizeArtifactScreenshotType('map')).toBe('tactical_map');
        expect(normalizeArtifactScreenshotType('map_screen')).toBe('tactical_map');
        expect(normalizeArtifactScreenshotType('result')).toBe('result');
        expect(normalizeArtifactScreenshotType('')).toBeNull();
    });

    it('prefers explicit artifact metadata before falling back to filename prefixes', () => {
        expect(classifyArtifactScreenshotBucket('C:\\captures\\capture_crew_hub_1.png', {
            filename: 'capture_crew_hub_1.png',
            captureSource: 'ocr-macro',
            screenshotType: 'crew_hub',
        } as Pick<ArtifactFile, 'filename' | 'captureSource' | 'screenshotType'>)).toBe('crew_hub');

        expect(classifyArtifactScreenshotBucket('C:\\captures\\capture_map_1.png', {
            filename: 'capture_map_1.png',
            captureSource: 'ocr-macro',
            screenshotType: 'tactical_map',
        } as Pick<ArtifactFile, 'filename' | 'captureSource' | 'screenshotType'>)).toBe('tactical_map');

        expect(classifyArtifactScreenshotBucket('C:\\captures\\capture_result_1.png', {
            filename: 'capture_result_1.png',
            captureSource: 'result-macro',
            screenshotType: 'result',
        } as Pick<ArtifactFile, 'filename' | 'captureSource' | 'screenshotType'>)).toBe('result');
    });

    it('falls back to other when a screenshot has no persisted classification', () => {
        expect(classifyArtifactScreenshotBucket('C:\\captures\\capture_ocr_1.png')).toBe('other');
        expect(classifyArtifactScreenshotBucket('C:\\captures\\random.png')).toBe('other');
    });

    it('combines crew_hub and tactical_map into one primary rerun call group', () => {
        const groups = buildRerunOcrCallGroups({
            crew_hub: ['C:\\captures\\capture_crew_hub_1.png', 'C:\\captures\\capture_crew_hub_2.png'],
            tactical_map: ['C:\\captures\\capture_map_1.png'],
            result: ['C:\\captures\\capture_result_1.png'],
            other: [],
        });

        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({ id: 'intel', isPrimary: true });
        // crew_hub paths lead so the server-side merge seeds from the roster capture
        expect(groups[0].paths).toEqual([
            'C:\\captures\\capture_crew_hub_1.png',
            'C:\\captures\\capture_crew_hub_2.png',
            'C:\\captures\\capture_map_1.png',
        ]);
        expect(groups[1]).toMatchObject({ id: 'result', isPrimary: false });
    });

    it('omits empty rerun call groups', () => {
        const groups = buildRerunOcrCallGroups({
            crew_hub: [],
            tactical_map: [],
            result: [],
            other: ['C:\\captures\\random.png'],
        });
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ id: 'other', isPrimary: false });
    });
});
