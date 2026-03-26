import React, { useMemo } from 'react';
import type { AnalyticsView, DrillDownTarget, Match, VisualMode } from '../../types';
import {
    AlertTriangle,
    Crosshair,
    Handshake,
    Package2,
    Pin,
    Rocket,
    ShieldPlus,
    Sparkles,
    Swords,
    Target,
    User,
} from 'lucide-react';
import { buildDrillDownModel, type DrillDownComboRow, type DrillDownRow } from '../../utils/analyticsDrilldown';

const MIN_HAZARD_SAMPLE_SIZE = 3;

interface AnalyticsCockpitProps {
    visualMode: VisualMode;
    onNavigate: (view: AnalyticsView) => void;
    onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
    winRate: number;
    totalMatches: number;
    momentum: { currentMomentum?: number | null } | null;
    placementData: { avgPlacement?: number | null } | null;
    filteredMatches: Match[];
    contextTags: string[];
    pinnedTiles?: Set<string>;
    onTogglePin?: (id: string) => void;
}

const SummaryTile: React.FC<{
    label: string;
    value: string;
    tone?: string;
    helper?: string;
    className?: string;
    pinId?: string;
    isPinned?: boolean;
    onTogglePin?: (id: string) => void;
    compact?: boolean;
}> = ({ label, value, tone = 'text-md-sys-on-surface', helper, className = '', pinId, isPinned, onTogglePin, compact }) => (
    <div className={`at-summary-tile group relative ${compact ? 'pl-3.5 pr-3 py-2' : 'pl-4 pr-4 py-3'} ${className}`}>
        <div className={`font-mono font-bold uppercase tracking-widest text-md-sys-on-surface/45 ${compact ? 'text-[9px]' : 'text-label-xs'}`}>{label}</div>
        <div className={`mt-0.5 font-black tracking-tight ${compact ? 'text-xl' : 'text-2xl'} ${tone}`}>{value}</div>
        {helper ? <div className={`mt-0.5 text-md-sys-on-surface/60 ${compact ? 'text-label-xs line-clamp-1' : 'text-label-sm'}`}>{helper}</div> : null}
        {pinId && onTogglePin && (
            <button
                type="button"
                onClick={() => onTogglePin(pinId)}
                className={`absolute top-2 right-2 p-1 rounded transition-all ${
                    isPinned
                        ? 'text-md-sys-primary opacity-100'
                        : 'text-md-sys-on-surface/25 opacity-0 group-hover:opacity-100'
                }`}
                aria-label={isPinned ? `Unpin ${label}` : `Pin ${label} for export`}
            >
                <Pin size={10} fill={isPinned ? 'currentColor' : 'none'} />
            </button>
        )}
    </div>
);

const FocusCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    headline: string;
    supporting: string;
    accent: string;
    onClick?: () => void;
}> = ({ icon, label, headline, supporting, accent, onClick }) => {
    const isInteractive = typeof onClick === 'function';
    const className = `at-focus-card group relative overflow-hidden p-4 text-left transition-all ${
        isInteractive
            ? 'cursor-pointer'
            : 'opacity-95'
    }`;
    const content = (
        <>
            <div className={`absolute inset-x-0 top-0 h-1 ${accent} opacity-80`} />
            <div className="flex items-start justify-between gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent} text-md-sys-onPrimary`}>
                    {icon}
                </div>
                <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/40">
                    {label}
                </div>
            </div>
            <div className="mt-4 min-w-0">
                <div className="text-title font-black tracking-tight text-md-sys-on-surface truncate">{headline}</div>
                <div className="mt-1 text-label-sm text-md-sys-on-surface/62 line-clamp-2">{supporting}</div>
            </div>
        </>
    );

    if (!isInteractive) return <div className={className}>{content}</div>;
    return (
        <button type="button" onClick={onClick} className={className}>
            {content}
        </button>
    );
};

const ExplorerRow: React.FC<{
    row: DrillDownRow;
    note?: string;
    onClick?: () => void;
    /** Editorial mode: compact card cell in a grid (easier to scan than a long list). */
    tile?: boolean;
}> = ({ row, note, onClick, tile }) => {
    const winClass = row.winRate >= 50 ? 'text-md-sys-primary' : 'text-danger';
    if (tile) {
        const tileClass = `at-explorer-row w-full min-h-[4.5rem] text-left rounded-lg border border-md-sys-outline/12 bg-md-sys-surface-container/30 px-3 py-2.5 shadow-sm ${
            onClick ? 'cursor-pointer hover:border-md-sys-primary/35 hover:bg-md-sys-surface-container-high/40' : 'cursor-default'
        }`;
        const content = (
            <div className="flex h-full items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="text-label-sm font-bold text-md-sys-on-surface line-clamp-2 leading-snug">{row.name}</div>
                    <div className="mt-1 text-[10px] font-mono font-semibold uppercase tracking-wide text-md-sys-on-surface/50 leading-snug">
                        {note || `${row.total} matches`}
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <div className={`text-lg font-black tabular-nums leading-none ${winClass}`}>{row.winRate}%</div>
                    <div className="mt-1 rounded-md bg-md-sys-surface/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-md-sys-on-surface/45">
                        n={row.total}
                    </div>
                </div>
            </div>
        );
        if (!onClick) return <div className={tileClass}>{content}</div>;
        return (
            <button type="button" onClick={onClick} className={tileClass}>
                {content}
            </button>
        );
    }
    const baseClassName = `at-explorer-row w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left ${
        onClick ? 'cursor-pointer' : 'cursor-default'
    }`;
    const content = (
        <>
            <div className="min-w-0">
                <div className="text-label-sm font-bold text-md-sys-on-surface truncate">{row.name}</div>
                <div className="text-label-xs text-md-sys-on-surface/55 truncate">
                    {note || `${row.total} matches`}
                </div>
            </div>
            <div className="shrink-0 text-right">
                <div className={`text-label-sm font-black ${winClass}`}>
                    {row.winRate}%
                </div>
                <div className="text-label-xs text-md-sys-on-surface/45">
                    {row.total}x
                </div>
            </div>
        </>
    );
    if (!onClick) return <div className={baseClassName}>{content}</div>;
    return (
        <button type="button" onClick={onClick} className={baseClassName}>
            {content}
        </button>
    );
};

const ComboRow: React.FC<{ combo: DrillDownComboRow; tile?: boolean }> = ({ combo, tile }) => (
    <div
        className={
            tile
                ? 'at-combo-tile flex min-h-[4.5rem] flex-col justify-center rounded-lg border border-md-sys-outline/12 bg-md-sys-surface-container/30 px-3 py-2.5 shadow-sm'
                : 'at-combo-tile px-3 py-2.5'
        }
    >
        <div className="text-label-sm font-semibold text-md-sys-on-surface line-clamp-2">{combo.label}</div>
        <div className={`text-md-sys-on-surface/55 ${tile ? 'mt-2 text-[10px] font-mono font-semibold uppercase tracking-wide' : 'mt-1 text-label-xs'}`}>
            {combo.total} matches · {combo.winRate}% WR
        </div>
    </div>
);

const ExplorerSection: React.FC<{
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    dense?: boolean;
}> = ({ title, subtitle, icon, children, dense }) => (
    <section className={`at-explorer-section ${dense ? 'p-3' : 'p-4'}`}>
        <div className={`flex items-start ${dense ? 'gap-2' : 'gap-3'}`}>
            <div className={`${dense ? 'w-8 h-8' : 'w-9 h-9'} rounded-xl bg-md-sys-surface-container-high flex items-center justify-center text-md-sys-primary shrink-0`}>
                {icon}
            </div>
            <div className="min-w-0">
                <h3 className={`at-display font-extrabold tracking-tight text-md-sys-on-surface ${dense ? 'text-label-sm' : 'text-body'}`}>{title}</h3>
                {!dense ? <div className="text-label-sm text-md-sys-on-surface/58">{subtitle}</div> : null}
            </div>
        </div>
        <div className={`${dense ? 'mt-2 space-y-2' : 'mt-4 space-y-3'}`}>
            {children}
        </div>
    </section>
);

const SectionBlock: React.FC<{
    title: string;
    emptyLabel: string;
    children: React.ReactNode;
    dense?: boolean;
    /** Editorial: 1 column when parent is narrow (e.g. tri-column weapons strip); default 2 for wider panels. */
    tileColumns?: 1 | 2;
}> = ({ title, emptyLabel, children, dense, tileColumns = 2 }) => (
    <div className={dense ? undefined : 'rounded-xl border border-md-sys-outline/12 bg-md-sys-surface-container-low/50 p-3 min-h-0'}>
        <div
            className={`font-mono font-bold uppercase tracking-widest text-md-sys-on-surface/42 ${
                dense ? 'mb-2 text-label-xs' : 'mb-3 flex items-center gap-2 text-[10px]'
            }`}
        >
            {!dense ? <span className="h-3.5 w-1 shrink-0 rounded-full bg-md-sys-primary/50" aria-hidden /> : null}
            {title}
        </div>
        <div
            className={
                dense
                    ? 'space-y-1.5'
                    : tileColumns === 1
                        ? 'grid grid-cols-1 gap-2'
                        : 'grid grid-cols-1 gap-2 sm:grid-cols-2'
            }
        >
            {children || <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">{emptyLabel}</div>}
        </div>
    </div>
);

export const AnalyticsCockpit: React.FC<AnalyticsCockpitProps> = ({
    visualMode,
    onNavigate,
    onDrillDown,
    winRate,
    totalMatches,
    momentum,
    placementData,
    filteredMatches,
    contextTags,
    pinnedTiles,
    onTogglePin,
}) => {
    const dense = visualMode === 'dense';
    const cockpitModel = useMemo(
        () => buildDrillDownModel(filteredMatches, { type: 'KPI', name: 'cockpit' }),
        [filteredMatches]
    );

    const recentDeltaLabel = cockpitModel.summary.trendDelta === 0
        ? 'Flat vs total'
        : `${cockpitModel.summary.trendDelta > 0 ? '+' : ''}${cockpitModel.summary.trendDelta}pp vs total`;

    const bestHazard = cockpitModel.hazards.best.find((row) => row.total >= MIN_HAZARD_SAMPLE_SIZE) || null;
    const bestWingman = cockpitModel.people.teammates
        .filter((row) => row.total >= 2)
        .sort((left, right) => {
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
            return right.total - left.total;
        })[0] || cockpitModel.people.teammates[0] || null;
    const worstRival = [...cockpitModel.people.opponents]
        .filter((row) => row.total >= 2)
        .sort((left, right) => {
            if (left.winRate !== right.winRate) return left.winRate - right.winRate;
            return right.total - left.total;
        })[0] || cockpitModel.people.opponents[0] || null;
    const strongestLoadoutSignal = [
        ...cockpitModel.loadouts.weapons,
        ...cockpitModel.loadouts.equipment,
        ...cockpitModel.loadouts.perks,
    ]
        .filter((row) => row.total >= 2)
        .sort((left, right) => {
            if (right.impact !== left.impact) return right.impact - left.impact;
            if (right.total !== left.total) return right.total - left.total;
            return left.name.localeCompare(right.name);
        })[0] || null;

    const focusCards = [
        {
            key: 'ship',
            label: 'Top Ship',
            headline: cockpitModel.entities.ships[0]?.name || 'No ship data',
            supporting: cockpitModel.entities.ships[0]
                ? `${cockpitModel.entities.ships[0].winRate}% win rate across ${cockpitModel.entities.ships[0].total} matches`
                : 'Play more matches to unlock ship context.',
            accent: 'bg-md-sys-primary',
            icon: <Rocket size={18} />,
            action: cockpitModel.entities.ships[0]
                ? () => onDrillDown(cockpitModel.entities.ships[0].name, 'Ship')
                : undefined,
        },
        {
            key: 'hero',
            label: 'Top Hero',
            headline: cockpitModel.entities.heroes[0]?.name || 'No hero data',
            supporting: cockpitModel.entities.heroes[0]
                ? `${cockpitModel.entities.heroes[0].winRate}% win rate across ${cockpitModel.entities.heroes[0].total} matches`
                : 'Hero usage appears after a few completed matches.',
            accent: 'bg-info',
            icon: <User size={18} />,
            action: cockpitModel.entities.heroes[0]
                ? () => onDrillDown(cockpitModel.entities.heroes[0].name, 'Hero')
                : undefined,
        },
        {
            key: 'hazard',
            label: 'Best Hazard',
            headline: bestHazard?.name || 'No hazard signal',
            supporting: bestHazard
                ? `${bestHazard.winRate}% win rate, ${bestHazard.impact > 0 ? '+' : ''}${bestHazard.impact}pp vs baseline`
                : 'Need 3 matches on a hazard before it becomes a headline signal.',
            accent: 'bg-warning',
            icon: <AlertTriangle size={18} />,
            action: bestHazard ? () => onDrillDown(bestHazard.name, 'Modifier') : undefined,
        },
        {
            key: 'wingman',
            label: 'Best Wingman',
            headline: bestWingman?.name || 'No teammate signal',
            supporting: bestWingman
                ? `${bestWingman.winRate}% win rate over ${bestWingman.total} encounters`
                : 'Wingman trends appear when teammate data is available.',
            accent: 'bg-success',
            icon: <Handshake size={18} />,
            action: bestWingman ? () => onDrillDown(bestWingman.name, 'Teammate') : undefined,
        },
        {
            key: 'rival',
            label: 'Toughest Rival',
            headline: worstRival?.name || 'No rival signal',
            supporting: worstRival
                ? `${worstRival.winRate}% win rate over ${worstRival.total} encounters`
                : 'Rival context appears once opponent history builds up.',
            accent: 'bg-danger',
            icon: <Swords size={18} />,
            action: worstRival ? () => onDrillDown(worstRival.name, 'Opponent') : undefined,
        },
        {
            key: 'loadout',
            label: 'Loadout Signal',
            headline: strongestLoadoutSignal?.name || 'No loadout signal',
            supporting: strongestLoadoutSignal
                ? `${strongestLoadoutSignal.winRate}% win rate, ${strongestLoadoutSignal.total} matches`
                : 'Weapon, equipment, and perk trends will surface here.',
            accent: 'bg-accent',
            icon: <Crosshair size={18} />,
            action: strongestLoadoutSignal
                ? () => onDrillDown(strongestLoadoutSignal.name, strongestLoadoutSignal.type)
                : undefined,
        },
    ];

    // Dense = more rows, fewer narrative surfaces; editorial = fewer rows, more guidance chrome.
    const shipRows = cockpitModel.entities.ships.slice(0, dense ? 12 : 6);
    const heroRows = cockpitModel.entities.heroes.slice(0, dense ? 12 : 6);
    const teammateRows = cockpitModel.people.teammates
        .slice()
        .sort((left, right) => {
            if (right.total !== left.total) return right.total - left.total;
            return right.winRate - left.winRate;
        })
        .slice(0, dense ? 12 : 6);
    const opponentRows = cockpitModel.people.opponents
        .slice()
        .sort((left, right) => {
            if (left.winRate !== right.winRate) return left.winRate - right.winRate;
            return right.total - left.total;
        })
        .slice(0, dense ? 12 : 6);
    const weaponRows = cockpitModel.loadouts.weapons.slice(0, dense ? 12 : 6);
    const shipWeaponRows = cockpitModel.loadouts.shipWeapons.slice(0, dense ? 8 : 4);
    const hazardRows = cockpitModel.hazards.modifiers.slice(0, dense ? 12 : 6);
    const equipmentRows = cockpitModel.loadouts.equipment.slice(0, dense ? 6 : 3);
    const perkRows = cockpitModel.loadouts.perks.slice(0, dense ? 6 : 3);
    const comboRows = cockpitModel.loadouts.combos.slice(0, dense ? 8 : 4);

    const suggestedDrillName = bestHazard?.name || cockpitModel.entities.ships[0]?.name || strongestLoadoutSignal?.name || 'Capture more matches';

    return (
        <div className={`flex flex-col pb-6 ${dense ? 'gap-2' : 'gap-4'}`}>
            <section className={`at-hero-panel ${dense ? 'p-3' : 'p-4 md:p-5'}`}>
                {dense ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-label-xs font-mono font-bold uppercase tracking-widest text-md-sys-on-surface/50">
                                Analytics cockpit · data-dense
                            </div>
                            <button
                                type="button"
                                onClick={() => onNavigate('social')}
                                className="rounded-pill border border-md-sys-outline/18 px-2.5 py-1 text-label-xs font-bold text-md-sys-on-surface/72 hover:bg-md-sys-surface-container-high"
                            >
                                Team views
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {contextTags.map((tag) => (
                                <span
                                    key={tag}
                                    className="at-context-tag px-2 py-0.5 text-label-xs"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <div className="at-drill-hint px-2.5 py-1.5 text-label-sm text-md-sys-on-surface/70">
                            <span className="font-bold text-md-sys-on-surface/45">Next drill </span>
                            {suggestedDrillName}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <div className="text-label-xs font-mono font-bold uppercase tracking-widest text-md-sys-on-surface/42">
                                Analytics cockpit
                            </div>
                            <h2 className="at-display mt-1 text-heading font-extrabold tracking-tight text-md-sys-on-surface">
                                See what is actually moving the needle
                            </h2>
                            <div className="mt-2 text-body text-md-sys-on-surface/62 max-w-3xl">
                                Start from a ship, person, weapon, or hazard, then drill into why it matters without losing your current filter scope.
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {contextTags.map((tag) => (
                                <span
                                    key={tag}
                                    className="at-context-tag px-3 py-1 text-label-sm"
                                >
                                    {tag}
                                </span>
                            ))}
                            <button
                                type="button"
                                onClick={() => onNavigate('social')}
                                className="rounded-pill border border-md-sys-outline/18 px-3 py-1 text-label-sm font-bold text-md-sys-on-surface/72 hover:bg-md-sys-surface-container-high"
                            >
                                Open team views
                            </button>
                        </div>
                    </div>
                )}

                <div className={`grid md:grid-cols-2 xl:grid-cols-6 ${dense ? 'mt-2 gap-2' : 'mt-4 gap-3'}`}>
                    <SummaryTile
                        compact={dense}
                        label="Win rate"
                        value={`${winRate}%`}
                        tone={winRate >= 50 ? 'text-md-sys-primary' : 'text-danger'}
                        helper={`${cockpitModel.summary.wins} wins / ${cockpitModel.summary.losses} losses`}
                        pinId="winRate"
                        isPinned={pinnedTiles?.has('winRate')}
                        onTogglePin={onTogglePin}
                    />
                    <SummaryTile
                        compact={dense}
                        label="Matches"
                        value={String(totalMatches)}
                        helper="Completed matches in current scope"
                        pinId="totalMatches"
                        isPinned={pinnedTiles?.has('totalMatches')}
                        onTogglePin={onTogglePin}
                    />
                    <SummaryTile
                        compact={dense}
                        label="Recent form"
                        value={`${cockpitModel.summary.recentWinRate}%`}
                        tone={cockpitModel.summary.trendDelta >= 0 ? 'text-md-sys-primary' : 'text-danger'}
                        helper={recentDeltaLabel}
                    />
                    <SummaryTile compact={dense} label="Momentum" value={String(momentum?.currentMomentum ?? 0)} helper="Current momentum score" />
                    <SummaryTile
                        compact={dense}
                        label="Avg kills"
                        value={String(cockpitModel.summary.avgKills)}
                        helper="Per match in current scope"
                        pinId="avgKills"
                        isPinned={pinnedTiles?.has('avgKills')}
                        onTogglePin={onTogglePin}
                    />
                    <SummaryTile
                        compact={dense}
                        label="Avg place"
                        value={cockpitModel.summary.avgPlacement != null ? `#${cockpitModel.summary.avgPlacement}` : 'N/A'}
                        helper={`Placement view avg: #${placementData?.avgPlacement ?? 0}`}
                        pinId="avgPlacement"
                        isPinned={pinnedTiles?.has('avgPlacement')}
                        onTogglePin={onTogglePin}
                    />
                </div>
            </section>

            {!dense && (
            <section className="at-explorer-section p-4 md:p-5">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-md-sys-surface-container-high flex items-center justify-center text-md-sys-primary border border-md-sys-primary/15 shadow-md">
                        <ShieldPlus size={18} aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <div className="text-label-xs font-mono font-bold uppercase tracking-widest text-md-sys-on-surface/42">
                            Suggested next drill-down
                        </div>
                        <div className="at-display mt-1 text-title font-extrabold tracking-tight text-md-sys-on-surface">
                            {suggestedDrillName}
                        </div>
                        <div className="mt-2 text-body text-md-sys-on-surface/58">
                            Use the focus cards and quick filters below to keep moving through related hazards, people, and loadouts without losing your current scope.
                        </div>
                    </div>
                </div>
            </section>
            )}

            {!dense && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {focusCards.map((card) => (
                    <FocusCard
                        key={card.key}
                        icon={card.icon}
                        label={card.label}
                        headline={card.headline}
                        supporting={card.supporting}
                        accent={card.accent}
                        onClick={card.action}
                    />
                ))}
            </section>
            )}

            {!dense && (
            <ExplorerSection
                title="Next moves"
                subtitle="Jump straight into the detailed views when you want a fuller chart-heavy breakdown."
                icon={<Sparkles size={18} />}
            >
                <div className="grid gap-2 md:grid-cols-2">
                    {[
                        { label: 'Performance', view: 'momentum' as AnalyticsView, tone: 'bg-md-sys-primary' },
                        { label: 'Team view', view: 'social' as AnalyticsView, tone: 'bg-info' },
                        { label: 'Hazard view', view: 'environment' as AnalyticsView, tone: 'bg-warning' },
                        { label: 'Entity view', view: 'pro' as AnalyticsView, tone: 'bg-accent' },
                    ].map((entry) => (
                        <button
                            key={entry.view}
                            type="button"
                            onClick={() => onNavigate(entry.view)}
                            className="at-next-move px-3 py-3 text-left"
                        >
                            <div className={`w-8 h-1 rounded-full ${entry.tone}`} />
                            <div className="mt-3 text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/50">
                                {entry.label}
                            </div>
                            <div className="mt-1 text-body font-semibold text-md-sys-on-surface">
                                Open detailed {entry.label.toLowerCase()}
                            </div>
                        </button>
                    ))}
                </div>
            </ExplorerSection>
            )}

            <section className={`grid xl:grid-cols-2 ${dense ? 'gap-2' : 'gap-4'}`}>
                <ExplorerSection
                    dense={dense}
                    title="Ships and heroes"
                    subtitle="Jump from your main picks into deeper context."
                    icon={<Rocket size={18} />}
                >
                    <div className={dense ? 'space-y-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
                        <SectionBlock dense={dense} title="Ships" emptyLabel="No ship rows yet.">
                            <>
                                {shipRows.map((row) => (
                                    <ExplorerRow
                                        key={`ship-${row.name}`}
                                        row={row}
                                        tile={!dense}
                                        note={`${row.total} matches · ${row.avgKills} kills avg`}
                                        onClick={() => onDrillDown(row.name, 'Ship')}
                                    />
                                ))}
                                {shipRows.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No ship rows yet.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                        <SectionBlock dense={dense} title="Heroes" emptyLabel="No hero rows yet.">
                            <>
                                {heroRows.map((row) => (
                                    <ExplorerRow
                                        key={`hero-${row.name}`}
                                        row={row}
                                        tile={!dense}
                                        note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                        onClick={() => onDrillDown(row.name, 'Hero')}
                                    />
                                ))}
                                {heroRows.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No hero rows yet.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                    </div>
                </ExplorerSection>

                <ExplorerSection
                    dense={dense}
                    title="People"
                    subtitle="See who raises your floor and who drags the win rate down."
                    icon={<Handshake size={18} />}
                >
                    <div className={dense ? 'space-y-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
                        <SectionBlock dense={dense} title="Wingmen" emptyLabel="No teammate trends yet.">
                            <>
                                {teammateRows.map((row) => (
                                    <ExplorerRow
                                        key={`ally-${row.name}`}
                                        row={row}
                                        tile={!dense}
                                        note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                        onClick={() => onDrillDown(row.name, 'Teammate')}
                                    />
                                ))}
                                {teammateRows.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No teammate trends yet.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                        <SectionBlock dense={dense} title="Rivals" emptyLabel="No opponent trends yet.">
                            <>
                                {opponentRows.map((row) => (
                                    <ExplorerRow
                                        key={`opponent-${row.name}`}
                                        row={row}
                                        tile={!dense}
                                        note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                        onClick={() => onDrillDown(row.name, 'Opponent')}
                                    />
                                ))}
                                {opponentRows.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No opponent trends yet.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                    </div>
                </ExplorerSection>

                <ExplorerSection
                    dense={dense}
                    title="Weapons and conditions"
                    subtitle="Open a weapon or hazard to see the surrounding people and loadouts."
                    icon={<Target size={18} />}
                >
                    <div className={dense ? 'space-y-3' : 'flex flex-col gap-4'}>
                        <div className={dense ? 'space-y-3' : 'grid grid-cols-1 gap-4 lg:grid-cols-3'}>
                            <SectionBlock dense={dense} tileColumns={1} title="Prospector weapons" emptyLabel="No prospector weapon trends yet.">
                                <>
                                    {weaponRows.map((row) => (
                                        <ExplorerRow
                                            key={`weapon-${row.name}`}
                                            row={row}
                                            tile={!dense}
                                            note={`${row.total} matches · ${row.avgDamage} avg dmg`}
                                            onClick={() => onDrillDown(row.name, 'Weapon')}
                                        />
                                    ))}
                                    {weaponRows.length === 0 ? (
                                        <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No prospector weapon trends yet.</div>
                                    ) : null}
                                </>
                            </SectionBlock>
                            <SectionBlock dense={dense} tileColumns={1} title="Ship weapons" emptyLabel="No ship weapon trends yet.">
                                <>
                                    {shipWeaponRows.map((row) => (
                                        <ExplorerRow
                                            key={`ship-weapon-${row.name}`}
                                            row={row}
                                            tile={!dense}
                                            note={`${row.total} matches · ${row.avgDamage} avg dmg`}
                                            onClick={() => onDrillDown(row.name, 'Weapon')}
                                        />
                                    ))}
                                    {shipWeaponRows.length === 0 ? (
                                        <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No ship weapon trends yet.</div>
                                    ) : null}
                                </>
                            </SectionBlock>
                            <SectionBlock dense={dense} tileColumns={1} title="Hazards" emptyLabel="No hazard trends yet.">
                                <>
                                    {hazardRows.map((row) => (
                                        <ExplorerRow
                                            key={`hazard-${row.name}`}
                                            row={row}
                                            tile={!dense}
                                            note={row.total < MIN_HAZARD_SAMPLE_SIZE
                                                ? `${row.total} matches · low sample`
                                                : `${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                            onClick={() => onDrillDown(row.name, 'Modifier')}
                                        />
                                    ))}
                                    {hazardRows.length === 0 ? (
                                        <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No hazard trends yet.</div>
                                    ) : null}
                                </>
                            </SectionBlock>
                        </div>
                        <SectionBlock dense={dense} title="Artifacts" emptyLabel="No artifact rows in this scope.">
                            <>
                                {cockpitModel.hazards.artifacts.slice(0, dense ? 8 : 6).map((row) => (
                                    <ExplorerRow
                                        key={`artifact-${row.name}`}
                                        row={{ ...row, type: 'Artifact' }}
                                        tile={!dense}
                                        note={`${row.total} matches · ${row.winRate}% win rate`}
                                        onClick={() => onDrillDown(row.name, 'Artifact')}
                                    />
                                ))}
                                {cockpitModel.hazards.artifacts.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No artifact rows in this scope.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                    </div>
                </ExplorerSection>

                <ExplorerSection
                    dense={dense}
                    title="Equipment, perks, and loadouts"
                    subtitle="Equipment and perks are split for quicker scanning; combos show frequent pairings."
                    icon={<Package2 size={18} />}
                >
                    <div className={dense ? 'space-y-3' : 'flex flex-col gap-4'}>
                        <div className={dense ? 'space-y-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
                            <SectionBlock dense={dense} title="Equipment" emptyLabel="No equipment rows yet.">
                                <>
                                    {equipmentRows.map((row) => (
                                        <ExplorerRow
                                            key={`equipment-${row.name}`}
                                            row={row}
                                            tile={!dense}
                                            note={`${row.total} matches · ${row.winRate}% win rate`}
                                            onClick={() => onDrillDown(row.name, 'Equipment')}
                                        />
                                    ))}
                                    {equipmentRows.length === 0 ? (
                                        <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No equipment rows yet.</div>
                                    ) : null}
                                </>
                            </SectionBlock>
                            <SectionBlock dense={dense} title="Perks" emptyLabel="No perk rows yet.">
                                <>
                                    {perkRows.map((row) => (
                                        <ExplorerRow
                                            key={`perk-${row.name}`}
                                            row={row}
                                            tile={!dense}
                                            note={`${row.total} matches · ${row.winRate}% win rate`}
                                            onClick={() => onDrillDown(row.name, 'Perk')}
                                        />
                                    ))}
                                    {perkRows.length === 0 ? (
                                        <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No perk rows yet.</div>
                                    ) : null}
                                </>
                            </SectionBlock>
                        </div>
                        <SectionBlock dense={dense} title="Signature loadouts" emptyLabel="No loadout combinations yet.">
                            <>
                                {comboRows.map((combo) => (
                                    <ComboRow key={combo.label} combo={combo} tile={!dense} />
                                ))}
                                {comboRows.length === 0 ? (
                                    <div className="text-label-sm text-md-sys-on-surface/45 sm:col-span-2">No loadout combinations yet.</div>
                                ) : null}
                            </>
                        </SectionBlock>
                    </div>
                </ExplorerSection>

            </section>
        </div>
    );
};
