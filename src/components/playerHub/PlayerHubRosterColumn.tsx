import React, { useState, type Dispatch, type FC, type RefObject, type SetStateAction } from 'react';
import { Users, Search, Star, ChevronRight, ChevronLeft, ChevronDown, Undo2, X, ScanEye, Archive } from 'lucide-react';
import type { MergeHistoryEntry, PendingReview } from '../../store/slices/createDataSlice';
import { ROSTER_ARCHIVE_THRESHOLD_MS, isRosterEntryArchived } from '../../store/slices/createDataSlice';
import type { PlayerDetail, PlayerFilterMode, PlayerHubMode, SortMode } from './playerHubTypes';
import { getPlayerStatusChips, getStatusChipClassName, normalizeNameKey } from './playerHubUtils';

export interface PlayerHubRosterColumnProps {
    panelMode: PlayerHubMode;
    setPanelMode: Dispatch<SetStateAction<PlayerHubMode>>;
    rosteredPlayerCount: number;
    activePlayerCount: number;
    archivedPlayerCount: number;
    trackedOnlyPlayerCount: number;
    searchTerm: string;
    setSearchTerm: Dispatch<SetStateAction<string>>;
    sortMode: SortMode;
    setSortMode: Dispatch<SetStateAction<SortMode>>;
    playerFilterMode: PlayerFilterMode;
    setPlayerFilterMode: Dispatch<SetStateAction<PlayerFilterMode>>;
    onArchiveStale: () => void;
    enrichedPilots: PlayerDetail[];
    needsReviewPlayerCount: number;
    activeMergeNotification: MergeHistoryEntry | null;
    onUndoLastMerge: () => void;
    onDismissActiveMergeNotification: () => void;
    pendingRosterCandidates: PendingReview[];
    filtered: PlayerDetail[];
    rosterScrollRef: RefObject<HTMLDivElement | null>;
    rosterVisiblePilots: PlayerDetail[];
    rosterPage: number;
    rosterTotalPages: number;
    rosterPageStart: number;
    rosterPageEnd: number;
    rosterTotalCount: number;
    onRosterPageChange: Dispatch<SetStateAction<number>>;
    selectedPilot: string | null;
    setSelectedPilot: Dispatch<SetStateAction<string | null>>;
    timeAgo: (ts: number | null) => string;
    /** Normalized name key of the signed-in player, for the YOU tag. */
    activeUserKey?: string;
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
    { id: 'favorites', label: 'Pinned' },
    { id: 'alpha', label: 'A–Z' },
    { id: 'recent', label: 'Recent' },
    { id: 'encounters', label: 'Most Seen' },
];

export const PlayerHubRosterColumn: FC<PlayerHubRosterColumnProps> = ({
    panelMode,
    setPanelMode,
    rosteredPlayerCount,
    activePlayerCount,
    archivedPlayerCount,
    trackedOnlyPlayerCount,
    searchTerm,
    setSearchTerm,
    sortMode,
    setSortMode,
    playerFilterMode,
    setPlayerFilterMode,
    onArchiveStale,
    enrichedPilots,
    needsReviewPlayerCount,
    activeMergeNotification,
    onUndoLastMerge,
    onDismissActiveMergeNotification,
    pendingRosterCandidates,
    filtered,
    rosterScrollRef,
    rosterVisiblePilots,
    rosterPage,
    rosterTotalPages,
    rosterPageStart,
    rosterPageEnd,
    rosterTotalCount,
    onRosterPageChange,
    selectedPilot,
    setSelectedPilot,
    timeAgo,
    activeUserKey,
}) => {
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const canPrev = rosterPage > 0;
    const canNext = rosterPage < rosterTotalPages - 1;
    const scopeOptions = [
        { id: 'active' as PlayerFilterMode, label: 'Active', count: activePlayerCount },
        { id: 'all' as PlayerFilterMode, label: 'All', count: enrichedPilots.length },
        { id: 'roster' as PlayerFilterMode, label: 'Roster', count: rosteredPlayerCount },
        { id: 'tracked-only' as PlayerFilterMode, label: 'Tracked', count: trackedOnlyPlayerCount },
        { id: 'needs-review' as PlayerFilterMode, label: 'Review', count: needsReviewPlayerCount },
        { id: 'archived' as PlayerFilterMode, label: 'Archived', count: archivedPlayerCount },
    ];
    const activeSortLabel = SORT_OPTIONS.find((s) => s.id === sortMode)?.label ?? '';
    const activeScopeLabel = scopeOptions.find((f) => f.id === playerFilterMode)?.label ?? '';

    return (
        <div className="w-full shrink-0 flex flex-col h-full min-h-0">
            <div className="rounded-card overflow-hidden border border-md-sys-outline/10 mg-surface shadow-xl flex flex-col h-full min-h-0">

                {/* Toolbar */}
                <div className="p-4 flex flex-col gap-3 border-b border-md-sys-outline/[0.06] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-card bg-gradient-to-br from-md-sys-primary/20 to-md-sys-tertiary/20 border border-md-sys-outline/10 flex items-center justify-center shrink-0">
                            <Users size={16} className="text-md-sys-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold tracking-tight text-md-sys-on-surface">Players</h2>
                            <p className="text-label-sm text-md-sys-on-surface/40 font-medium">
                                {rosteredPlayerCount} rostered{trackedOnlyPlayerCount > 0 ? ` · ${trackedOnlyPlayerCount} tracked` : ''}
                            </p>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 group-focus-within:text-md-sys-primary transition-colors pointer-events-none" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search players..."
                            className="w-full pl-9 pr-9 py-2.5 text-label-sm outline-none text-md-sys-on-surface rounded-control border border-md-sys-outline/10 focus:border-md-sys-primary/40 focus:ring-2 focus:ring-md-sys-primary/10 transition-all"
                            style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                aria-label="Clear search"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Filters toggle */}
                    <button
                        type="button"
                        onClick={() => setFiltersExpanded((prev) => !prev)}
                        className="flex items-center justify-between gap-2 h-7 px-1 rounded-control text-label-xs font-semibold text-md-sys-on-surface/55 hover:text-md-sys-on-surface transition-colors"
                        aria-expanded={filtersExpanded}
                    >
                        <span className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full border border-md-sys-outline/10 text-md-sys-on-surface/70" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                {activeScopeLabel} · {activeSortLabel}
                            </span>
                        </span>
                        <ChevronDown size={13} className={`transition-transform ${filtersExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {filtersExpanded && (
                        <>
                            {/* Sort */}
                            <div className="flex gap-1">
                                {SORT_OPTIONS.map((s) => {
                                    const active = sortMode === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSortMode(s.id)}
                                            className={`flex-1 h-7 rounded-control text-label-xs font-semibold transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${
                                                active
                                                    ? 'border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary'
                                                    : 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]'
                                            }`}
                                            style={!active ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                                        >
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Scope */}
                            <div className="flex gap-1 flex-wrap">
                                {scopeOptions.map((f) => {
                                    const active = playerFilterMode === f.id;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setPlayerFilterMode(f.id)}
                                            className={`h-7 px-2.5 rounded-control text-label-xs font-semibold whitespace-nowrap transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${
                                                active
                                                    ? 'border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary'
                                                    : 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]'
                                            }`}
                                            style={!active ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                                        >
                                            {f.label}{f.count > 0 ? ` (${f.count})` : ''}
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={onArchiveStale}
                                    className="h-7 px-2.5 rounded-control text-label-xs font-semibold whitespace-nowrap transition-all border border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] inline-flex items-center gap-1"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                    title="Archive every player (rostered or tracked-only) unseen for 60+ days"
                                >
                                    <Archive size={11} />
                                    Archive stale
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Merge notification banner */}
                {activeMergeNotification && (() => {
                    const ago = Math.round((Date.now() - activeMergeNotification.timestamp) / 1000);
                    const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                    return (
                        <div className="flex items-center justify-between gap-2 border-b border-warning-soft px-4 py-2 shrink-0 bg-warning-soft/50">
                            <span className="text-label-xs text-warning truncate">
                                Merged <strong>{activeMergeNotification.sourceName}</strong> → <strong>{activeMergeNotification.targetName}</strong> ({agoLabel})
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={onUndoLastMerge}
                                    className="flex items-center gap-1 px-2 py-1 hover:bg-warning hover:text-ink-strong text-warning rounded text-label-xs font-bold transition-colors"
                                >
                                    <Undo2 size={10} /> Undo
                                </button>
                                <button
                                    type="button"
                                    onClick={onDismissActiveMergeNotification}
                                    className="p-1 text-warning/60 hover:text-warning rounded transition-colors"
                                    aria-label="Dismiss merge notification"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* OCR ready banner */}
                {pendingRosterCandidates.length > 0 && (
                    <div className="flex items-center justify-between gap-3 border-b border-md-sys-outline/[0.06] px-4 py-2 shrink-0" style={{ background: 'var(--md-sys-color-surface-container)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                            <ScanEye size={13} className="text-info shrink-0" />
                            <span className="text-label-xs text-md-sys-on-surface/65 truncate">
                                <span className="font-semibold text-info">{pendingRosterCandidates.length}</span> OCR candidate{pendingRosterCandidates.length !== 1 ? 's' : ''} to review
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPanelMode('ocr-work')}
                            className={`h-7 shrink-0 rounded-control px-2.5 text-label-xs font-semibold transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35 ${
                                panelMode === 'ocr-work'
                                    ? 'border-info/30 bg-info/10 text-info'
                                    : 'border-info/20 text-info/80 hover:bg-info/8'
                            }`}
                        >
                            {panelMode === 'ocr-work' ? 'Viewing' : 'Review'}
                        </button>
                    </div>
                )}

                {/* Player list */}
                {filtered.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-md-sys-on-surface/40">
                        <Users size={32} className="mb-2 opacity-40" />
                        <span className="text-label-sm font-semibold">
                            {searchTerm ? 'No players match your search' : 'No tracked players yet'}
                        </span>
                    </div>
                ) : (
                    <div
                        ref={rosterScrollRef as React.Ref<HTMLDivElement>}
                        data-testid="playerhub-roster-viewport"
                        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
                    >
                        <div>
                            <div>
                                {rosterVisiblePilots.map((pilot) => {
                                    const statusChips = getPlayerStatusChips(pilot);
                                    const isSelected = selectedPilot === pilot.name;
                                    const isArchived = isRosterEntryArchived(pilot.rosterMeta)
                                        || (!pilot.isRoster && pilot.isManuallyArchived)
                                        || (!pilot.isRoster && !pilot.isFavorite && pilot.lastSeen != null && (Date.now() - pilot.lastSeen) > ROSTER_ARCHIVE_THRESHOLD_MS);
                                    const teammateWr = pilot.asTeammate && pilot.asTeammate.total > 0
                                        ? Math.round((pilot.asTeammate.wins / pilot.asTeammate.total) * 100)
                                        : null;
                                    const opponentWr = pilot.asOpponent && pilot.asOpponent.total > 0
                                        ? Math.round((pilot.asOpponent.wins / pilot.asOpponent.total) * 100)
                                        : null;
                                    return (
                                        <button
                                            key={pilot.name}
                                            type="button"
                                            onClick={() => setSelectedPilot(pilot.name)}
                                            className={`player-list-item w-full text-left flex items-center gap-3 px-4 py-3 border-b border-md-sys-outline/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-md-sys-primary/35 ${
                                                isSelected
                                                    ? 'bg-md-sys-primary/[0.08]'
                                                    : 'hover:bg-md-sys-on-surface/[0.04]'
                                            }`}
                                        >
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-label-xs font-bold shrink-0 ${
                                                pilot.isFavorite
                                                    ? 'bg-warning/15 text-warning'
                                                    : pilot.isDetected
                                                        ? 'bg-info/12 text-info'
                                                        : isSelected
                                                            ? 'bg-md-sys-primary/20 text-md-sys-primary'
                                                            : 'bg-md-sys-on-surface/8 text-md-sys-on-surface/55'
                                            }`}>
                                                {pilot.name.slice(0, 2).toUpperCase()}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {pilot.isFavorite && <Star size={10} className="text-warning fill-amber-400 shrink-0" />}
                                                    <span className="player-list-name text-label-sm font-semibold text-md-sys-on-surface truncate">{pilot.name}</span>
                                                    {activeUserKey && normalizeNameKey(pilot.name) === activeUserKey && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded-pill text-[9px] font-black uppercase tracking-wide leading-none bg-md-sys-primary/15 text-md-sys-primary border border-md-sys-primary/25" title="This is you">YOU</span>
                                                    )}
                                                    {isArchived && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded-pill text-[9px] font-bold uppercase tracking-wide leading-none bg-md-sys-on-surface/[0.08] text-md-sys-on-surface/45 border border-md-sys-outline/10" title="Archived — not seen in over 60 days">Archived</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-x-2 mt-0.5 text-label-xs text-md-sys-on-surface/40 flex-wrap">
                                                    {pilot.totalEncounters > 0 && (
                                                        <span>{pilot.totalEncounters} enc</span>
                                                    )}
                                                    {teammateWr !== null && (
                                                        <span className="text-success font-medium">{teammateWr}% with</span>
                                                    )}
                                                    {opponentWr !== null && (
                                                        <span className="text-danger font-medium">{opponentWr}% vs</span>
                                                    )}
                                                    {pilot.lastSeen && (
                                                        <span>{timeAgo(pilot.lastSeen)}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {statusChips.map((chip) => (
                                                    <span
                                                        key={`${pilot.name}-${chip.key}`}
                                                        className={`shrink-0 px-1.5 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide ${getStatusChipClassName(chip.key)}`}
                                                    >
                                                        {chip.label}
                                                    </span>
                                                ))}
                                                {pilot.isRoster && pilot.note && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-md-sys-primary/40" title="Has note" />
                                                )}
                                                <ChevronRight size={13} className={isSelected ? 'text-md-sys-primary/50' : 'text-md-sys-on-surface/25'} />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {filtered.length > 0 && rosterTotalPages > 1 && (
                    <div
                        className="flex items-center justify-between gap-2 px-4 py-2 border-t border-md-sys-outline/[0.06] shrink-0"
                        style={{ background: 'var(--md-sys-color-surface-container)' }}
                    >
                        <span className="text-label-xs text-md-sys-on-surface/55">
                            {rosterPageStart + 1}–{rosterPageEnd} of {rosterTotalCount}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onRosterPageChange(0)}
                                disabled={!canPrev}
                                className="h-7 px-2 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/70 disabled:opacity-30 hover:bg-md-sys-on-surface/[0.06]"
                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                aria-label="First page"
                            >
                                «
                            </button>
                            <button
                                type="button"
                                onClick={() => onRosterPageChange((p) => Math.max(0, p - 1))}
                                disabled={!canPrev}
                                className="h-7 w-7 rounded-control inline-flex items-center justify-center border border-md-sys-outline/10 text-md-sys-on-surface/70 disabled:opacity-30 hover:bg-md-sys-on-surface/[0.06]"
                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                aria-label="Previous page"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-label-xs font-semibold text-md-sys-on-surface/75 px-2">
                                {rosterPage + 1} / {rosterTotalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRosterPageChange((p) => Math.min(rosterTotalPages - 1, p + 1))}
                                disabled={!canNext}
                                className="h-7 w-7 rounded-control inline-flex items-center justify-center border border-md-sys-outline/10 text-md-sys-on-surface/70 disabled:opacity-30 hover:bg-md-sys-on-surface/[0.06]"
                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                aria-label="Next page"
                            >
                                <ChevronRight size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onRosterPageChange(rosterTotalPages - 1)}
                                disabled={!canNext}
                                className="h-7 px-2 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/70 disabled:opacity-30 hover:bg-md-sys-on-surface/[0.06]"
                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                aria-label="Last page"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
