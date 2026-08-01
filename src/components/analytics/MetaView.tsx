import React from 'react';
import { MetaAnalyticsData, VisualMode, PIE_COLORS } from '../../types';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend,
} from 'recharts';
import { Ship, Clock, Crosshair, BarChart2 } from 'lucide-react';

const TOOLTIP_STYLE = {
    backgroundColor: 'var(--md-sys-color-surface-container-high)',
    borderRadius: '12px',
    border: '1px solid var(--md-sys-color-outline-variant)',
    fontSize: '12px',
};

function shipColor(ship: string): string {
    if (!ship) return PIE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < ship.length; i++) hash = ship.charCodeAt(i) + ((hash << 5) - hash);
    return PIE_COLORS[Math.abs(hash % PIE_COLORS.length)];
}

function winRateColorClass(rate: number): string {
    if (rate >= 55) return 'text-success';
    if (rate >= 45) return 'text-warning';
    return 'text-danger';
}

function fmtDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

interface SectionProps { title: string; icon: React.ReactNode; children: React.ReactNode; }
const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
    <div className="md3-card rounded-card p-4">
        <div className="flex items-center gap-2 mb-4">
            <span className="text-md-sys-primary">{icon}</span>
            <h3 className="text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/70">{title}</h3>
        </div>
        {children}
    </div>
);

interface MetaViewProps {
    data: MetaAnalyticsData;
    visualMode: VisualMode;
}

export const MetaView: React.FC<MetaViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';

    if (data.totalMatches === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-md-sys-on-surface/40 text-label-sm font-mono uppercase tracking-wider">
                No match data available
            </div>
        );
    }

    const avgMin = Math.floor(data.avgMatchDurationSec / 60);
    const avgSec = data.avgMatchDurationSec % 60;

    return (
        <div className={`space-y-4 ${dense ? '' : 'max-w-4xl mx-auto'}`}>
            {/* Summary stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total Matches', value: data.totalMatches },
                    { label: 'Avg Enemy Ships Seen', value: data.avgShipsPerMatch },
                    { label: 'Avg Duration', value: data.avgMatchDurationSec > 0 ? `${avgMin}m ${avgSec.toString().padStart(2, '0')}s` : '—' },
                    { label: 'Ship Types Piloted', value: data.yourShipUsage.length },
                ].map(({ label, value }) => (
                    <div key={label} className="md3-card rounded-card p-3 text-center">
                        <div className="text-2xl font-black text-md-sys-on-surface tabular-nums">{value}</div>
                        <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/50 mt-1">{label}</div>
                    </div>
                ))}
            </div>

            <div className={`grid gap-4 ${dense ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Your ship usage */}
                <Section title="Your Ship Usage" icon={<Ship size={16} />}>
                    {data.yourShipUsage.length === 0 ? (
                        <p className="text-label-sm text-md-sys-on-surface/40">No data</p>
                    ) : (
                        <div className="space-y-2">
                            {data.yourShipUsage.map((s) => (
                                <div key={s.ship} className="flex items-center gap-2">
                                    <div className="w-24 shrink-0 text-label-sm font-bold text-md-sys-on-surface/80 truncate">{s.ship}</div>
                                    <div className="flex-1 h-5 rounded-full bg-md-sys-surface-container overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${s.pct}%`, backgroundColor: shipColor(s.ship) }}
                                        />
                                    </div>
                                    <div className="w-10 text-right text-label-xs font-mono text-md-sys-on-surface/60">{s.pct}%</div>
                                    <div className="w-12 text-right text-label-xs font-bold tabular-nums">
                                        <span className={winRateColorClass(s.winRate)}>{s.winRate}%</span>
                                        <span className="text-md-sys-on-surface/30 ml-0.5">WR</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* Enemy ship encounter rates */}
                <Section title="Enemy Ships Encountered" icon={<Crosshair size={16} />}>
                    {data.shipPopularity.length === 0 ? (
                        <p className="text-label-sm text-md-sys-on-surface/40">No data</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart
                                data={data.shipPopularity.slice(0, 8)}
                                layout="vertical"
                                margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
                            >
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="ship"
                                    width={90}
                                    tick={{ fontSize: 11, fill: 'var(--md-sys-color-on-surface)', opacity: 0.7 }}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val: number, _name: string, props: { payload?: { winRate?: number } }) =>
                                        [`${val} matches (${props.payload?.winRate ?? 0}% WR)`, 'Encounters']
                                    }
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {data.shipPopularity.slice(0, 8).map((s) => (
                                        <Cell key={s.ship} fill={shipColor(s.ship)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Section>

                {/* Match duration distribution */}
                <Section title="Match Duration Distribution" icon={<Clock size={16} />}>
                    {data.durationBuckets.every(b => b.count === 0) ? (
                        <p className="text-label-sm text-md-sys-on-surface/40">No duration data recorded</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={data.durationBuckets} margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface)', opacity: 0.6 }}
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(val: number, _name: string, props: { payload?: { winRate?: number } }) =>
                                        [`${val} matches (${props.payload?.winRate ?? 0}% WR)`, 'Matches']
                                    }
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {data.durationBuckets.map((b) => (
                                        <Cell
                                            key={b.label}
                                            fill={b.count === 0
                                                ? 'var(--md-sys-color-outline-variant)'
                                                : b.winRate >= 55 ? 'var(--md-sys-color-success)'
                                                : b.winRate >= 45 ? 'var(--md-sys-color-warning)'
                                                : 'var(--md-sys-color-danger)'}
                                            opacity={0.85}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {data.avgMatchDurationSec > 0 && (
                        <p className="text-label-xs text-md-sys-on-surface/50 mt-2 text-center font-mono">
                            Avg: {fmtDuration(data.avgMatchDurationSec)}
                        </p>
                    )}
                </Section>

                {/* Mode split + kills by ship */}
                <div className="space-y-4">
                    <Section title="Mode Split" icon={<BarChart2 size={16} />}>
                        {data.modeSplit.length === 0 ? (
                            <p className="text-label-sm text-md-sys-on-surface/40">No data</p>
                        ) : (
                            <div className="flex items-center gap-4">
                                <ResponsiveContainer width={120} height={120}>
                                    <PieChart>
                                        <Pie
                                            data={data.modeSplit}
                                            dataKey="count"
                                            nameKey="mode"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={32}
                                            outerRadius={52}
                                        >
                                            {data.modeSplit.map((m, i) => (
                                                <Cell key={m.mode} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="flex-1 space-y-2">
                                    {data.modeSplit.map((m, i) => (
                                        <div key={m.mode} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                            <span className="text-label-sm font-bold text-md-sys-on-surface/80 flex-1 truncate">{m.mode}</span>
                                            <span className="text-label-xs tabular-nums text-md-sys-on-surface/50">{m.pct}%</span>
                                            <span className={`text-label-xs tabular-nums font-bold ${winRateColorClass(m.winRate)}`}>{m.winRate}% WR</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Section>

                    {data.killsByEnemyShip.length > 0 && (
                        <Section title="Kills by Enemy Ship" icon={<Crosshair size={16} />}>
                            <div className="space-y-1.5">
                                {data.killsByEnemyShip.slice(0, 6).map((s) => (
                                    <div key={s.ship} className="flex items-center gap-2">
                                        <div className="w-24 shrink-0 text-label-sm font-bold text-md-sys-on-surface/80 truncate">{s.ship}</div>
                                        <div className="flex-1 h-4 rounded-full bg-md-sys-surface-container overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${Math.round((s.count / (data.killsByEnemyShip[0]?.count || 1)) * 100)}%`,
                                                    backgroundColor: shipColor(s.ship),
                                                }}
                                            />
                                        </div>
                                        <div className="w-8 text-right text-label-xs font-mono font-bold text-md-sys-on-surface/70">{s.count}</div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
            </div>
        </div>
    );
};
