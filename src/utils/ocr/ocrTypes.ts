/**
 * OCR Type Definitions
 * Core interfaces for the OCR extraction system
 */

export type ScreenshotType = 'crew_hub' | 'tactical_map' | 'unknown';

export type TeamColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'cyan' | 'purple' | 'unknown';

/**
 * Represents an extracted player with confidence score
 */
export interface ExtractedPlayer {
  name: string;
  confidence: number;
  teamColor?: TeamColor;
  isTeammate?: boolean;
}

/**
 * Represents an opponent team extracted from Crew Hub
 */
export interface ExtractedOpponentTeam {
  teamName: string;
  shipType: string;
  color: TeamColor;
  players: ExtractedPlayer[];
  confidence: number;
}

/**
 * Represents an extracted reach modifier
 */
export interface ExtractedModifier {
  name: string;
  confidence: number;
  rawText: string;
}

/**
 * Represents player ship info
 */
export interface ExtractedShip {
  shipType: string;
  teamName?: string;
  confidence: number;
}

/**
 * Complete extracted data from OCR processing
 */
export interface OCRExtractedData {
  screenshotType: ScreenshotType;

  // From Tactical Map
  playerShip?: ExtractedShip;
  playerTeamName?: string;
  playerShipName?: string;
  reachModifiers: ExtractedModifier[];
  enemyShips: Array<{ teamName: string; shipType: string; color: TeamColor }>;
  hazards?: string[];

  // From Crew Hub
  teammates: ExtractedPlayer[];
  opponentTeams: ExtractedOpponentTeam[];

  // Game-specific
  artifactType?: string;

  // Metadata
  overallConfidence: number;
  captureTimestamp: number;
  rawText?: string;
  imagePreview?: string;

  // Cloud OCR metadata
  cloudContributed?: boolean;
  ocrSource?: 'local' | 'cloud' | 'merged';
  ocrFallbackReason?: string;
  ocrCloudError?: string;
  ocrGeminiError?: string;
  analysisPathsUsed?: string[];
  consensusScore?: number;
  providerUsed?: 'vertex' | 'gemini' | null;
  mergeStats?: {
    total: number;
    agreed: number;
    cloudPreferred: number;
    cloudPreferredCJK: number;
    localOnly: number;
    cloudOnly: number;
    conflicts: number;
  };
  ocrBoundingBoxes?: {
    source: 'local' | 'cloud';
    imageWidth: number;
    imageHeight: number;
    words: OCRWord[];
  };
  fieldConfidence?: {
    teammateNames: number;
    opponentNames: number;
    ship: number;
    modifiers: number;
  };
  ocrRouting?: {
    attempted: boolean;
    applied: boolean;
    route: 'none' | 'names-only';
    preNameConfidence: number;
    postNameConfidence: number;
    latencyMs: number;
    fontProfile: 'default' | 'ealing-black-italic';
  };
  ocrCorpusSampleId?: string;
  isPartialCapture?: boolean;
}

/**
 * Result from window capture operation
 */
export interface CaptureResult {
  success: boolean;
  imageBase64?: string;
  error?: string;
  width?: number;
  height?: number;
}

/**
 * Result from OCR processing
 */
export interface OCRProcessResult {
  success: boolean;
  data?: OCRExtractedData;
  error?: string;
}

/**
 * Options for OCR processing
 */
export interface OCRProcessOptions {
  /** Target screenshot type if known */
  targetType?: ScreenshotType;
  /** Enable debug output */
  debug?: boolean;
  /** Language hint for OCR */
  language?: string;
}

/**
 * Word bounding box from OCR
 */
export interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * Line of text from OCR
 */
export interface OCRLine {
  text: string;
  words: OCRWord[];
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}
