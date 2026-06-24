import type { Match } from '../types';
import type { VideoImportMatch } from '../store/slices/createVideoImportSlice';

/**
 * Maps a VideoImportMatch (from the Electron video processor) into a Partial<Match>
 * suitable for pre-populating the Wizard.
 */
export function buildPartialMatchFromVideoImportMatch(
  vim: VideoImportMatch,
  activeUser: string,
): Partial<Match> {
  const ocr = vim.ocrData as Record<string, unknown> | null;
  const resultData = vim.resultData;

  const teammates: string[] = [];
  const opponents: string[] = [];
  let ship: string = '';
  let reachModifiers: string[] = [];
  let opponentTeams: Match['opponentTeams'] = [];

  if (ocr) {
    // Extract teammates from OCR data
    const rawTeammates = ocr.teammates as Array<{ name?: string; confidence?: number }> | undefined;
    if (Array.isArray(rawTeammates)) {
      for (const t of rawTeammates) {
        if (t?.name && t.name !== activeUser) teammates.push(t.name);
      }
    }

    // Extract opponents from opponent teams
    const rawOpponentTeams = ocr.opponentTeams as Array<{
      players?: Array<{ name?: string }>;
      shipType?: string;
      teamColor?: string;
    }> | undefined;
    if (Array.isArray(rawOpponentTeams)) {
      opponentTeams = rawOpponentTeams.map((team) => ({
        teamName: '',
        players: (team.players || []).map((p) => p?.name || '').filter(Boolean),
        shipType: team.shipType || '',
        color: team.teamColor || '',
      })) as Match['opponentTeams'];
      for (const team of rawOpponentTeams) {
        for (const p of team.players || []) {
          if (p?.name) opponents.push(p.name);
        }
      }
    }

    // Extract player ship
    const playerShip = ocr.playerShip as { shipType?: string } | undefined;
    ship = playerShip?.shipType || '';

    // Extract reach modifiers
    const rawMods = ocr.reachModifiers as Array<{ name?: string; rawText?: string }> | undefined;
    if (Array.isArray(rawMods)) {
      reachModifiers = rawMods.map((m) => m?.name || m?.rawText || '').filter(Boolean);
    }
  }

  const partial: Partial<Match> = {
    id: Date.now(),
    timestamp: Date.now(),
    player: activeUser,
    date: new Date().toISOString(),
    teammates,
    opponents,
    opponentTeams,
    ship,
    reachModifiers,
    kills: {},
    ocrState: 'reviewing',
    isBackfill: true,
  };

  if (resultData) {
    if (resultData.result === 'Win' || resultData.result === 'Loss' || resultData.result === 'Draw') {
      partial.result = resultData.result;
    }
    if (resultData.winType === 'combat') {
      partial.subType = 'Combat';
    } else if (resultData.winType === 'artifact') {
      partial.subType = 'Artifact';
    }
    if (resultData.placement != null) {
      partial.placement = resultData.placement;
    }
    if (resultData.damageTaken != null) {
      partial.damageTaken = resultData.damageTaken;
    }
  }

  return partial;
}
