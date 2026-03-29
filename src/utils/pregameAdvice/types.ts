/**
 * @module pregameAdvice/types
 * Public interface types for the pregame advice engine.
 * The engine is a pure function; these types are the engine/UI boundary.
 */

/** Confidence level based on sample size. < 3 samples → factor omitted entirely. */
export type PregameAdviceConfidence = 'low' | 'medium' | 'high';

export type PregameAdviceFactorKind =
  | 'teammate-synergy'
  | 'opponent-pressure'
  | 'hazard-fit'
  | 'ship-performance'
  | 'artifact-objective'
  | 'poi-plan';

export type PregameAdviceDirection = 'positive' | 'negative' | 'neutral';

/** A single scored factor contributing to the overall win-rate estimate. */
export interface PregameAdviceFactor {
  /** Category of this factor. */
  kind: PregameAdviceFactorKind;
  /** Short human-readable label (e.g. "Teammate Synergy"). */
  label: string;
  /** Whether this factor helps, hurts, or is neutral relative to baseline. */
  direction: PregameAdviceDirection;
  /** Win-rate delta vs baseline, e.g. +0.08 = +8 percentage points. */
  delta: number;
  /** Confidence based on sample size. */
  confidence: PregameAdviceConfidence;
  /** Number of historical matches driving this factor's estimate. */
  sampleSize: number;
  /** Plain-language copy line with tone softened at low confidence. */
  copy: string;
}

/** Full result produced by the pregame advice engine. */
export interface PregameAdviceResult {
  /** Blended win-rate estimate clamped to [0.10, 0.90]. */
  overallWinRate: number;
  /** Aggregate confidence across all active factors. */
  confidence: PregameAdviceConfidence;
  /** Number of same-mode completed matches in the historical pool. */
  sampleSize: number;
  /** Matches in the filtered POI pool (artifact-brawl + custom-lobby only). */
  filteredPoolSize: number;
  /** Short headline, e.g. "~68% estimated win rate". */
  headline: string;
  /** Up to 5 active factors sorted by magnitude. */
  factors: PregameAdviceFactor[];
  /** Prioritized plain-language action items (top target, POI plan). */
  topActions: string[];
  /** False when history is too sparse to produce actionable advice. */
  hasUsableData: boolean;
}

/** Persisted per-match snapshot of the pregame advice shown before the match. */
export interface PregameAdviceSnapshot extends PregameAdviceResult {
  /** Timestamp when this advice snapshot was last recalculated for the match. */
  updatedAt: number;
}

/** Opponent team from current lobby OCR. */
export interface PregameAdviceOpponentTeam {
  teamName: string;
  shipType: string;
  players: string[];
}

/** Input context for the advice engine derived from the active telemetry draft. */
export interface PregameAdviceContext {
  /** Current game mode (e.g. "Artifact Brawl"). */
  mode: string;
  /** Teammate display names from lobby OCR. */
  teammates: string[];
  /** Enemy teams from lobby OCR. */
  opponentTeams: PregameAdviceOpponentTeam[];
  /** Active reach modifiers / hazards. */
  reachModifiers: string[];
  /** Artifact source from OCR (e.g. "Alien Gate"). */
  artifactSource?: string;
  /** ID of the active telemetry draft match. */
  draftMatchId: number;
}
