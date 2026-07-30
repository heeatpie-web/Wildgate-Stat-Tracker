import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import type { DrillDownTarget, EntityAnalyticsData, EntityComparison, EntityMetricRow } from '../../types';

interface EntityAnalyticsViewProps {
    data: EntityAnalyticsData;
    onDrillDown?: (name: string, type: DrillDownTarget['type']) => void;
}

const DEFAULT_VISIBLE = 5;

function winRateColor(rate: number): string {
    if (rate >= 55) return 'bg-success';
    if (rate >= 45) return 'bg-md-sys-primary';
    if (rate >= 35) return 'bg-warning';
    return 'bg-danger';
}

function winRateTextColor(rate: number): string {
    if (rate >= 55) return 'text-success';
    if (rate >= 45) return 'text-md-sys-primary';
    if (rate >= 35) return 'text-warning';
    return 'text-danger';
}

interface EntityRowsProps {
    rows: EntityMetricRow[];
    targetType?: DrillDownTarget['type'];
    onDrillDown?: (name: string, type: DrillDownTarget['type']) => void;
}

const EntityRows: React.FC<EntityRowsProps> = ({ rows, targetType, onDrillDown }) => {
    const [expanded, setExpanded] = useState(false);

    if (rows.length === 0) {
        return (
            <div className="py-4 text-center text-label-sm text-md-sys-on-surface/40 font-medium">
                No rows meet minimum sample.
            </div>
        );
    }

    const visible = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE);
    const hidden = rows.length - DEFAULT_VISIBLE;

    return (
        <div>
            <div className="space-y-1">
                {visible.map((row) => {
                    const isDrillable = !!targetType && !!onDrillDown;
                    return (
                        <button
                            key={row.key}
                            type="button"
                            disabled={!isDrillable}
                            onClick={() => isDrillable && onDrillDown!(row.label, targetType!)}
                            className={`group w-full rounded-control px-3 py-2.5 text-left transition-all ${
                                isDrillable
                                    ? 'hover:bg-md-sys-surfaceContainerHighest cursor-pointer'
                                    : 'cursor-default'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Name + secondary info */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-label-sm font-bold text-md-sys-on-surface truncate">
                                            {row.label}
                                        </span>
                                        {row.lowSample && (
                                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-warning bg-warning/10 px-1.5 py-0.5 rounded-pill">
                                                Low sample
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-label-xs text-md-sys-on-surface/45 mt-0.5">
                                        {row.usageRate.toFixed(1)}% usage · {row.sampleCount} matches
                                    </div>
                                </div>

                                {/* Win rate bar + badge */}
                                <div className="shrink-0 flex items-center gap-2 w-40">
                                    <div className="flex-1 h-1.5 rounded-full bg-md-sys-outline/15 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${row.lowSample ? 'bg-md-sys-outline/30' : winRateColor(row.winRate)}`}
                                            style={{ width: `${Math.min(row.winRate, 100)}%` }}
                                        />
                                    </div>
                                    <span className={`text-label-sm font-black w-9 text-right tabular-nums ${row.lowSample ? 'text-md-sys-on-surface/40' : winRateTextColor(row.winRate)}`}>
                                        {row.winRate.toFixed(0)}%
                                    </span>
                                </div>

                                {/* Drilldown arrow */}
                                {isDrillable && (
                                    <ChevronRight
                                        size={14}
                                        className="shrink-0 text-md-sys-on-surface/25 group-hover:text-md-sys-primary transition-colors"
                                    />
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {rows.length > DEFAULT_VISIBLE && (
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-control text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/50 hover:text-md-sys-on-surface/80 hover:bg-md-sys-surfaceContainerHigh transition-all"
                >
                    {expanded ? (
                        <><ChevronUp size={12} /> Show less</>
                    ) : (
                        <><ChevronDown size={12} /> Show {hidden} more</>
                    )}
                </button>
            )}
        </div>
    );
};

interface ComparisonTileProps {
    comparison: EntityComparison;
}

const ComparisonTile: React.FC<ComparisonTileProps> = ({ comparison }) => {
    const hasData = !comparison.gated && comparison.absoluteDelta != null && comparison.relativeDelta != null;
    const positive = hasData && comparison.absoluteDelta! >= 0;

    return (
        <div className="rounded-card border border-md-sys-outline/10 bg-md-sys-surface-container px-4 py-3 flex flex-col gap-1">
            <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/40">
                {comparison.label}
            </div>
            {hasData ? (
                <>
                    <div className={`flex items-center gap-1.5 text-2xl font-black tracking-tight ${positive ? 'text-success' : 'text-danger'}`}>
                        {positive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                        {positive ? '+' : ''}{comparison.absoluteDelta!.toFixed(1)}pp
                    </div>
                    <div className="text-label-xs text-md-sys-on-surface/50">
                        {positive ? '+' : ''}{comparison.relativeDelta!.toFixed(1)}% relative ·
                        selected n={comparison.selectedSample}, base n={comparison.baselineSample}
                    </div>
                </>
            ) : (
                <>
                    <div className="text-lg font-black text-md-sys-on-surface/40">—</div>
                    <div className="text-label-xs text-warning">
                        {comparison.gateReason || 'Insufficient sample'}
                    </div>
                </>
            )}
        </div>
    );
};

const SECTION_LABELS: Record<string, string> = {
    ship: 'Ships',
    prospectorWeapon: 'Prospector Weapons',
    equipment: 'Equipment',
    perk: 'Perks',
    category: 'Categories',
};

const SECTION_TYPES: Record<string, DrillDownTarget['type']> = {
    ship: 'Ship',
    prospectorWeapon: 'Weapon',
    equipment: 'Equipment',
    perk: 'Perk',
    category: 'Category',
};

export const EntityAnalyticsView: React.FC<EntityAnalyticsViewProps> = ({ data, onDrillDown }) => {
    const dimensions = data.dimensions as Record<string, EntityMetricRow[]>;

    return (
        <div className="space-y-3">
            {/* Comparisons — KPI tile row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                    data.comparisons.periodVsPrevious,
                    data.comparisons.selectedPerkSetVsAll,
                    data.comparisons.selectedLoadoutVsGlobal,
                ].map((comparison) => (
                    <ComparisonTile key={comparison.label} comparison={comparison} />
                ))}
            </div>

            {/* Dimension sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Object.entries(SECTION_LABELS).map(([key, label]) => {
                    const rows: EntityMetricRow[] = dimensions[key] ?? [];
                    return (
                        <div key={key} className="rounded-card border border-md-sys-outline/10 bg-md-sys-surface-container overflow-hidden">
                            <div className="px-4 pt-3 pb-2 border-b border-md-sys-outline/8 flex items-center justify-between">
                                <span className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/40">
                                    {label}
                                </span>
                                <span className="text-label-xs text-md-sys-on-surface/30 font-medium">
                                    {rows.length} entries
                                </span>
                            </div>
                            <div className="px-1 py-1">
                                <EntityRows
                                    rows={rows}
                                    targetType={SECTION_TYPES[key]}
                                    onDrillDown={onDrillDown}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
