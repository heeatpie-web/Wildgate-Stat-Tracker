import type { ArtifactFile } from './artifactService';

export type ArtifactScreenshotType = 'crew_hub' | 'tactical_map' | 'result';
export type ArtifactScreenshotBucket = ArtifactScreenshotType | 'other';

export const ARTIFACT_SCREENSHOT_BUCKET_ORDER: ArtifactScreenshotBucket[] = [
  'crew_hub',
  'tactical_map',
  'result',
  'other',
];

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
