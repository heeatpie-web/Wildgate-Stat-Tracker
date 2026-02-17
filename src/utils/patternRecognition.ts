import type { Match } from '../types';

export interface CooccurrencePattern {
  playerA: string;
  playerB: string;
  encounters: number;
  winRate: number;
  confidence: number;
  lastSeen: number;
}

export interface TeamSuggestion {
  player: string;
  likelihood: number;
  reason: string;
  encounters: number;
  winRate: number;
  supportingPlayers: string[];
}

interface BuildMatrixOptions {
  maxMatches?: number;
  halfLifeDays?: number;
  referenceTimestamp?: number;
}

interface SuggestionOptions {
  maxSuggestions?: number;
  minLikelihood?: number;
}

interface PairAccumulator {
  playerA: string;
  playerB: string;
  weightedEncounters: number;
  weightedWins: number;
  rawEncounters: number;
  lastSeen: number;
}

const DEFAULT_MAX_MATCHES = 1000;
const DEFAULT_HALF_LIFE_DAYS = 45;

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const normalizeName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized;
};

const normalizeTeamPlayers = (match: Match): string[] => {
  const roster = [match.player, ...(Array.isArray(match.teammates) ? match.teammates : [])];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of roster) {
    const name = normalizeName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }

  return normalized;
};

const pairKey = (a: string, b: string): string => {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  return lowerA < lowerB ? `${lowerA}||${lowerB}` : `${lowerB}||${lowerA}`;
};

const recencyWeight = (timestamp: number, referenceTimestamp: number, halfLifeDays: number): number => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 1;
  const ageMs = Math.max(0, referenceTimestamp - timestamp);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const safeHalfLife = Math.max(1, halfLifeDays);
  return Math.exp(-ageDays / safeHalfLife);
};

const computeConfidence = (weightedEncounters: number, winRate: number): number => {
  const frequencyScore = clamp((weightedEncounters / 6) * 100, 0, 100);
  const confidence = (frequencyScore * 0.7) + (winRate * 0.3);
  return Math.round(clamp(confidence, 0, 100));
};

export const buildCooccurrenceMatrix = (
  matches: Match[],
  options: BuildMatrixOptions = {}
): Map<string, CooccurrencePattern[]> => {
  const matrix = new Map<string, CooccurrencePattern[]>();
  if (!Array.isArray(matches) || matches.length === 0) return matrix;

  const maxMatches = Math.max(1, Number(options.maxMatches) || DEFAULT_MAX_MATCHES);
  const halfLifeDays = Math.max(1, Number(options.halfLifeDays) || DEFAULT_HALF_LIFE_DAYS);
  const referenceTimestamp = Number(options.referenceTimestamp) || Date.now();
  const pairStats = new Map<string, PairAccumulator>();
  const recentMatches = matches.slice(-maxMatches);

  for (const match of recentMatches) {
    if (!match) continue;
    const teamPlayers = normalizeTeamPlayers(match);
    if (teamPlayers.length < 2) continue;

    const weight = recencyWeight(Number(match.timestamp || 0), referenceTimestamp, halfLifeDays);
    const didWin = match.result === 'Win';

    for (let i = 0; i < teamPlayers.length; i += 1) {
      for (let j = i + 1; j < teamPlayers.length; j += 1) {
        const a = teamPlayers[i];
        const b = teamPlayers[j];
        const key = pairKey(a, b);
        const existing = pairStats.get(key) || {
          playerA: a,
          playerB: b,
          weightedEncounters: 0,
          weightedWins: 0,
          rawEncounters: 0,
          lastSeen: 0,
        };

        existing.weightedEncounters += weight;
        if (didWin) existing.weightedWins += weight;
        existing.rawEncounters += 1;
        existing.lastSeen = Math.max(existing.lastSeen, Number(match.timestamp) || 0);
        pairStats.set(key, existing);
      }
    }
  }

  for (const pair of pairStats.values()) {
    const winRate = pair.weightedEncounters > 0
      ? clamp((pair.weightedWins / pair.weightedEncounters) * 100, 0, 100)
      : 0;
    const confidence = computeConfidence(pair.weightedEncounters, winRate);

    const forward: CooccurrencePattern = {
      playerA: pair.playerA,
      playerB: pair.playerB,
      encounters: pair.rawEncounters,
      winRate: Math.round(winRate),
      confidence,
      lastSeen: pair.lastSeen,
    };
    const reverse: CooccurrencePattern = {
      ...forward,
      playerA: pair.playerB,
      playerB: pair.playerA,
    };

    const aKey = pair.playerA.toLowerCase();
    const bKey = pair.playerB.toLowerCase();
    matrix.set(aKey, [...(matrix.get(aKey) || []), forward]);
    matrix.set(bKey, [...(matrix.get(bKey) || []), reverse]);
  }

  for (const [key, patterns] of matrix.entries()) {
    patterns.sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      if (right.encounters !== left.encounters) return right.encounters - left.encounters;
      return right.lastSeen - left.lastSeen;
    });
    matrix.set(key, patterns);
  }

  return matrix;
};

export const getTeammateSuggestions = (
  detectedPlayers: string[],
  cooccurrenceMatrix: Map<string, CooccurrencePattern[]>,
  options: SuggestionOptions = {}
): TeamSuggestion[] => {
  if (!Array.isArray(detectedPlayers) || detectedPlayers.length === 0) return [];
  if (!(cooccurrenceMatrix instanceof Map) || cooccurrenceMatrix.size === 0) return [];

  const maxSuggestions = Math.max(1, Number(options.maxSuggestions) || 5);
  const minLikelihood = clamp(Number(options.minLikelihood) || 0, 0, 100);
  const normalizedDetected = Array.from(new Set(
    detectedPlayers
      .map(name => normalizeName(name))
      .filter((name): name is string => Boolean(name))
      .map(name => name.toLowerCase())
  ));
  if (normalizedDetected.length === 0) return [];

  const suggestionMap = new Map<string, {
    score: number;
    encounters: number;
    weightedWinRateNumerator: number;
    weightedWinRateDenominator: number;
    supporters: Map<string, number>;
    displayName: string;
  }>();

  for (const detected of normalizedDetected) {
    const patterns = cooccurrenceMatrix.get(detected) || [];
    for (const pattern of patterns) {
      const teammate = normalizeName(pattern.playerB);
      if (!teammate) continue;
      const teammateKey = teammate.toLowerCase();
      if (normalizedDetected.includes(teammateKey)) continue;

      const existing = suggestionMap.get(teammateKey) || {
        score: 0,
        encounters: 0,
        weightedWinRateNumerator: 0,
        weightedWinRateDenominator: 0,
        supporters: new Map<string, number>(),
        displayName: teammate,
      };

      const contribution = pattern.confidence * Math.max(0.5, Math.min(1.5, pattern.encounters / 3));
      existing.score += contribution;
      existing.encounters += pattern.encounters;
      existing.weightedWinRateNumerator += pattern.winRate * pattern.encounters;
      existing.weightedWinRateDenominator += pattern.encounters;
      existing.supporters.set(detected, (existing.supporters.get(detected) || 0) + pattern.encounters);
      suggestionMap.set(teammateKey, existing);
    }
  }

  if (suggestionMap.size === 0) return [];
  const maxScore = Math.max(...Array.from(suggestionMap.values()).map(entry => entry.score));
  if (!Number.isFinite(maxScore) || maxScore <= 0) return [];

  const suggestions: TeamSuggestion[] = [];
  for (const [_, entry] of suggestionMap.entries()) {
    const likelihood = Math.round(clamp((entry.score / maxScore) * 100, 0, 100));
    if (likelihood < minLikelihood) continue;

    const supporterDetails = Array.from(entry.supporters.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2)
      .map(([name, count]) => `${name} (${count})`);
    const winRate = entry.weightedWinRateDenominator > 0
      ? Math.round(entry.weightedWinRateNumerator / entry.weightedWinRateDenominator)
      : 0;

    suggestions.push({
      player: entry.displayName,
      likelihood,
      reason: supporterDetails.length > 0
        ? `Seen with ${supporterDetails.join(', ')}`
        : 'Frequent teammate pattern',
      encounters: entry.encounters,
      winRate,
      supportingPlayers: Array.from(entry.supporters.keys()),
    });
  }

  suggestions.sort((left, right) => {
    if (right.likelihood !== left.likelihood) return right.likelihood - left.likelihood;
    if (right.encounters !== left.encounters) return right.encounters - left.encounters;
    return right.winRate - left.winRate;
  });

  return suggestions.slice(0, maxSuggestions);
};

export const getTopCooccurrencePairs = (
  matrix: Map<string, CooccurrencePattern[]>,
  maxPairs = 5
): CooccurrencePattern[] => {
  if (!(matrix instanceof Map) || matrix.size === 0) return [];
  const deduped = new Map<string, CooccurrencePattern>();

  for (const patterns of matrix.values()) {
    for (const pattern of patterns) {
      const key = pairKey(pattern.playerA, pattern.playerB);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, pattern);
        continue;
      }

      if (pattern.confidence > existing.confidence
        || (pattern.confidence === existing.confidence && pattern.encounters > existing.encounters)) {
        deduped.set(key, pattern);
      }
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      if (right.encounters !== left.encounters) return right.encounters - left.encounters;
      return right.lastSeen - left.lastSeen;
    })
    .slice(0, Math.max(1, maxPairs));
};
