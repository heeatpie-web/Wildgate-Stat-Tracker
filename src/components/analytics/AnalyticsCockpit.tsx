import React, { useMemo } from 'react';
import type { AnalyticsView, DrillDownTarget, Match, VisualMode } from '../../types';
import {
    AlertTriangle,
    Crosshair,
    Handshake,
    Package2,
    Rocket,
    ShieldPlus,
    Sparkles,
    Swords,
    Target,
    User,
} from 'lucide-react';
import { buildDrillDownModel, type DrillDownComboRow, type DrillDownRow } from '../../utils/analyticsDrilldown';

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
}

const SummaryTile: React.FC<{
    label: string;
    value: string;
    tone?: string;
    helper?: string;
    className?: string;
}> = ({ label, value, tone = 'text-md-sys-on-surface', helper, className = '' }) => (
    <div className={`rounded-card border border-md-sys-outline/12 bg-md-sys-surface-container-high px-4 py-3 ${className}`}>
        <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/45">{label}</div>
        <div className={`mt-1 text-2xl font-black tracking-tight ${tone}`}>{value}</div>
        {helper ? <div className="mt-1 text-label-sm text-md-sys-on-surface/60">{helper}</div> : null}
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
    const className = `group relative overflow-hidden rounded-card border border-md-sys-outline/12 p-4 text-left transition-all ${
        isInteractive
            ? 'cursor-pointer bg-md-sys-surface hover:border-md-sys-primary/25 hover:shadow-lg'
            : 'bg-md-sys-surface-container-high'
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
}> = ({ row, note, onClick }) => {
    const baseClassName = `w-full flex items-center justify-between gap-3 rounded-control px-3 py-2 text-left transition-colors ${
        onClick
            ? 'hover:bg-md-sys-surface-container-high cursor-pointer'
            : 'cursor-default'
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
                <div className={`text-label-sm font-black ${row.winRate >= 50 ? 'text-md-sys-primary' : 'text-danger'}`}>
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

const ComboRow: React.FC<{ combo: DrillDownComboRow }> = ({ combo }) => (
    <div className="rounded-control px-3 py-2 border border-md-sys-outline/10 bg-md-sys-surface-container-high">
        <div className="text-label-sm font-semibold text-md-sys-on-surface line-clamp-2">{combo.label}</div>
        <div className="mt-1 text-label-xs text-md-sys-on-surface/55">
            {combo.total} matches · {combo.winRate}% win rate
        </div>
    </div>
);

const ExplorerSection: React.FC<{
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, icon, children }) => (
    <section className="rounded-card border border-md-sys-outline/12 bg-md-sys-surface p-4">
        <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-md-sys-surface-container-high flex items-center justify-center text-md-sys-primary">
                {icon}
            </div>
            <div className="min-w-0">
                <h3 className="text-body font-black tracking-tight text-md-sys-on-surface">{title}</h3>
                <div className="text-label-sm text-md-sys-on-surface/58">{subtitle}</div>
            </div>
        </div>
        <div className="mt-4 space-y-3">
            {children}
        </div>
    </section>
);

const SectionBlock: React.FC<{
    title: string;
    emptyLabel: string;
    children: React.ReactNode;
}> = ({ title, emptyLabel, children }) => (
    <div>
        <div className="mb-2 text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/42">{title}</div>
        <div className="space-y-1.5">
            {children || <div className="text-label-sm text-md-sys-on-surface/45">{emptyLabel}</div>}
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
}) => {
    const dense = visualMode === 'dense';
    const cockpitModel = useMemo(
        () => buildDrillDownModel(filteredMatches, { type: 'KPI', name: 'cockpit' }),
        [filteredMatches]
    );

    const recentDeltaLabel = cockpitModel.summary.trendDelta === 0
        ? 'Flat vs total'
        : `${cockpitModel.summary.trendDelta > 0 ? '+' : ''}${cockpitModel.summary.trendDelta}pp vs total`;

    const bestHazard = cockpitModel.hazards.best.find((row) => row.total >= 2) || cockpitModel.hazards.modifiers[0] || null;
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
                : 'Hazard context appears once reach modifiers are tracked.',
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

    const shipRows = cockpitModel.entities.ships.slice(0, dense ? 4 : 6);
    const heroRows = cockpitModel.entities.heroes.slice(0, dense ? 4 : 6);
    const teammateRows = cockpitModel.people.teammates
        .slice()
        .sort((left, right) => {
            if (right.total !== left.total) return right.total - left.total;
            return right.winRate - left.winRate;
        })
        .slice(0, dense ? 4 : 6);
    const opponentRows = cockpitModel.people.opponents
        .slice()
        .sort((left, right) => {
            if (left.winRate !== right.winRate) return left.winRate - right.winRate;
            return right.total - left.total;
        })
        .slice(0, dense ? 4 : 6);
    const weaponRows = cockpitModel.loadouts.weapons.slice(0, dense ? 4 : 6);
    const shipWeaponRows = cockpitModel.loadouts.shipWeapons.slice(0, dense ? 3 : 4);
    const hazardRows = cockpitModel.hazards.modifiers.slice(0, dense ? 4 : 6);
    const equipmentRows = cockpitModel.loadouts.equipment.slice(0, 3);
    const perkRows = cockpitModel.loadouts.perks.slice(0, 3);
    const comboRows = cockpitModel.loadouts.combos.slice(0, dense ? 2 : 4);

    return (
        <div className="flex flex-col gap-4 pb-6">
            <section className="rounded-card border border-md-sys-outline/12 bg-md-sys-surface p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                        <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/42">
                            Analytics cockpit
                        </div>
                        <h2 className="mt-1 text-heading font-black tracking-tight text-md-sys-on-surface">
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
                                className="rounded-pill bg-md-sys-primary/10 px-3 py-1 text-label-sm font-bold text-md-sys-primary"
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

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <SummaryTile
                        label="Win rate"
                        value={`${winRate}%`}
                        tone={winRate >= 50 ? 'text-md-sys-primary' : 'text-danger'}
                        helper={`${cockpitModel.summary.wins} wins / ${cockpitModel.summary.losses} losses`}
                    />
                    <SummaryTile label="Matches" value={String(totalMatches)} helper="Completed matches in current scope" />
                    <SummaryTile
                        label="Recent form"
                        value={`${cockpitModel.summary.recentWinRate}%`}
                        tone={cockpitModel.summary.trendDelta >= 0 ? 'text-md-sys-primary' : 'text-danger'}
                        helper={recentDeltaLabel}
                    />
                    <SummaryTile label="Momentum" value={String(momentum?.currentMomentum ?? 0)} helper="Current momentum score" />
                    <SummaryTile label="Avg kills" value={String(cockpitModel.summary.avgKills)} helper="Per match in current scope" />
                    <SummaryTile
                        label="Avg place"
                        value={cockpitModel.summary.avgPlacement != null ? `#${cockpitModel.summary.avgPlacement}` : 'N/A'}
                        helper={`Placement view avg: #${placementData?.avgPlacement ?? 0}`}
                    />
                </div>
            </section>

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

            <section className="grid gap-4 xl:grid-cols-2">
                <ExplorerSection
                    title="Ships and heroes"
                    subtitle="Jump from your main picks into deeper context."
                    icon={<Rocket size={18} />}
                >
                    <SectionBlock title="Ships" emptyLabel="No ship rows yet.">
                        <>
                            {shipRows.map((row) => (
                                <ExplorerRow
                                    key={`ship-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.avgKills} kills avg`}
                                    onClick={() => onDrillDown(row.name, 'Ship')}
                                />
                            ))}
                            {shipRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No ship rows yet.</div> : null}
                        </>
                    </SectionBlock>
                    <SectionBlock title="Heroes" emptyLabel="No hero rows yet.">
                        <>
                            {heroRows.map((row) => (
                                <ExplorerRow
                                    key={`hero-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                    onClick={() => onDrillDown(row.name, 'Hero')}
                                />
                            ))}
                            {heroRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No hero rows yet.</div> : null}
                        </>
                    </SectionBlock>
                </ExplorerSection>

                <ExplorerSection
                    title="People"
                    subtitle="See who raises your floor and who drags the win rate down."
                    icon={<Handshake size={18} />}
                >
                    <SectionBlock title="Wingmen" emptyLabel="No teammate trends yet.">
                        <>
                            {teammateRows.map((row) => (
                                <ExplorerRow
                                    key={`ally-${row.name}`}
                                    row={row}
                                    note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                    onClick={() => onDrillDown(row.name, 'Teammate')}
                                />
                            ))}
                            {teammateRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No teammate trends yet.</div> : null}
                        </>
                    </SectionBlock>
                    <SectionBlock title="Rivals" emptyLabel="No opponent trends yet.">
                        <>
                            {opponentRows.map((row) => (
                                <ExplorerRow
                                    key={`opponent-${row.name}`}
                                    row={row}
                                    note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                    onClick={() => onDrillDown(row.name, 'Opponent')}
                                />
                            ))}
                            {opponentRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No opponent trends yet.</div> : null}
                        </>
                    </SectionBlock>
                </ExplorerSection>

                <ExplorerSection
                    title="Weapons and conditions"
                    subtitle="Open a weapon or hazard to see the surrounding people and loadouts."
                    icon={<Target size={18} />}
                >
                    <SectionBlock title="Prospector weapons" emptyLabel="No prospector weapon trends yet.">
                        <>
                            {weaponRows.map((row) => (
                                <ExplorerRow
                                    key={`weapon-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.avgDamage} avg damage`}
                                    onClick={() => onDrillDown(row.name, 'Weapon')}
                                />
                            ))}
                            {weaponRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No prospector weapon trends yet.</div> : null}
                        </>
                    </SectionBlock>
                    <SectionBlock title="Ship weapons" emptyLabel="No ship weapon trends yet.">
                        <>
                            {shipWeaponRows.map((row) => (
                                <ExplorerRow
                                    key={`ship-weapon-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.avgDamage} avg damage`}
                                    onClick={() => onDrillDown(row.name, 'Weapon')}
                                />
                            ))}
                            {shipWeaponRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No ship weapon trends yet.</div> : null}
                        </>
                    </SectionBlock>
                    <SectionBlock title="Hazards and artifacts" emptyLabel="No hazard trends yet.">
                        <>
                            {hazardRows.map((row) => (
                                <ExplorerRow
                                    key={`hazard-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                                    onClick={() => onDrillDown(row.name, 'Modifier')}
                                />
                            ))}
                            {cockpitModel.hazards.artifacts.slice(0, 3).map((row) => (
                                <ExplorerRow
                                    key={`artifact-${row.name}`}
                                    row={{ ...row, type: 'Artifact' }}
                                    note={`${row.total} matches · ${row.winRate}% win rate`}
                                    onClick={() => onDrillDown(row.name, 'Artifact')}
                                />
                            ))}
                            {hazardRows.length === 0 && cockpitModel.hazards.artifacts.length === 0 ? (
                                <div className="text-label-sm text-md-sys-on-surface/45">No hazard trends yet.</div>
                            ) : null}
                        </>
                    </SectionBlock>
                </ExplorerSection>

                <ExplorerSection
                    title="Equipment, perks, and loadouts"
                    subtitle="Keep the normalized names, but surface them in a more readable way."
                    icon={<Package2 size={18} />}
                >
                    <SectionBlock title="Equipment and perks" emptyLabel="No equipment or perk rows yet.">
                        <>
                            {equipmentRows.map((row) => (
                                <ExplorerRow
                                    key={`equipment-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.winRate}% win rate`}
                                    onClick={() => onDrillDown(row.name, 'Equipment')}
                                />
                            ))}
                            {perkRows.map((row) => (
                                <ExplorerRow
                                    key={`perk-${row.name}`}
                                    row={row}
                                    note={`${row.total} matches · ${row.winRate}% win rate`}
                                    onClick={() => onDrillDown(row.name, 'Perk')}
                                />
                            ))}
                            {equipmentRows.length === 0 && perkRows.length === 0 ? (
                                <div className="text-label-sm text-md-sys-on-surface/45">No equipment or perk rows yet.</div>
                            ) : null}
                        </>
                    </SectionBlock>
                    <SectionBlock title="Signature loadouts" emptyLabel="No loadout combinations yet.">
                        <>
                            {comboRows.map((combo) => (
                                <ComboRow key={combo.label} combo={combo} />
                            ))}
                            {comboRows.length === 0 ? <div className="text-label-sm text-md-sys-on-surface/45">No loadout combinations yet.</div> : null}
                        </>
                    </SectionBlock>
                </ExplorerSection>

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
                                className="rounded-control border border-md-sys-outline/12 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
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
                    <div className="rounded-control border border-md-sys-outline/12 bg-md-sys-surface-container-high px-3 py-3">
                        <div className="flex items-center gap-2 text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/50">
                            <ShieldPlus size={14} />
                            Suggested next drill-down
                        </div>
                        <div className="mt-2 text-body font-semibold text-md-sys-on-surface">
                            {bestHazard?.name || cockpitModel.entities.ships[0]?.name || strongestLoadoutSignal?.name || 'Capture more matches'}
                        </div>
                        <div className="mt-1 text-label-sm text-md-sys-on-surface/58">
                            Use the focus cards above to keep moving through related hazards, people, and loadouts without leaving the cockpit.
                        </div>
                    </div>
                </ExplorerSection>
            </section>
        </div>
    );
};
