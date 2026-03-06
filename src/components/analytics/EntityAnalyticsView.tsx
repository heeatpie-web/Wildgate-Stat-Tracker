import React from 'react';
import type { DrillDownTarget, EntityAnalyticsData, EntityComparison, EntityMetricRow } from '../../types';

interface EntityAnalyticsViewProps {
    data: EntityAnalyticsData;
    onDrillDown?: (name: string, type: DrillDownTarget['type']) => void;
}

const renderDelta = (comparison: EntityComparison) => {
    if (comparison.gated || comparison.absoluteDelta == null || comparison.relativeDelta == null) {
        return <span className="text-label-sm text-warning">{comparison.gateReason || 'Insufficient sample'}</span>;
    }
    const tone = comparison.absoluteDelta >= 0 ? 'text-success' : 'text-danger';
    return (
        <span className={`text-label-sm font-bold ${tone}`}>
            {comparison.absoluteDelta > 0 ? '+' : ''}{comparison.absoluteDelta.toFixed(1)}pp ({comparison.relativeDelta > 0 ? '+' : ''}{comparison.relativeDelta.toFixed(1)}%)
        </span>
    );
};

const renderRows = (
    rows: EntityMetricRow[],
    targetType?: DrillDownTarget['type'],
    onDrillDown?: (name: string, type: DrillDownTarget['type']) => void
) => {
    if (rows.length === 0) {
        return <div className="text-label-sm text-md-sys-on-surface/50">No rows meet minimum sample.</div>;
    }
    return (
        <div className="space-y-2">
            {rows.map((row) => (
                <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                        if (!targetType || !onDrillDown) return;
                        onDrillDown(row.label, targetType);
                    }}
                    className={`md3-card rounded-card p-2 flex items-center justify-between gap-2 w-full text-left ${targetType && onDrillDown ? 'hover:bg-md-sys-surface-container-highest' : ''}`}
                >
                    <div className="min-w-0">
                        <div className="text-label-sm font-bold truncate">{row.label}</div>
                        <div className="text-label-xs text-md-sys-on-surface/60">
                            Usage {row.usageRate.toFixed(1)}% · Win {row.winRate.toFixed(1)}% · n={row.sampleCount}
                            {row.lowSample && <span className="ml-2 text-warning">Low sample</span>}
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
};

export const EntityAnalyticsView: React.FC<EntityAnalyticsViewProps> = ({ data, onDrillDown }) => {
    return (
        <div className="space-y-3">
            <div className="md3-card rounded-card p-3">
                <div className="text-label-sm font-bold uppercase opacity-60 mb-1">Comparisons</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[data.comparisons.periodVsPrevious, data.comparisons.selectedPerkSetVsAll, data.comparisons.selectedLoadoutVsGlobal].map((comparison) => (
                        <div key={comparison.label} className="md3-surface rounded-card p-2">
                            <div className="text-label-sm font-bold">{comparison.label}</div>
                            <div className="text-label-xs text-md-sys-on-surface/60 mt-1">
                                Selected n={comparison.selectedSample} · Baseline n={comparison.baselineSample}
                            </div>
                            <div className="mt-1">{renderDelta(comparison)}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="md3-card rounded-card p-3">
                    <div className="text-label-sm font-bold uppercase opacity-60 mb-2">Ships</div>
                    {renderRows(data.dimensions.ship, 'Ship', onDrillDown)}
                </div>
                <div className="md3-card rounded-card p-3">
                    <div className="text-label-sm font-bold uppercase opacity-60 mb-2">Prospector Weapons</div>
                    {renderRows(data.dimensions.prospectorWeapon, 'Weapon', onDrillDown)}
                </div>
                <div className="md3-card rounded-card p-3">
                    <div className="text-label-sm font-bold uppercase opacity-60 mb-2">Equipment</div>
                    {renderRows(data.dimensions.equipment, 'Equipment', onDrillDown)}
                </div>
                <div className="md3-card rounded-card p-3">
                    <div className="text-label-sm font-bold uppercase opacity-60 mb-2">Perks</div>
                    {renderRows(data.dimensions.perk, 'Perk', onDrillDown)}
                </div>
            </div>
        </div>
    );
};
