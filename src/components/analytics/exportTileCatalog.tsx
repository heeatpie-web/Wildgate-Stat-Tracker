import React from 'react';
import {
  Match,
  MomentumData,
  PlacementData,
  KillEfficiencyData,
  StreakData,
  PeriodComparisonData,
  TimePatternData,
} from '../../types';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Gauge,
  Medal,
  Flame,
  Clock,
  Hash,
  Crosshair,
  Calendar,
  Zap,
} from 'lucide-react';

export interface ExportTileData {
  filteredMatches: Match[];
  winRate: number;
  currentStreak: number;
  momentum: MomentumData;
  placementData: PlacementData | null;
  killEfficiency: KillEfficiencyData;
  streakHistory: StreakData;
  periodComparison: PeriodComparisonData;
  timePatterns: TimePatternData;
}

export interface ExportTileDefinition {
  id: string;
  title: string;
  icon: React.ReactNode;
  render: (data: ExportTileData) => React.ReactNode;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const TILE_CATALOG: ExportTileDefinition[] = [
  {
    id: 'winRate',
    title: 'Win Rate',
    icon: <TrendingUp size={14} />,
    render: (data) => {
      const wins = data.filteredMatches.filter(m => m.result === 'Win').length;
      const losses = data.filteredMatches.filter(m => m.result === 'Loss').length;
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Win Rate</div>
          <div className="text-3xl font-black" style={{ color: 'var(--md-sys-color-success, #4caf50)' }}>
            {data.winRate}%
          </div>
          <div className="text-label-xs text-md-sys-on-surface/50">{wins}W – {losses}L</div>
        </div>
      );
    },
  },
  {
    id: 'totalMatches',
    title: 'Total Matches',
    icon: <Hash size={14} />,
    render: (data) => {
      const total = data.filteredMatches.length;
      const wins = data.filteredMatches.filter(m => m.result === 'Win').length;
      const losses = data.filteredMatches.filter(m => m.result === 'Loss').length;
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Total Matches</div>
          <div className="text-3xl font-black text-md-sys-primary">{total}</div>
          <div className="text-label-xs text-md-sys-on-surface/50">{wins}W / {losses}L</div>
        </div>
      );
    },
  },
  {
    id: 'avgKills',
    title: 'Avg Kills',
    icon: <Crosshair size={14} />,
    render: (data) => {
      const matches = data.filteredMatches;
      const totalKills = matches.reduce((sum, m) => {
        const k = Object.values(m.kills ?? {}).reduce((a, b) => a + b, 0);
        return sum + k;
      }, 0);
      const avg = matches.length > 0 ? (totalKills / matches.length).toFixed(1) : '0.0';
      const trend = data.killEfficiency.trendDirection;
      const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Avg Kills</div>
          <div className="text-3xl font-black text-md-sys-primary flex items-center gap-1">
            {avg}
            <TrendIcon size={18} />
          </div>
          <div className="text-label-xs text-md-sys-on-surface/50">{matches.length} matches</div>
        </div>
      );
    },
  },
  {
    id: 'avgDamage',
    title: 'Avg Dmg Taken',
    icon: <Zap size={14} />,
    render: (data) => {
      const matches = data.filteredMatches.filter(m => m.damageTaken != null);
      const avg = matches.length > 0
        ? Math.round(matches.reduce((s, m) => s + (m.damageTaken ?? 0), 0) / matches.length)
        : 0;
      const formatted = avg >= 1000 ? `${(avg / 1000).toFixed(1)}k` : String(avg);
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Avg Damage</div>
          <div className="text-3xl font-black text-md-sys-primary">{formatted}</div>
          <div className="text-label-xs text-md-sys-on-surface/50">{matches.length} with data</div>
        </div>
      );
    },
  },
  {
    id: 'avgPlacement',
    title: 'Avg Placement',
    icon: <Medal size={14} />,
    render: (data) => {
      const val = data.placementData != null
        ? data.placementData.avgPlacement.toFixed(1)
        : '--';
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Avg Placement</div>
          <div className="text-3xl font-black text-md-sys-primary">{val}</div>
          <div className="text-label-xs text-md-sys-on-surface/50">
            {data.placementData != null ? `median ${data.placementData.medianPlacement}` : 'no fleet data'}
          </div>
        </div>
      );
    },
  },
  {
    id: 'bestStreak',
    title: 'Best Win Streak',
    icon: <Flame size={14} />,
    render: (data) => (
      <div className="h-full flex flex-col gap-2">
        <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Best Win Streak</div>
        <div className="text-3xl font-black text-md-sys-primary">
          {data.streakHistory.longestWinStreak}
        </div>
        <div className="text-label-xs text-md-sys-on-surface/50">
          longest loss: {data.streakHistory.longestLossStreak}
        </div>
      </div>
    ),
  },
  {
    id: 'currentStreak',
    title: 'Current Streak',
    icon: <TrendingUp size={14} />,
    render: (data) => {
      const s = data.currentStreak;
      const color = s > 0
        ? 'var(--md-sys-color-success, #4caf50)'
        : s < 0
          ? 'var(--md-sys-color-error, #f44336)'
          : 'var(--md-sys-color-primary)';
      const label = s > 0 ? `+${s}` : String(s);
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Current Streak</div>
          <div className="text-3xl font-black" style={{ color }}>{label}</div>
          <div className="text-label-xs text-md-sys-on-surface/50">
            {s > 0 ? 'win streak' : s < 0 ? 'loss streak' : 'neutral'}
          </div>
        </div>
      );
    },
  },
  {
    id: 'momentum',
    title: 'Momentum',
    icon: <Gauge size={14} />,
    render: (data) => {
      const { currentMomentum, trend, timeline } = data.momentum;
      const TrendIcon = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus;
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Momentum</div>
          <div className="text-3xl font-black text-md-sys-primary flex items-center gap-1">
            {currentMomentum}
            <TrendIcon size={18} />
          </div>
          <AreaChart width={200} height={80} data={timeline} style={{ width: '100%' }}>
            <defs>
              <linearGradient id="momentum-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="index" hide />
            <YAxis hide />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--md-sys-color-primary)"
              strokeWidth={2}
              fill="url(#momentum-grad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      );
    },
  },
  {
    id: 'placement',
    title: 'Placement Dist',
    icon: <Medal size={14} />,
    render: (data) => {
      const dist = data.placementData?.distribution ?? null;
      if (!dist || dist.length === 0) {
        return (
          <div className="h-full flex flex-col gap-2">
            <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Placement Dist</div>
            <div className="text-label-xs text-md-sys-on-surface/50 mt-2">No fleet data</div>
          </div>
        );
      }
      const avg = data.placementData?.avgPlacement.toFixed(1) ?? '--';
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Placement Dist</div>
          <div className="text-3xl font-black text-md-sys-primary">{avg}</div>
          <BarChart width={200} height={80} data={dist} style={{ width: '100%' }}>
            <XAxis dataKey="placement" hide />
            <YAxis hide />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {dist.map((_entry, i) => (
                <Cell key={i} fill="var(--md-sys-color-primary)" />
              ))}
            </Bar>
          </BarChart>
        </div>
      );
    },
  },
  {
    id: 'killEfficiency',
    title: 'Kill Efficiency',
    icon: <Crosshair size={14} />,
    render: (data) => {
      const { overallAvgKills, trendDirection, timeline } = data.killEfficiency;
      const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Kill Efficiency</div>
          <div className="text-3xl font-black text-md-sys-primary flex items-center gap-1">
            {overallAvgKills.toFixed(1)}
            <TrendIcon size={18} />
          </div>
          <AreaChart width={200} height={80} data={timeline} style={{ width: '100%' }}>
            <defs>
              <linearGradient id="killEfficiency-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="index" hide />
            <YAxis hide />
            <Area
              type="monotone"
              dataKey="avgKills"
              stroke="var(--md-sys-color-primary)"
              strokeWidth={2}
              fill="url(#killEfficiency-grad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      );
    },
  },
  {
    id: 'periodComparison',
    title: 'This Week vs Last',
    icon: <Calendar size={14} />,
    render: (data) => {
      const { thisWeek, lastWeek, weekDelta } = data.periodComparison;
      const delta = weekDelta.winRate;
      const deltaColor = delta >= 0
        ? 'var(--md-sys-color-success, #4caf50)'
        : 'var(--md-sys-color-error, #f44336)';
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">This Week vs Last</div>
          <div className="flex items-end gap-2">
            <div className="text-3xl font-black text-md-sys-primary">{thisWeek.winRate}%</div>
            <div
              className="text-label-xs font-bold mb-1 px-1 rounded"
              style={{ color: deltaColor, background: `${deltaColor}22` }}
            >
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </div>
          </div>
          <div className="text-label-xs text-md-sys-on-surface/50">
            {thisWeek.matches}G this wk · {lastWeek.winRate}% last wk
          </div>
        </div>
      );
    },
  },
  {
    id: 'timePatterns',
    title: 'Peak Time',
    icon: <Clock size={14} />,
    render: (data) => {
      const { peakHour, peakDay } = data.timePatterns;
      const dayName = DAY_NAMES[peakDay] ?? '?';
      return (
        <div className="h-full flex flex-col gap-2">
          <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/50">Peak Time</div>
          <div className="text-3xl font-black text-md-sys-primary">
            {peakHour}:00
          </div>
          <div className="text-label-xs text-md-sys-on-surface/50">{dayName}</div>
        </div>
      );
    },
  },
];
