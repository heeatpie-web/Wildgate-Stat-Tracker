import type { ArtifactFile } from './artifactService';

export type ArtifactScreenshotType = 'crew_hub' | 'tactical_map' | 'result';
export type ArtifactScreenshotBucket = ArtifactScreenshotType | 'other';

export const ARTIFACT_SCREENSHOT_BUCKET_ORDER: ArtifactScreenshotBucket[] = [
  'crew_hub',
  'tactical_map',
  'result',
  'other',
];

export interface RerunOcrCallGroup {
  id: 'intel' | 'result' | 'other';
  /** The group whose merged OCR data should win over other groups. */
  isPrimary: boolean;
  paths: string[];
}

/**
 * Group bucketed screenshot paths into rerun-ocr-multi calls. crew_hub and
 * tactical_map screenshots must share ONE call: the server-side ocrMerger
 * cross-enriches crew-hub player rosters with tactical-map ship/team data, and
 * issuing them as separate calls leaves whichever ran last as the only
 * surviving result (dropping players or ships). crew_hub paths come first so
 * the server-side accumulator seeds from the roster-bearing capture.
 */
export const buildRerunOcrCallGroups = (
  bucketed: Record<ArtifactScreenshotBucket, string[]>
): RerunOcrCallGroup[] => [
  {
    id: 'intel' as const,
    isPrimary: true,
    paths: [...(bucketed.crew_hub || []), ...(bucketed.tactical_map || [])],
  },
  { id: 'result' as const, isPrimary: false, paths: [...(bucketed.result || [])] },
  { id: 'other' as const, isPrimary: false, paths: [...(bucketed.other || [])] },
].filter((group) => group.paths.length > 0);

export const normalizeArtifactScreenshotType = (
  value: unknown
): ArtifactScreenshotType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'crew_hub' || normalized === 'crewhub') return 'crew_hub';
  if (
    normalized === 'tactical_map'
    || normalized === 'tacticalmap'
    || normalized === 'map'
    || normalized === 'map_screen'
    || normalized === 'mapscreen'
  ) {
    return 'tactical_map';
  }
  if (normalized === 'result') return 'result';
  return null;
};

export const classifyArtifactScreenshotBucket = (
  imagePath: string,
  artifactFile?: Pick<ArtifactFile, 'filename' | 'captureSource' | 'screenshotType'> | null
): ArtifactScreenshotBucket => {
  const explicitType = normalizeArtifactScreenshotType(artifactFile?.screenshotType);
  if (explicitType) return explicitType;

  const explicitSource = String(artifactFile?.captureSource || '').trim().toLowerCase();
  if (explicitSource === 'result-macro') return 'result';

  const filename = String(artifactFile?.filename || imagePath || '')
    .split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    || '';

  if (filename.startsWith('capture_result_')) return 'result';
  if (filename.startsWith('capture_crew_hub_')) return 'crew_hub';
  if (filename.startsWith('capture_map_') || filename.startsWith('capture_tactical_map_')) {
    return 'tactical_map';
  }

  return 'other';
};
