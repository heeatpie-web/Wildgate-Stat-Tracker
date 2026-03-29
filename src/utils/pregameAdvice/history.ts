import type { Match } from '../../types';

export const isPregameAdviceHistoryMatch = (match: Match | null | undefined): match is Match => {
  if (!match) return false;
  if (match.result === 'Ongoing') return false;
  if (match.isPracticeRange) return false;
  if (match.subType === 'Telemetry Draft') return false;
  if (match.telemetryDraftState === 'active') return false;
  return true;
};

export const getPregameAdviceHistoryPool = (
  mode: string,
  allMatches: Match[] = []
): Match[] => (
  (allMatches || []).filter((match) => isPregameAdviceHistoryMatch(match) && match.mode === mode)
);
