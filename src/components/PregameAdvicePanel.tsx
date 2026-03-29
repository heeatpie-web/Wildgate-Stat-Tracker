/**
 * @module PregameAdvicePanel
 * Shared live + saved pregame intelligence surfaces.
 */
import React from 'react';
import { X, Crosshair, Zap, AlertTriangle, MapPin, Target, Swords, Clock3 } from 'lucide-react';
import { normalizeShipName, type Match } from '../types';
import type {
  PregameAdviceConfidence,
  PregameAdviceContext,
  PregameAdviceFactor,
  PregameAdviceFactorKind,
  PregameAdviceResult,
  PregameAdviceSnapshot,
} from '../utils/pregameAdvice/types';
import {
  buildPregameAdviceContextFromMatch,
  computePregameAdviceForMatch,
  hasPregameLobbyContext,
} from '../utils/pregameAdvice/matchAdvice';
import { getPregameAdviceHistoryPool } from '../utils/pregameAdvice/history';

type AdviceLike = PregameAdviceResult | PregameAdviceSnapshot;

interface MatchupStat {
  label: string;
  sampleSize: number;
  winRate: number;
  delta: number;
}

interface OpponentTeamIntel {
  teamName: string;
  shipType: string;
  sampleSize: number;
  winRate: number;
  delta: number;
  players: MatchupStat[];
}

interface LiveLobbyIntel {
  shipStat: MatchupStat | null;
  teammateStats: MatchupStat[];
  opponentTeams: OpponentTeamIntel[];
}

const CONFIDENCE_STYLES: Record<PregameAdviceConfidence, string> = {
  low: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  medium: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
};

const CONFIDENCE_LABELS: Record<PregameAdviceConfidence, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
};

const FACTOR_ICONS: Record<PregameAdviceFactorKind, React.ReactNode> = {
  'teammate-synergy': <Zap size={11} />,
  'opponent-pressure': <Crosshair size={11} />,
  'hazard-fit': <AlertTriangle size={11} />,
  'ship-performance': <Swords size={11} />,
  'artifact-objective': <Target size={11} />,
  'poi-plan': <MapPin size={11} />,
};

const DIRECTION_DOT_CLASS: Record<string, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-rose-400',
  neutral: 'bg-md-sys-on-surface/30',
};

const formatSnapshotTime = (updatedAt?: number | null): string | null => {
  const timestamp = Number(updatedAt || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const normName = (value: string): string => String(value || '').trim().toLowerCase();

const smoothedWinRate = (wins: number, total: number): number => (
  (wins + 1) / (total + 2)
);

const formatMatchupRate = (winRate: number, sampleSize: number): string => (
  sampleSize > 0 ? `${Math.round(winRate * 100)}%` : '--'
);

const formatDelta = (delta: number, sampleSize: number): string => {
  if (sampleSize <= 0) return 'No direct history yet';
  const points = Math.round(delta * 100);
  if (points > 0) return `+${points} pts vs baseline`;
  if (points < 0) return `${points} pts vs baseline`;
  return 'Holding baseline';
};

const matchupToneClass = (delta: number, sampleSize: number): string => {
  if (sampleSize <= 0) return 'text-md-sys-on-surface/45';
  if (delta >= 0.02) return 'text-emerald-300';
  if (delta <= -0.02) return 'text-rose-300';
  return 'text-md-sys-on-surface/72';
};

const buildMatchupStat = (
  label: string,
  sampleSize: number,
  wins: number,
  baseline: number
): MatchupStat => {
  const winRate = sampleSize > 0 ? smoothedWinRate(wins, sampleSize) : 0;
  return {
    label,
    sampleSize,
    winRate,
    delta: sampleSize > 0 ? winRate - baseline : 0,
  };
};

const buildLiveLobbyIntel = (
  match: Match | null | undefined,
  allMatches: Match[],
  advice: PregameAdviceResult | null
): LiveLobbyIntel => {
  const context = buildPregameAdviceContextFromMatch(match);
  if (!context) {
    return { shipStat: null, teammateStats: [], opponentTeams: [] };
  }

  const pool = getPregameAdviceHistoryPool(context.mode, allMatches || []);
  const baseline = typeof advice?.baselineWinRate === 'number'
    ? advice.baselineWinRate
    : (pool.length > 0 ? smoothedWinRate(pool.filter((entry) => entry.result === 'Win').length, pool.length) : 0.5);

  const teammateStats = context.teammates
    .map((name) => {
      const withThem = pool.filter((entry) =>
        (entry.teammates || []).some((teammate) => normName(teammate) === normName(name))
      );
      return buildMatchupStat(
        name,
        withThem.length,
        withThem.filter((entry) => entry.result === 'Win').length,
        baseline
      );
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || right.sampleSize - left.sampleSize)
    .slice(0, 4);

  const shipName = normalizeShipName(context.ship);
  const shipMatches = shipName && !String(shipName).toLowerCase().startsWith('unknown')
    ? pool.filter((entry) => normalizeShipName(entry.ship) === shipName)
    : [];
  const shipStat = shipMatches.length > 0 || shipName
    ? buildMatchupStat(
      shipName || 'Current ship',
      shipMatches.length,
      shipMatches.filter((entry) => entry.result === 'Win').length,
      baseline
    )
    : null;

  const opponentTeams = context.opponentTeams.map((team) => {
    const playerStats = team.players
      .map((playerName) => {
        const encounters = pool.filter((entry) =>
          (entry.opponents || []).some((opponent) => normName(opponent) === normName(playerName))
          || (entry.opponentTeams || []).some((opponentTeam) =>
            (opponentTeam.players || []).some((player) => normName(player) === normName(playerName))
          )
        );
        return buildMatchupStat(
          playerName,
          encounters.length,
          encounters.filter((entry) => entry.result === 'Win').length,
          baseline
        );
      })
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || right.sampleSize - left.sampleSize)
      .slice(0, 3);

    const normalizedShip = normName(team.shipType);
    const teamMatches = pool.filter((entry) => {
      const playerHit = team.players.some((playerName) => (
        (entry.opponents || []).some((opponent) => normName(opponent) === normName(playerName))
        || (entry.opponentTeams || []).some((opponentTeam) =>
          (opponentTeam.players || []).some((player) => normName(player) === normName(playerName))
        )
      ));
      const shipHit = normalizedShip
        ? (entry.opponentTeams || []).some((opponentTeam) => normName(opponentTeam.shipType) === normalizedShip)
        : false;
      return playerHit || shipHit;
    });

    const teamStat = buildMatchupStat(
      team.teamName || 'Unknown Team',
      teamMatches.length,
      teamMatches.filter((entry) => entry.result === 'Win').length,
      baseline
    );

    return {
      teamName: team.teamName || 'Unknown Team',
      shipType: team.shipType,
      sampleSize: teamStat.sampleSize,
      winRate: teamStat.winRate,
      delta: teamStat.delta,
      players: playerStats,
    };
  });

  return { shipStat, teammateStats, opponentTeams };
};

interface ConfidencePillProps {
  confidence: PregameAdviceConfidence;
}

const ConfidencePill: React.FC<ConfidencePillProps> = ({ confidence }) => (
  <span
    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLES[confidence]}`}
  >
    {CONFIDENCE_LABELS[confidence]}
  </span>
);

interface FactorRowProps {
  factor: PregameAdviceFactor;
}

const FactorRow: React.FC<FactorRowProps> = ({ factor }) => (
  <div className="flex items-start gap-2 py-1.5">
    <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${DIRECTION_DOT_CLASS[factor.direction]}`} />
      <span className="text-md-sys-on-surface/40">
        {FACTOR_ICONS[factor.kind]}
      </span>
    </div>
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-md-sys-on-surface/80">
      {factor.copy}
    </p>
    <div className="ml-1 shrink-0">
      <ConfidencePill confidence={factor.confidence} />
    </div>
  </div>
);

interface WinRateGaugeProps {
  winRate: number;
}

const WinRateGauge: React.FC<WinRateGaugeProps> = ({ winRate }) => {
  const pct = Math.round(winRate * 100);
  const barColor =
    pct >= 60 ? 'bg-emerald-400' : pct >= 45 ? 'bg-md-sys-primary' : 'bg-rose-400';

  return (
    <div className="flex items-end gap-2">
      <span className="font-brand text-3xl font-black leading-none tracking-tight text-md-sys-on-surface">
        {pct}
        <span className="text-lg opacity-60">%</span>
      </span>
      <div className="mb-0.5 flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-md-sys-on-surface/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

interface AdviceActionPillsProps {
  actions: string[];
}

const AdviceActionPills: React.FC<AdviceActionPillsProps> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <div className="px-3 pb-1 pt-1.5">
      <div className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-on-surface/40">
        Playbook
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <span
            key={action}
            className="rounded-full border border-md-sys-primary/16 bg-md-sys-primary/8 px-2 py-1 text-[10px] font-semibold text-md-sys-on-surface/78"
          >
            {action}
          </span>
        ))}
      </div>
    </div>
  );
};

interface MatchupBadgeProps {
  eyebrow: string;
  stat: MatchupStat;
}

const MatchupBadge: React.FC<MatchupBadgeProps> = ({ eyebrow, stat }) => (
  <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface/60 px-2.5 py-2">
    <div className="text-[9px] font-black uppercase tracking-[0.26em] text-md-sys-on-surface/42">
      {eyebrow}
    </div>
    <div className="mt-1 flex items-center justify-between gap-2">
      <div className="min-w-0 text-[11px] font-semibold text-md-sys-on-surface">
        <span className="line-clamp-1">{stat.label}</span>
      </div>
      <div className={`shrink-0 text-xs font-black ${matchupToneClass(stat.delta, stat.sampleSize)}`}>
        {formatMatchupRate(stat.winRate, stat.sampleSize)}
      </div>
    </div>
    <div className="mt-1 text-[10px] leading-relaxed text-md-sys-on-surface/56">
      {stat.sampleSize > 0 ? `${stat.sampleSize} match${stat.sampleSize !== 1 ? 'es' : ''}` : 'No direct history yet'}
      {stat.sampleSize > 0 ? ` · ${formatDelta(stat.delta, stat.sampleSize)}` : ''}
    </div>
  </div>
);

interface OpponentTeamCardProps {
  intel: OpponentTeamIntel;
}

const OpponentTeamCard: React.FC<OpponentTeamCardProps> = ({ intel }) => (
  <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface/60 px-3 py-2.5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-md-sys-on-surface">
          {intel.teamName}
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-md-sys-on-surface/45">
          {intel.shipType || 'Ship unknown'}
        </div>
      </div>
      <div className={`shrink-0 text-xs font-black ${matchupToneClass(intel.delta, intel.sampleSize)}`}>
        {formatMatchupRate(intel.winRate, intel.sampleSize)}
      </div>
    </div>
    <div className="mt-1 text-[10px] leading-relaxed text-md-sys-on-surface/56">
      {intel.sampleSize > 0 ? `${intel.sampleSize} shared matches` : 'No direct history yet'}
      {intel.sampleSize > 0 ? ` · ${formatDelta(intel.delta, intel.sampleSize)}` : ''}
    </div>
    {intel.players.length > 0 ? (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {intel.players.map((player) => (
          <span
            key={player.label}
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
              player.sampleSize > 0
                ? 'border-md-sys-outline/14 bg-md-sys-surface-container-high/75 text-md-sys-on-surface/80'
                : 'border-md-sys-outline/10 bg-md-sys-surface-container/55 text-md-sys-on-surface/55'
            }`}
          >
            {player.label}
            {player.sampleSize > 0 ? ` · ${formatMatchupRate(player.winRate, player.sampleSize)}` : ' · no history'}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);

interface LiveLobbyIntelSectionProps {
  context: PregameAdviceContext | null;
  intel: LiveLobbyIntel;
}

const LiveLobbyIntelSection: React.FC<LiveLobbyIntelSectionProps> = ({ context, intel }) => {
  if (!context) return null;

  const hasOpponentRows = intel.opponentTeams.length > 0;
  const hasTeammateRows = intel.teammateStats.length > 0;
  const hasShipRow = Boolean(intel.shipStat?.label);

  return (
    <div className="px-3 pb-2 pt-1.5">
      <div className="mb-2 text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-on-surface/40">
        This Lobby
      </div>

      {context.teammates.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-md-sys-on-surface/45">
            Squad
          </div>
          <div className="flex flex-wrap gap-1.5">
            {context.teammates.map((name) => (
              <span
                key={name}
                className="rounded-full border border-md-sys-outline/12 bg-md-sys-surface/60 px-2 py-1 text-[10px] font-semibold text-md-sys-on-surface/78"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-2 rounded-xl border border-dashed border-md-sys-outline/14 bg-md-sys-surface/45 px-3 py-2 text-[11px] text-md-sys-on-surface/55">
          Waiting on teammate names from this lobby.
        </div>
      )}

      {hasShipRow || hasTeammateRows ? (
        <div className="grid gap-2 md:grid-cols-2">
          {intel.shipStat ? <MatchupBadge eyebrow="Your ship" stat={intel.shipStat} /> : null}
          {hasTeammateRows ? (
            <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface/60 px-2.5 py-2">
              <div className="text-[9px] font-black uppercase tracking-[0.26em] text-md-sys-on-surface/42">
                Squad history
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {intel.teammateStats.map((stat) => (
                  <span
                    key={stat.label}
                    className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                      stat.sampleSize > 0
                        ? 'border-md-sys-outline/14 bg-md-sys-surface-container-high/75 text-md-sys-on-surface/80'
                        : 'border-md-sys-outline/10 bg-md-sys-surface-container/55 text-md-sys-on-surface/55'
                    }`}
                  >
                    {stat.label}
                    {stat.sampleSize > 0 ? ` · ${formatMatchupRate(stat.winRate, stat.sampleSize)}` : ' · no history'}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-md-sys-on-surface/45">
          Enemy teams
        </div>
        {hasOpponentRows ? (
          <div className="flex flex-col gap-2">
            {intel.opponentTeams.map((team) => (
              <OpponentTeamCard key={`${team.teamName}-${team.shipType}`} intel={team} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-md-sys-outline/14 bg-md-sys-surface/45 px-3 py-2 text-[11px] text-md-sys-on-surface/55">
            Capture the lobby to populate specific enemy teams and player matchup history.
          </div>
        )}
      </div>
    </div>
  );
};

interface PregameAdviceCardProps {
  advice: AdviceLike;
  modeLabel?: string | null;
  eyebrow: string;
  subtitle?: string | null;
  onDismiss?: (() => void) | null;
  compact?: boolean;
  details?: React.ReactNode;
  showEstimate?: boolean;
  pendingMessage?: string | null;
}

const PregameAdviceCard: React.FC<PregameAdviceCardProps> = ({
  advice,
  modeLabel,
  eyebrow,
  subtitle,
  onDismiss,
  compact = false,
  details,
  showEstimate = true,
  pendingMessage,
}) => {
  const positiveFactors = advice.factors.filter((factor) => factor.direction === 'positive');
  const negativeFactors = advice.factors.filter((factor) => factor.direction === 'negative');
  const neutralFactors = advice.factors.filter((factor) => factor.direction === 'neutral');
  const orderedFactors = [...negativeFactors, ...positiveFactors, ...neutralFactors];
  const shouldShowEstimate = advice.hasUsableData && showEstimate;
  const baselinePct = typeof advice.baselineWinRate === 'number'
    ? Math.round(advice.baselineWinRate * 100)
    : null;
  const swingPoints = typeof advice.baselineWinRate === 'number'
    ? Math.round((advice.overallWinRate - advice.baselineWinRate) * 100)
    : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-md-sys-outline/15 bg-md-sys-surface-container shadow-md ${
        compact ? '' : 'ring-1 ring-md-sys-primary/6'
      }`}
      style={{ borderLeft: '3px solid var(--md-sys-color-primary)' }}
    >
      <div className={`flex items-start justify-between gap-3 ${compact ? 'px-3 pb-2 pt-3' : 'px-4 pb-2 pt-4'}`}>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.28em] text-md-sys-primary opacity-80">
              {eyebrow}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLES[advice.confidence]}`}
            >
              {CONFIDENCE_LABELS[advice.confidence]} conf
            </span>
          </div>
          {shouldShowEstimate ? (
            <>
              <WinRateGauge winRate={advice.overallWinRate} />
              <p className="mt-1 text-[11px] leading-snug text-md-sys-on-surface/56">
                {advice.headline}
              </p>
              {baselinePct != null ? (
                <p className="mt-1 text-[10px] leading-snug text-md-sys-on-surface/42">
                  Mode baseline {baselinePct}%
                  {swingPoints == null
                    ? ''
                    : swingPoints > 0
                      ? ` · lobby is adding +${swingPoints} pts`
                      : swingPoints < 0
                        ? ` · lobby is shaving ${Math.abs(swingPoints)} pts`
                        : ' · lobby is holding baseline'}
                </p>
              ) : null}
            </>
          ) : advice.hasUsableData && pendingMessage ? (
            <>
              {baselinePct != null ? (
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-md-sys-on-surface/42">
                  Mode baseline {baselinePct}%
                </p>
              ) : null}
              <p className="mt-1 text-[11px] leading-relaxed text-md-sys-on-surface/60">
                {pendingMessage}
              </p>
            </>
          ) : (
            <p className="text-xs text-md-sys-on-surface/50">Not enough history yet</p>
          )}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-md-sys-on-surface/40 transition-colors hover:bg-md-sys-on-surface/8 hover:text-md-sys-on-surface/70"
            aria-label="Close pregame intel"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {subtitle ? (
        <div className="px-3 pb-1">
          <div className="rounded-xl border border-md-sys-outline/10 bg-md-sys-surface/65 px-2.5 py-2 text-[11px] leading-relaxed text-md-sys-on-surface/60">
            {subtitle}
          </div>
        </div>
      ) : null}

      {details ? (
        <>
          <div className="mx-3 border-t border-md-sys-outline/10" />
          {details}
        </>
      ) : null}

      {shouldShowEstimate && advice.topActions.length > 0 ? (
        <>
          <div className="mx-3 border-t border-md-sys-outline/10" />
          <AdviceActionPills actions={advice.topActions} />
        </>
      ) : null}

      {shouldShowEstimate && orderedFactors.length > 0 ? (
        <>
          <div className="mx-3 border-t border-md-sys-outline/10" />
          <div className="px-3 py-1">
            {orderedFactors.map((factor, index) => (
              <FactorRow key={`${factor.kind}-${index}`} factor={factor} />
            ))}
          </div>
        </>
      ) : null}

      {!advice.hasUsableData ? (
        <div className="px-3 pb-3">
          <p className="text-[11px] leading-relaxed text-md-sys-on-surface/50">
            Play a few more matches in this mode to unlock personalized advice.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1 text-[10px] text-md-sys-on-surface/35">
        <span>
          Based on {advice.sampleSize} match{advice.sampleSize !== 1 ? 'es' : ''}
          {advice.filteredPoolSize > 0 && advice.filteredPoolSize !== advice.sampleSize
            ? ` · ${advice.filteredPoolSize} for POI`
            : ''}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {modeLabel ? <span>{modeLabel}</span> : null}
          {'updatedAt' in advice && formatSnapshotTime(advice.updatedAt) ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={10} />
              {formatSnapshotTime(advice.updatedAt)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export interface PregameAdvicePanelProps {
  activeDraftMatch: Match | null;
  allMatches: Match[];
  onDismiss?: () => void;
}

export const PregameAdvicePanel: React.FC<PregameAdvicePanelProps> = ({
  activeDraftMatch,
  allMatches,
  onDismiss,
}) => {
  const advice = React.useMemo(
    () => computePregameAdviceForMatch(activeDraftMatch, allMatches),
    [activeDraftMatch, allMatches]
  );
  const context = React.useMemo(
    () => buildPregameAdviceContextFromMatch(activeDraftMatch),
    [activeDraftMatch]
  );
  const liveLobbyIntel = React.useMemo(
    () => buildLiveLobbyIntel(activeDraftMatch, allMatches, advice),
    [activeDraftMatch, advice, allMatches]
  );
  const liveLobbyReady = React.useMemo(
    () => hasPregameLobbyContext(activeDraftMatch),
    [activeDraftMatch]
  );

  if (!activeDraftMatch || !advice) return null;

  return (
    <PregameAdviceCard
      advice={advice}
      modeLabel={activeDraftMatch.mode}
      eyebrow="Pregame Intel"
      subtitle="Lobby OCR is staged into a dedicated match workspace now, so you can dip into this view without crowding the recording controls."
      onDismiss={onDismiss}
      showEstimate={liveLobbyReady}
      pendingMessage="Waiting for fresh lobby intel for this match. Capture the current squad and enemy teams to generate a new estimate instead of reusing the mode baseline."
      details={<LiveLobbyIntelSection context={context} intel={liveLobbyIntel} />}
    />
  );
};

interface PregameAdviceSnapshotCardProps {
  match: Match;
}

export const PregameAdviceSnapshotCard: React.FC<PregameAdviceSnapshotCardProps> = ({ match }) => {
  const advice = match.pregameAdvice;
  if (!advice) return null;

  return (
    <PregameAdviceCard
      advice={advice}
      modeLabel={match.mode}
      eyebrow="Saved Pregame Intel"
      subtitle="This is the estimate that was captured for this match before the result was resolved."
      compact
    />
  );
};
