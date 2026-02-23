import type { ExtractedPlayer } from './ocrTypes';

const OCR_DIGIT_FOLD_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

function normalizePlayerName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function foldLikelyOcrDigits(name: string): string {
  return name.replace(/[013456789]/g, (digit) => OCR_DIGIT_FOLD_MAP[digit] || digit);
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index++;
  }
  return index;
}

function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[a.length - 1 - index] === b[b.length - 1 - index]) {
    index++;
  }
  return index;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function playerDisplayScore(name: string): number {
  const trimmed = String(name || '').trim();
  if (!trimmed) return Number.NEGATIVE_INFINITY;

  const compact = trimmed.replace(/[^a-z0-9]/gi, '');
  const letters = (compact.match(/[a-z]/gi) || []).length;
  const digits = (compact.match(/[0-9]/g) || []).length;
  const symbols = (trimmed.match(/[^a-z0-9 _-]/gi) || []).length;

  return (letters * 2) - (digits * 2) - symbols;
}

function choosePreferredPlayerName(a: string, b: string): string {
  const aTrimmed = String(a || '').trim();
  const bTrimmed = String(b || '').trim();
  if (!aTrimmed) return bTrimmed;
  if (!bTrimmed) return aTrimmed;

  const scoreA = playerDisplayScore(aTrimmed);
  const scoreB = playerDisplayScore(bTrimmed);
  if (scoreA !== scoreB) return scoreA > scoreB ? aTrimmed : bTrimmed;

  const normalizedA = normalizePlayerName(aTrimmed);
  const normalizedB = normalizePlayerName(bTrimmed);
  if (normalizedA.length !== normalizedB.length) {
    return normalizedA.length > normalizedB.length ? aTrimmed : bTrimmed;
  }

  return aTrimmed;
}

export function playerNameMatchScore(nameA: string, nameB: string): number {
  const strictA = normalizePlayerName(nameA);
  const strictB = normalizePlayerName(nameB);
  if (!strictA || !strictB) return 0;
  if (strictA === strictB) return 300;

  const trailingDigitsA = strictA.match(/[0-9]+$/)?.[0] || '';
  const trailingDigitsB = strictB.match(/[0-9]+$/)?.[0] || '';
  // Preserve distinct numeric roster tags (e.g. Enemy1 vs Enemy2).
  if (trailingDigitsA && trailingDigitsB && trailingDigitsA !== trailingDigitsB) {
    return 0;
  }

  const foldedA = foldLikelyOcrDigits(strictA);
  const foldedB = foldLikelyOcrDigits(strictB);
  const minLength = Math.min(foldedA.length, foldedB.length);
  const maxLength = Math.max(foldedA.length, foldedB.length);

  if (foldedA === foldedB) {
    return minLength >= 5 ? 260 : 0;
  }

  if (minLength < 6 || maxLength - minLength > 1) return 0;

  const prefix = commonPrefixLength(foldedA, foldedB);
  const suffix = commonSuffixLength(foldedA, foldedB);
  const distance = levenshteinDistance(foldedA, foldedB);
  const nearFullSegmentThreshold = Math.max(3, minLength - 1);
  const isNearFullPrefix = prefix >= nearFullSegmentThreshold;
  const isNearFullSuffix = suffix >= nearFullSegmentThreshold;

  if (distance === 1 && (isNearFullPrefix || isNearFullSuffix)) {
    return 190;
  }

  if (prefix < 5 || suffix < 2) return 0;

  if (distance === 1) return 200;
  if (distance === 2 && minLength >= 8 && prefix >= 6 && suffix >= 2) return 180;

  return 0;
}

export function areLikelySamePlayerName(nameA: string, nameB: string): boolean {
  return playerNameMatchScore(nameA, nameB) > 0;
}

export function mergeLikelySamePlayers(existing: ExtractedPlayer, incoming: ExtractedPlayer): ExtractedPlayer {
  const preferredByConfidence = incoming.confidence > existing.confidence ? incoming : existing;
  const alternate = preferredByConfidence === existing ? incoming : existing;

  const merged: ExtractedPlayer = {
    ...preferredByConfidence,
    confidence: Math.max(existing.confidence, incoming.confidence),
    name: choosePreferredPlayerName(existing.name, incoming.name),
  };

  if ((!merged.teamColor || merged.teamColor === 'unknown') && alternate.teamColor) {
    merged.teamColor = alternate.teamColor;
  }
  if (merged.isTeammate === undefined && alternate.isTeammate !== undefined) {
    merged.isTeammate = alternate.isTeammate;
  }

  return merged;
}

export function findBestPlayerMatchIndex(existingPlayers: ExtractedPlayer[], candidate: ExtractedPlayer): number {
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < existingPlayers.length; i++) {
    const score = playerNameMatchScore(existingPlayers[i].name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function deduplicatePlayersByLikelyName(players: ExtractedPlayer[]): ExtractedPlayer[] {
  const deduplicated: ExtractedPlayer[] = [];

  for (const player of players) {
    const existingIndex = findBestPlayerMatchIndex(deduplicated, player);
    if (existingIndex < 0) {
      deduplicated.push(player);
      continue;
    }

    deduplicated[existingIndex] = mergeLikelySamePlayers(deduplicated[existingIndex], player);
  }

  return deduplicated;
}
