import React, { useEffect, useId, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    Crosshair,
    Gauge,
    Handshake,
    Package2,
    Rocket,
    ShieldPlus,
    Swords,
    User,
    X,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { DrillDownTarget } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { buildDrillDownModel, type DrillDownMatchRow, type DrillDownRow } from '../utils/analyticsDrilldown';
import { buildAnalyticsIdentityResolver } from '../utils/analyticsIdentity';

type OverlayTab = 'overview' | 'people' | 'hazards' | 'loadouts' | 'matches';

const targetKey = (target: DrillDownTarget | null | undefined): string => {
    if (!target) return '';
    const matchIdKey = Array.isArray(target.matchIds) ? target.matchIds.join(',') : '';
    const encounterScopeKey = target.encounterScope || '';
    return `${target.type}:${target.name}:${matchIdKey}:${encounterScopeKey}`;
};

const formatTargetType = (type: DrillDownTarget['type']): string => {
    if (type === 'Teammate') return 'Wingman';
    if (type === 'Opponent') return 'Rival';
    return type;
};

const tabLabelMap: Record<OverlayTab, string> = {
    overview: 'Overview',
    people: 'People',
    hazards: 'Hazards',
    loadouts: 'Loadouts',
    matches: 'Matches',
};

const RailStat: React.FC<{
    label: string;
    value: string;
    tone?: string;
}> = ({ label, value, tone = 'text-md-sys-on-surface' }) => (
    <div className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-2">
        <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/45">{label}</div>
        <div className={`mt-1 text-title font-black tracking-tight ${tone}`}>{value}</div>
    </div>
);

const TabButton: React.FC<{
    tab: OverlayTab;
    active: boolean;
    onClick: () => void;
}> = ({ tab, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-control px-3 py-2 text-label-sm font-bold uppercase tracking-wide transition-colors ${
            active
                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                : 'bg-md-sys-surface-container-high text-md-sys-on-surface/70 hover:bg-md-sys-surface-container-highest'
        }`}
    >
        {tabLabelMap[tab]}
    </button>
);

const DrillRowButton: React.FC<{
    row: DrillDownRow;
    note: string;
    onClick: () => void;
}> = ({ row, note, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="w-full rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-2 text-left hover:bg-md-sys-surface-container-highest"
    >
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-label-sm font-bold text-md-sys-on-surface truncate">{row.name}</div>
                <div className="text-label-xs text-md-sys-on-surface/55 truncate">{note}</div>
            </div>
            <div className="shrink-0 text-right">
                <div className={`text-label-sm font-black ${row.winRate >= 50 ? 'text-md-sys-primary' : 'text-danger'}`}>{row.winRate}%</div>
                <div className="text-label-xs text-md-sys-on-surface/45">{row.total}x</div>
            </div>
        </div>
    </button>
);

const MatchCard: React.FC<{
    row: DrillDownMatchRow;
    onShipClick: () => void;
    onHeroClick: () => void;
}> = ({ row, onShipClick, onHeroClick }) => (
    <div className="rounded-card border border-md-sys-outline/10 bg-md-sys-surface-container-high p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
                <span className={`rounded-pill px-2 py-0.5 text-label-xs font-bold uppercase tracking-wide ${
                    row.result === 'Win'
                        ? 'bg-success/15 text-success'
                        : row.result === 'Loss'
                            ? 'bg-danger/15 text-danger'
                            : 'bg-md-sys-primary/12 text-md-sys-primary'
                }`}>
                    {row.result}
                </span>
                <span className="text-label-sm text-md-sys-on-surface/60">{row.dateLabel}</span>
            </div>
            <div className="text-label-xs text-md-sys-on-surface/45">Match #{row.id}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onShipClick} className="rounded-pill bg-md-sys-primary/10 px-2.5 py-1 text-label-sm font-bold text-md-sys-primary hover:bg-md-sys-primary/16">
                {row.ship}
            </button>
            <button type="button" onClick={onHeroClick} className="rounded-pill bg-info-soft px-2.5 py-1 text-label-sm font-bold text-info hover:bg-info-soft-strong">
                {row.hero}
            </button>
            {row.placement ? (
                <span className="rounded-pill bg-md-sys-surface px-2.5 py-1 text-label-sm font-bold text-md-sys-on-surface/70">
                    #{row.placement}
                </span>
            ) : null}
            <span className="rounded-pill bg-md-sys-surface px-2.5 py-1 text-label-sm font-bold text-md-sys-on-surface/70">
                {row.kills} kills
            </span>
            <span className="rounded-pill bg-md-sys-surface px-2.5 py-1 text-label-sm font-bold text-md-sys-on-surface/70">
                {row.damage} damage
            </span>
        </div>
        <div className="mt-3 text-label-sm text-md-sys-on-surface/70">
            <span className="font-bold text-md-sys-on-surface">Hazards:</span> {row.hazardSummary}
        </div>
        <div className="mt-1 text-label-sm text-md-sys-on-surface/70">
            <span className="font-bold text-md-sys-on-surface">Loadout:</span> {row.loadoutSummary}
        </div>
    </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
    <div className="rounded-card border border-dashed border-md-sys-outline/18 bg-md-sys-surface-container-high px-4 py-6 text-center text-label-sm text-md-sys-on-surface/48">
        {label}
    </div>
);

const SectionShell: React.FC<{
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, icon, children }) => (
    <section className="rounded-card border border-md-sys-outline/10 bg-md-sys-surface p-4">
        <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-md-sys-surface-container-high flex items-center justify-center text-md-sys-primary">
                {icon}
            </div>
            <div className="min-w-0">
                <h3 className="text-body font-black tracking-tight text-md-sys-on-surface">{title}</h3>
                {subtitle ? <div className="text-label-sm text-md-sys-on-surface/58">{subtitle}</div> : null}
            </div>
        </div>
        <div className="mt-4 space-y-2">
            {children}
        </div>
    </section>
);

export const DrillDownOverlay: React.FC = () => {
    const {
        matches,
        drillDownTarget,
        setDrillDownTarget,
        pilotRegistry,
        pilotAliases,
        playerProfiles,
        knownMappings,
        ocrAliasModel,
    } = useGameData();
    const { activeMode } = useUIState();
    const isOpen = Boolean(drillDownTarget);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
    const [navigationStack, setNavigationStack] = useState<DrillDownTarget[]>([]);
    const [activeTab, setActiveTab] = useState<OverlayTab>('overview');

    const analyticsIdentity = useMemo(() => buildAnalyticsIdentityResolver({
        pilotRegistry,
        pilotAliases,
        knownMappings,
        playerProfiles,
        aliasModel: ocrAliasModel,
    }), [pilotAliases, pilotRegistry, knownMappings, ocrAliasModel, playerProfiles]);

    const canonicalMatches = useMemo(
        () => analyticsIdentity.canonicalizeMatches(matches),
        [analyticsIdentity, matches]
    );

    const canonicalizeTarget = (target: DrillDownTarget | null | undefined): DrillDownTarget | null => {
        if (!target) return null;
        if (target.type !== 'Teammate' && target.type !== 'Opponent') return target;
        const canonicalName = analyticsIdentity.resolveName(target.name) || String(target.name || '').trim();
        return canonicalName === target.name ? target : { ...target, name: canonicalName };
    };

    useKeyboardShortcuts([
        { key: 'Escape', handler: () => setDrillDownTarget(null) },
    ], isOpen);

    const externalTarget = canonicalizeTarget(drillDownTarget);
    const externalTargetKey = targetKey(externalTarget);

    useEffect(() => {
        if (!externalTarget) {
            setNavigationStack([]);
            return;
        }
        setNavigationStack((current) => {
            const top = current[current.length - 1];
            if (top && targetKey(top) === externalTargetKey) return current;
            return [externalTarget];
        });
    }, [externalTarget, externalTargetKey]);

    const currentTarget = navigationStack[navigationStack.length - 1] || externalTarget;
    const currentTargetKey = targetKey(currentTarget);

    useEffect(() => {
        setActiveTab('overview');
    }, [currentTargetKey]);

    const model = useMemo(
        () => (currentTarget ? buildDrillDownModel(canonicalMatches, currentTarget, activeMode) : null),
        [canonicalMatches, currentTarget, activeMode]
    );

    useEffect(() => {
        if (!model) return;
        if (!model.availableTabs.includes(activeTab)) {
            setActiveTab(model.availableTabs[0] || 'overview');
        }
    }, [activeTab, model]);

    if (!drillDownTarget || !currentTarget || !model) return null;

    const pushTarget = (name: string, type: DrillDownTarget['type']) => {
        if (!model.scopedMatchIds.length) return;
        const nextTarget: DrillDownTarget = {
            name,
            type,
            matchIds: model.scopedMatchIds,
        };
        if (targetKey(nextTarget) === currentTargetKey) return;
        setNavigationStack((current) => [...current, nextTarget]);
    };

    const popTarget = () => {
        setNavigationStack((current) => (
            current.length > 1 ? current.slice(0, current.length - 1) : current
        ));
    };

    const bestHazards = model.hazards.best.slice(0, 5);
    const worstHazards = model.hazards.worst.slice(0, 5);
    const bestWingmen = model.people.teammates
        .slice()
        .sort((left, right) => {
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
            return right.total - left.total;
        })
        .slice(0, 6);
    const toughestOpponents = model.people.opponents
        .slice()
        .sort((left, right) => {
            if (left.winRate !== right.winRate) return left.winRate - right.winRate;
            return right.total - left.total;
        })
        .slice(0, 6);
    const impactfulWeapons = model.loadouts.weapons
        .slice()
        .sort((left, right) => {
            if (right.impact !== left.impact) return right.impact - left.impact;
            return right.total - left.total;
        })
        .slice(0, 6);
    const impactfulShipWeapons = model.loadouts.shipWeapons
        .slice()
        .sort((left, right) => {
            if (right.impact !== left.impact) return right.impact - left.impact;
            return right.total - left.total;
        })
        .slice(0, 5);
    const impactfulEquipment = model.loadouts.equipment.slice(0, 5);
    const impactfulPerks = model.loadouts.perks.slice(0, 5);

    const quickLinks = [
        model.entities.ships[0],
        model.entities.heroes[0],
        impactfulWeapons[0],
        bestHazards[0],
        bestWingmen[0],
        toughestOpponents[0],
    ].filter((row): row is DrillDownRow => Boolean(row));

    const renderOverview = () => (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <RailStat
                    label="Recent form"
                    value={`${model.summary.recentWinRate}%`}
                    tone={model.summary.trendDelta >= 0 ? 'text-md-sys-primary' : 'text-danger'}
                />
                <RailStat label="Avg kills" value={String(model.summary.avgKills)} />
                <RailStat label="Avg damage" value={String(model.summary.avgDamage)} />
                <RailStat
                    label="Avg placement"
                    value={model.summary.avgPlacement != null ? `#${model.summary.avgPlacement}` : 'N/A'}
                />
            </div>

            {model.trend.length >= 2 ? (
                <section className="rounded-card border border-md-sys-outline/10 bg-md-sys-surface p-4">
                    <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-on-surface/55">
                        Rolling win rate
                    </div>
                    <div className="mt-4 h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={model.trend}>
                                <defs>
                                    <linearGradient id="drillDownTrendFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeOpacity={0.05} vertical={false} />
                                <XAxis dataKey="index" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '14px', border: 'none' }} />
                                <Area
                                    type="monotone"
                                    dataKey="winRate"
                                    stroke="var(--md-sys-color-primary)"
                                    strokeWidth={3}
                                    fill="url(#drillDownTrendFill)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            ) : (
                <EmptyState label="Not enough matches in this slice to chart a rolling trend yet." />
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                <SectionShell title="Entity context" subtitle="The ships, heroes, and weapons that define this slice." icon={<Gauge size={18} />}>
                    {model.entities.ships.slice(0, 4).map((row) => (
                        <DrillRowButton
                            key={`entity-ship-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.avgKills} kills avg`}
                            onClick={() => pushTarget(row.name, 'Ship')}
                        />
                    ))}
                    {model.entities.heroes.slice(0, 4).map((row) => (
                        <DrillRowButton
                            key={`entity-hero-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                            onClick={() => pushTarget(row.name, 'Hero')}
                        />
                    ))}
                    {model.entities.ships.length === 0 && model.entities.heroes.length === 0 ? <EmptyState label="No ship or hero context available." /> : null}
                </SectionShell>

                <SectionShell title="People context" subtitle="The surrounding roster pressure and support." icon={<Handshake size={18} />}>
                    {bestWingmen.slice(0, 3).map((row) => (
                        <DrillRowButton
                            key={`overview-wing-${row.name}`}
                            row={row}
                            note={`${row.total} encounters · ${row.winRate}% win rate`}
                            onClick={() => pushTarget(row.name, 'Teammate')}
                        />
                    ))}
                    {toughestOpponents.slice(0, 3).map((row) => (
                        <DrillRowButton
                            key={`overview-rival-${row.name}`}
                            row={row}
                            note={`${row.total} encounters · ${row.winRate}% win rate`}
                            onClick={() => pushTarget(row.name, 'Opponent')}
                        />
                    ))}
                    {bestWingmen.length === 0 && toughestOpponents.length === 0 ? <EmptyState label="No people context available for this slice." /> : null}
                </SectionShell>
            </div>
        </div>
    );

    const renderPeople = () => (
        <div className="grid gap-4 xl:grid-cols-2">
            <SectionShell title="Wingmen" subtitle="People you perform best with in this scope." icon={<Handshake size={18} />}>
                {bestWingmen.map((row) => (
                    <DrillRowButton
                        key={`people-wing-${row.name}`}
                        row={row}
                        note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                        onClick={() => pushTarget(row.name, 'Teammate')}
                    />
                ))}
                {bestWingmen.length === 0 ? <EmptyState label="No teammate patterns in this slice." /> : null}
            </SectionShell>
            <SectionShell title="Rivals" subtitle="People who create the toughest matchups here." icon={<Swords size={18} />}>
                {toughestOpponents.map((row) => (
                    <DrillRowButton
                        key={`people-rival-${row.name}`}
                        row={row}
                        note={`${row.total} encounters · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                        onClick={() => pushTarget(row.name, 'Opponent')}
                    />
                ))}
                {toughestOpponents.length === 0 ? <EmptyState label="No opponent patterns in this slice." /> : null}
            </SectionShell>
        </div>
    );

    const renderHazards = () => (
        <div className="grid gap-4 xl:grid-cols-2">
            <SectionShell title="Best hazards" subtitle="Conditions where this scope overperforms baseline." icon={<AlertTriangle size={18} />}>
                {bestHazards.map((row) => (
                    <DrillRowButton
                        key={`best-hazard-${row.name}`}
                        row={row}
                        note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                        onClick={() => pushTarget(row.name, 'Modifier')}
                    />
                ))}
                {bestHazards.length === 0 ? <EmptyState label="No hazard signals to rank yet." /> : null}
            </SectionShell>
            <SectionShell title="Worst hazards" subtitle="Conditions where results dip below baseline." icon={<ShieldPlus size={18} />}>
                {worstHazards.map((row) => (
                    <DrillRowButton
                        key={`worst-hazard-${row.name}`}
                        row={row}
                        note={`${row.total} matches · ${row.impact > 0 ? '+' : ''}${row.impact}pp impact`}
                        onClick={() => pushTarget(row.name, 'Modifier')}
                    />
                ))}
                {worstHazards.length === 0 ? <EmptyState label="No negative hazard signals yet." /> : null}
            </SectionShell>
            <SectionShell title="Artifacts" subtitle="Artifact context in the current scope." icon={<Rocket size={18} />}>
                {model.hazards.artifacts.map((row) => (
                    <DrillRowButton
                        key={`artifact-${row.name}`}
                        row={{ ...row, type: 'Artifact' }}
                        note={`${row.total} matches · ${row.winRate}% win rate`}
                        onClick={() => pushTarget(row.name, 'Artifact')}
                    />
                ))}
                {model.hazards.artifacts.length === 0 ? <EmptyState label="No artifact data inside this scope." /> : null}
            </SectionShell>
        </div>
    );

    const renderLoadouts = () => (
        <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                <SectionShell title="Prospector Weapons" subtitle="Open a weapon to inspect people, hazards, and match context." icon={<Crosshair size={18} />}>
                    {impactfulWeapons.map((row) => (
                        <DrillRowButton
                            key={`weapon-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.avgDamage} avg damage`}
                            onClick={() => pushTarget(row.name, 'Weapon')}
                        />
                    ))}
                    {impactfulWeapons.length === 0 ? <EmptyState label="No prospector weapon rows for this slice." /> : null}
                </SectionShell>
                <SectionShell title="Ship Weapons" subtitle="Secondary armament context for this scope." icon={<Crosshair size={18} />}>
                    {impactfulShipWeapons.map((row) => (
                        <DrillRowButton
                            key={`ship-weapon-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.avgDamage} avg damage`}
                            onClick={() => pushTarget(row.name, 'Weapon')}
                        />
                    ))}
                    {impactfulShipWeapons.length === 0 ? <EmptyState label="No ship weapon rows for this slice." /> : null}
                </SectionShell>
                <SectionShell title="Equipment" subtitle="Support tools tied to this scope." icon={<Package2 size={18} />}>
                    {impactfulEquipment.map((row) => (
                        <DrillRowButton
                            key={`equipment-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.winRate}% win rate`}
                            onClick={() => pushTarget(row.name, 'Equipment')}
                        />
                    ))}
                    {impactfulEquipment.length === 0 ? <EmptyState label="No equipment rows for this slice." /> : null}
                </SectionShell>
                <SectionShell title="Perks" subtitle="Perks surfacing inside this slice." icon={<User size={18} />}>
                    {impactfulPerks.map((row) => (
                        <DrillRowButton
                            key={`perk-${row.name}`}
                            row={row}
                            note={`${row.total} matches · ${row.winRate}% win rate`}
                            onClick={() => pushTarget(row.name, 'Perk')}
                        />
                    ))}
                    {impactfulPerks.length === 0 ? <EmptyState label="No perk rows for this slice." /> : null}
                </SectionShell>
            </div>
            <SectionShell title="Normalized loadout combinations" subtitle="Readable combinations surfaced from the patch catalog helpers." icon={<Package2 size={18} />}>
                <div className="grid gap-2 xl:grid-cols-2">
                    {model.loadouts.combos.slice(0, 8).map((combo) => (
                        <div key={combo.label} className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-2">
                            <div className="text-label-sm font-semibold text-md-sys-on-surface line-clamp-2">{combo.label}</div>
                            <div className="mt-1 text-label-xs text-md-sys-on-surface/55">
                                {combo.total} matches · {combo.winRate}% win rate
                            </div>
                        </div>
                    ))}
                    {model.loadouts.combos.length === 0 ? <EmptyState label="No loadout combinations in this slice." /> : null}
                </div>
            </SectionShell>
        </div>
    );

    const renderMatches = () => (
        <div className="space-y-3">
            {model.matchesTable.map((row) => (
                <MatchCard
                    key={`match-${row.id}`}
                    row={row}
                    onShipClick={() => pushTarget(row.ship, 'Ship')}
                    onHeroClick={() => pushTarget(row.hero, 'Hero')}
                />
            ))}
            {model.matchesTable.length === 0 ? <EmptyState label="No matches available for this slice." /> : null}
        </div>
    );

    return (
        <div className="fixed inset-0 z-overlay flex items-center justify-center p-4 md:p-6 md3-dialog-scrim animate-fade-in" onClick={() => setDrillDownTarget(null)}>
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="w-full max-w-7xl max-h-90vh rounded-2xl border border-md-sys-outline/18 bg-md-sys-surface shadow-2xl flex flex-col overflow-hidden"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-md-sys-outline/10 px-4 py-4 md:px-6">
                    <div className="min-w-0">
                        <div id={dialogDescriptionId} className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/40">
                            Scoped drill-down explorer
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {navigationStack.map((target, index) => {
                                const isCurrent = index === navigationStack.length - 1;
                                return (
                                    <button
                                        key={`${targetKey(target)}-${index}`}
                                        type="button"
                                        onClick={() => setNavigationStack((current) => current.slice(0, index + 1))}
                                        className={`rounded-pill px-2.5 py-1 text-label-sm font-bold ${
                                            isCurrent
                                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                                : 'bg-md-sys-surface-container-high text-md-sys-on-surface/68 hover:bg-md-sys-surface-container-highest'
                                        }`}
                                    >
                                        {target.name}
                                    </button>
                                );
                            })}
                        </div>
                        <h2 id={dialogTitleId} className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-md-sys-on-surface">
                            {currentTarget.name}
                        </h2>
                        <div className="mt-1 text-body text-md-sys-on-surface/58">
                            {formatTargetType(currentTarget.type)} · {model.summary.totalMatches} matches in this scoped slice
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {navigationStack.length > 1 ? (
                            <button type="button" onClick={popTarget} className="md3-icon-btn" aria-label="Go back one drill-down level">
                                <ArrowLeft size={18} />
                            </button>
                        ) : null}
                        <button type="button" onClick={() => setDrillDownTarget(null)} className="md3-icon-btn" aria-label="Close drill-down overlay">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div className="flex min-h-full flex-col xl:flex-row">
                        <aside className="w-full xl:w-80 shrink-0 border-b xl:border-b-0 xl:border-r border-md-sys-outline/10 bg-md-sys-surface-container-lowest/35 p-4 md:p-5 xl:sticky xl:top-0 xl:self-start">
                            <div className="space-y-3">
                                <RailStat label="Win rate" value={`${model.summary.winRate}%`} tone={model.summary.winRate >= 50 ? 'text-md-sys-primary' : 'text-danger'} />
                                <RailStat label="Wins / losses" value={`${model.summary.wins} / ${model.summary.losses}`} />
                                <RailStat label="Top ship" value={model.summary.topShip || 'N/A'} />
                                <RailStat label="Top hero" value={model.summary.topHero || 'N/A'} />
                            </div>

                            <div className="mt-5">
                                <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/42">
                                    Quick links
                                </div>
                                <div className="mt-2 space-y-2">
                                    {quickLinks.map((row) => (
                                        <DrillRowButton
                                            key={`quick-${row.type}-${row.name}`}
                                            row={row}
                                            note={`${formatTargetType(row.type)} · ${row.total} matches`}
                                            onClick={() => pushTarget(row.name, row.type)}
                                        />
                                    ))}
                                    {quickLinks.length === 0 ? <EmptyState label="No deeper links in this slice yet." /> : null}
                                </div>
                            </div>
                        </aside>

                        <div className="flex-1 min-h-0 flex flex-col">
                            <div className="border-b border-md-sys-outline/10 px-4 py-3 md:px-5">
                                <div className="flex flex-wrap gap-2">
                                    {model.availableTabs.map((tab) => (
                                        <TabButton key={tab} tab={tab} active={tab === activeTab} onClick={() => setActiveTab(tab)} />
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 px-4 py-4 md:px-5 md:py-5">
                                {activeTab === 'overview' ? renderOverview() : null}
                                {activeTab === 'people' ? renderPeople() : null}
                                {activeTab === 'hazards' ? renderHazards() : null}
                                {activeTab === 'loadouts' ? renderLoadouts() : null}
                                {activeTab === 'matches' ? renderMatches() : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
