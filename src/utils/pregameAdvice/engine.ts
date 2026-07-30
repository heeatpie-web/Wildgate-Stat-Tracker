/**
 * @module pregameAdvice/engine
 * Pure recommendation engine for the pregame advice panel.
 *
 * Takes a PregameAdviceContext (derived from the active telemetry draft) and
 * an array of historical Match records, and returns a PregameAdviceResult.
 *
 * No side effects. Safe to call on every re-render; memoize at call-site.
 */
import type { Match } from '../../types';
import { normalizeShipName } from '../../types';
import type {
  PregameAdviceContext,
  PregameAdviceFactor,
  PregameAdviceFactorKind,
  PregameAdviceConfidence,
  PregameAdviceDirection,
  PregameAdviceResult,
} from './types';
import { getPregameAdviceHistoryPool } from './history';

// ─── Constants ─────────────────────────────────────────────────────────────

const MIN_BASELINE_MATCHES = 3;

/** Factor weights. Teammate synergy and opponent pressure dominate. */
const FACTOR_WEIGHTS: Record<PregameAdviceFactorKind, number> = {
  'teammate-synergy': 0.35,
  'opponent-pressure': 0.35,
  'hazard-fit': 0.15,
  'ship-performance': 0.10,
  'artifact-objective': 0.025,
  'poi-plan': 0.025,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const normName = (s: string): string => String(s || '').trim().toLowerCase();

/**
 * Add-1 Laplace smoothed win rate to keep estimates away from 0% / 100%
 * at small sample sizes.
 */
function smoothedWR(wins: number, total: number): number {
  return (wins + 1) / (total + 2);
}

/** Map sample count to confidence level, or null if below minimum threshold. */
function toConfidence(n: number): PregameAdviceConfidence | null {
  if (n < 3) return null;
  if (n < 8) return 'low';
  if (n < 20) return 'medium';
  return 'high';
}

function dirFromDelta(delta: number): PregameAdviceDirection {
  if (delta > 0.02) return 'positive';
  if (delta < -0.02) return 'negative';
  return 'neutral';
}

function poiTotal(m: Match): number {
  return (m.poiEasy || 0) + (m.poiMedium || 0) + (m.poiEpic || 0);
}

function poiBucket(total: number): '0–1' | '2–3' | '4+' {
  if (total <= 1) return '0–1';
  if (total <= 3) return '2–3';
  return '4+';
}

// ─── Copy generation ────────────────────────────────────────────────────────

function makeCopy(
  kind: PregameAdviceFactorKind,
  direction: PregameAdviceDirection,
  confidence: PregameAdviceConfidence,
  extra?: string
): string {
  const soft = confidence === 'low';
  switch (kind) {
    case 'teammate-synergy':
      if (soft) return direction === 'positive' ? `Synergy looks better with ${extra}` : `Watch out for friction with ${extra}`;
      return direction === 'positive' ? `Strong synergy with ${extra}` : `Low synergy with ${extra}`;
    case 'opponent-pressure':
      if (soft) return `Lean toward eliminating ${extra} early`;
      return `Best early target: ${extra}`;
    case 'hazard-fit':
      if (soft) return direction === 'positive' ? `Hazards lean in your favor` : `Watch out for the current hazard conditions`;
      return direction === 'positive' ? `Good time to push — hazards favor you` : `Usually underperforms in these conditions`;
    case 'ship-performance':
      if (soft) return direction === 'positive' ? `${extra || 'Your ship'} looks better here` : `${extra || 'Your ship'} can look weaker in this environment`;
      return direction === 'positive' ? `${extra || 'Ship'} usually excels here` : `${extra || 'Ship'} usually underperforms here`;
    case 'artifact-objective':
      if (soft) return direction === 'positive' ? `Objective lean is positive` : `Objective historically looks trickier`;
      return direction === 'positive' ? `Objective historically boosts win rate` : `Objective historically hurts win rate`;
    case 'poi-plan':
      if (soft) return `Lean toward ${extra || '2–3'} POIs this match`;
      return `${extra || '2–3'} POIs is historically your best band`;
    default:
      return '';
  }
}

// ─── Match filters ───────────────────────────────────────────────────────────

/** POI pool: artifact-brawl and custom-lobby modes only. */
function isPoiEligible(m: Match): boolean {
  const mode = String(m.mode || '').toLowerCase();
  const matchMode = String(m.matchMode || '').toLowerCase();
  return mode === 'artifact brawl' || matchMode === 'artifactsandgates' || matchMode === 'custom';
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export function computePregameAdvice(
  context: PregameAdviceContext,
  allMatches: Match[]
): PregameAdviceResult {
  const noData: PregameAdviceResult = {
    baselineWinRate: undefined,
    overallWinRate: 0.5,
    confidence: 'low',
    sampleSize: 0,
    filteredPoolSize: 0,
    headline: 'Not enough match history',
    factors: [],
    topActions: [],
    hasUsableData: false,
  };

  // ── History pool: same mode, completed, not practice range ──────────────
  const pool = getPregameAdviceHistoryPool(context.mode, allMatches || []);

  if (pool.length < MIN_BASELINE_MATCHES) return noData;

  const baselineWins = pool.filter((m) => m.result === 'Win').length;
  const baseline = smoothedWR(baselineWins, pool.length);

  const factors: PregameAdviceFactor[] = [];

  // ── Factor: Teammate Synergy ─────────────────────────────────────────────
  const teammates = (context.teammates || []).map(normName).filter(Boolean);

  if (teammates.length > 0) {
    const teammateSignals: Array<{ name: string; delta: number; n: number }> = [];
    let totalN = 0;

    for (const name of teammates) {
      const withThem = pool.filter((m) =>
        (m.teammates || []).some((t) => normName(t) === name)
      );
      const conf = toConfidence(withThem.length);
      if (!conf) continue;
      const wins = withThem.filter((m) => m.result === 'Win').length;
      teammateSignals.push({
        name,
        delta: smoothedWR(wins, withThem.length) - baseline,
        n: withThem.length,
      });
      totalN += withThem.length;
    }

    if (teammateSignals.length > 0) {
      const avgDelta = teammateSignals.reduce((sum, signal) => sum + signal.delta, 0) / teammateSignals.length;
      const conf = toConfidence(totalN);
      if (conf) {
        const dir = dirFromDelta(avgDelta);
        const topSignal = [...teammateSignals].sort((left, right) => (
          Math.abs(right.delta) - Math.abs(left.delta) || right.n - left.n
        ))[0];
        const topName = topSignal?.name || context.teammates[0] || 'your squad';
        factors.push({
          kind: 'teammate-synergy',
          label: 'Teammate Synergy',
          direction: dir,
          delta: avgDelta,
          confidence: conf,
          sampleSize: totalN,
          copy: makeCopy('teammate-synergy', dir, conf, topName),
        });
      }
    }
  }

  // ── Factor: Opponent Pressure ────────────────────────────────────────────
  type TeamPressure = { teamName: string; threatLabel: string; score: number; n: number };
  const teamPressures: TeamPressure[] = [];

  for (const team of context.opponentTeams || []) {
    const playerEntries = (team.players || [])
      .map((raw) => ({ raw: String(raw || '').trim(), key: normName(raw) }))
      .filter((entry) => entry.key);
    const ship = normName(team.shipType);

    // Per-player encounter win rates (our win rate when facing them)
    const playerWRs: Array<{ name: string; wr: number; n: number }> = [];
    for (const { raw, key } of playerEntries) {
      const vs = pool.filter(
        (m) =>
          (m.opponents || []).some((op) => normName(op) === key) ||
          (m.opponentTeams || []).some((ot) =>
            ot.players.some((p) => normName(p) === key)
          )
      );
      if (vs.length < 3) continue; // unknown player — skip individual
      const wins = vs.filter((m) => m.result === 'Win').length;
      playerWRs.push({ name: raw, wr: smoothedWR(wins, vs.length), n: vs.length });
    }

    // Ship-type win rate
    let shipWR: { wr: number; n: number } | null = null;
    if (ship) {
      const vsShip = pool.filter((m) =>
        (m.opponentTeams || []).some(
          (ot) => normName(ot.shipType) === ship
        )
      );
      if (vsShip.length >= 3) {
        const wins = vsShip.filter((m) => m.result === 'Win').length;
        shipWR = { wr: smoothedWR(wins, vsShip.length), n: vsShip.length };
      }
    }

    // Combine: pressure = 1 − our win rate (higher pressure = worse for us)
    let score: number;
    let n: number;

    if (playerWRs.length > 0 && shipWR) {
      const avgPWR = playerWRs.reduce((s, p) => s + p.wr, 0) / playerWRs.length;
      score = 1 - (avgPWR * 0.6 + shipWR.wr * 0.4);
      n = playerWRs.reduce((s, p) => s + p.n, 0) + shipWR.n;
    } else if (playerWRs.length > 0) {
      const avgPWR = playerWRs.reduce((s, p) => s + p.wr, 0) / playerWRs.length;
      score = 1 - avgPWR;
      n = playerWRs.reduce((s, p) => s + p.n, 0);
    } else if (shipWR) {
      score = 1 - shipWR.wr;
      n = shipWR.n;
    } else {
      continue; // no data for this team
    }

    // Prefer naming the actual top-pressure player in the threat copy — a "team name" is
    // frequently an OCR misread of the ship class (see lobbyScan.ts), never a real identity.
    // Only fall back to the team name when there's no player-level signal to draw from.
    const topPlayer = playerWRs.length > 0
      ? [...playerWRs].sort((a, b) => a.wr - b.wr || b.n - a.n)[0]
      : null;
    const teamName = team.teamName || 'Unknown Team';
    const threatLabel = topPlayer?.name || teamName;

    teamPressures.push({ teamName, threatLabel, score, n });
  }

  if (teamPressures.length > 0) {
    teamPressures.sort((a, b) => b.score - a.score);
    const top = teamPressures[0];
    const conf = toConfidence(top.n);
    if (conf) {
      // Negative delta: high-pressure opponent lowers our odds
      const delta = -(top.score - 0.5) * 0.5;
      factors.push({
        kind: 'opponent-pressure',
        label: 'Opponent Threat',
        direction: 'negative',
        delta,
        confidence: conf,
        sampleSize: top.n,
        copy: makeCopy('opponent-pressure', 'negative', conf, top.threatLabel),
      });
    }
  }

  // ── Factor: Hazard Fit ───────────────────────────────────────────────────
  const hazards = (context.reachModifiers || []).filter(
    (m) => !String(m || '').startsWith('Artifact')
  );

  if (hazards.length > 0) {
    const deltas: number[] = [];
    let hazardN = 0;

    for (const hz of hazards) {
      const key = normName(hz);
      const withHz = pool.filter((m) =>
        (m.reachModifiers || []).some((r) => normName(r) === key)
      );
      if (withHz.length < 3) continue;
      const wins = withHz.filter((m) => m.result === 'Win').length;
      deltas.push(smoothedWR(wins, withHz.length) - baseline);
      hazardN += withHz.length;
    }

    if (deltas.length > 0) {
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const conf = toConfidence(hazardN);
      if (conf) {
        const dir = dirFromDelta(avgDelta);
        factors.push({
          kind: 'hazard-fit',
          label: 'Hazard Fit',
          direction: dir,
          delta: avgDelta,
          confidence: conf,
          sampleSize: hazardN,
          copy: makeCopy('hazard-fit', dir, conf),
        });
      }
    }
  }

  // ── Factor: Ship Performance ─────────────────────────────────────────────
  const currentShip = normalizeShipName(context.ship);
  if (currentShip && !String(currentShip).toLowerCase().startsWith('unknown')) {
    const withShip = pool.filter((m) => normalizeShipName(m.ship) === currentShip);
    const conf = toConfidence(withShip.length);
    if (conf) {
      const wins = withShip.filter((m) => m.result === 'Win').length;
      const delta = smoothedWR(wins, withShip.length) - baseline;
      const dir = dirFromDelta(delta);
      factors.push({
        kind: 'ship-performance',
        label: 'Ship Performance',
        direction: dir,
        delta,
        confidence: conf,
        sampleSize: withShip.length,
        copy: makeCopy('ship-performance', dir, conf, currentShip),
      });
    }
  }

  // ── Factor: Artifact / Objective Fit ────────────────────────────────────
  const artifactSource = String(context.artifactSource || '').trim();
  if (artifactSource) {
    const key = artifactSource.toLowerCase();
    const withArtifact = pool.filter(
      (m) => String(m.artifactSource || '').trim().toLowerCase() === key
    );
    const conf = toConfidence(withArtifact.length);
    if (conf) {
      const wins = withArtifact.filter((m) => m.result === 'Win').length;
      const delta = smoothedWR(wins, withArtifact.length) - baseline;
      const dir = dirFromDelta(delta);
      factors.push({
        kind: 'artifact-objective',
        label: 'Objective Fit',
        direction: dir,
        delta,
        confidence: conf,
        sampleSize: withArtifact.length,
        copy: makeCopy('artifact-objective', dir, conf),
      });
    }
  }

  // ── Factor: POI Plan ─────────────────────────────────────────────────────
  // Filtered to artifact-brawl + custom-lobby only
  const poiPool = pool.filter(
    (m) =>
      isPoiEligible(m) &&
      (m.poiEasy != null || m.poiMedium != null || m.poiEpic != null)
  );
  const filteredPoolSize = poiPool.length;

  const buckets: Record<string, { wins: number; total: number }> = {
    '0–1': { wins: 0, total: 0 },
    '2–3': { wins: 0, total: 0 },
    '4+': { wins: 0, total: 0 },
  };

  for (const m of poiPool) {
    const b = poiBucket(poiTotal(m));
    buckets[b].total++;
    if (m.result === 'Win') buckets[b].wins++;
  }

  let bestBucket: string | null = null;
  let bestBucketWR = -1;
  let bestBucketN = 0;

  for (const [bucket, s] of Object.entries(buckets)) {
    if (s.total < 3) continue;
    const wr = smoothedWR(s.wins, s.total);
    if (wr > bestBucketWR) {
      bestBucketWR = wr;
      bestBucket = bucket;
      bestBucketN = s.total;
    }
  }

  if (bestBucket && bestBucketN >= 3) {
    const conf = toConfidence(bestBucketN);
    if (conf) {
      const delta = bestBucketWR - baseline;
      const dir = dirFromDelta(delta);
      factors.push({
        kind: 'poi-plan',
        label: 'POI Plan',
        direction: dir,
        delta,
        confidence: conf,
        sampleSize: bestBucketN,
        copy: makeCopy('poi-plan', dir, conf, bestBucket),
      });
    }
  }

  // ── Blend overall estimate ───────────────────────────────────────────────
  let weightedSum = 0;
  let totalWeight = 0;

  for (const f of factors) {
    const w = FACTOR_WEIGHTS[f.kind] ?? 0.1;
    weightedSum += f.delta * w;
    totalWeight += w;
  }

  const blended = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const overallWinRate = Math.max(0.10, Math.min(0.90, baseline + blended));

  // ── Aggregate confidence ─────────────────────────────────────────────────
  const confScores: Record<PregameAdviceConfidence, number> = { low: 1, medium: 2, high: 3 };
  const avgConfScore =
    factors.length > 0
      ? factors.reduce((s, f) => s + confScores[f.confidence], 0) / factors.length
      : 0;
  const baselineConf = toConfidence(pool.length);

  let overallConf: PregameAdviceConfidence;
  if (avgConfScore >= 2.5 && baselineConf === 'high') {
    overallConf = 'high';
  } else if (avgConfScore >= 1.5 || baselineConf === 'medium') {
    overallConf = 'medium';
  } else {
    overallConf = 'low';
  }

  // ── Sort factors by magnitude, keep top 5 ───────────────────────────────
  const displayFactors = [...factors]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  // ── Top actions ──────────────────────────────────────────────────────────
  const topActions: string[] = [];

  if (teamPressures.length > 0) {
    const top = teamPressures[0];
    const conf = toConfidence(top.n);
    if (conf) {
      topActions.push(
        conf === 'low'
          ? `Lean toward eliminating ${top.threatLabel} early`
          : `Best early target: ${top.threatLabel}`
      );
    }
  }

  if (bestBucket) {
    topActions.push(`Target ${bestBucket} POIs`);
  }

  const pct = Math.round(overallWinRate * 100);

  return {
    baselineWinRate: baseline,
    overallWinRate,
    confidence: overallConf,
    sampleSize: pool.length,
    filteredPoolSize,
    headline: `~${pct}% estimated win rate`,
    factors: displayFactors,
    topActions,
    hasUsableData: true,
  };
}
