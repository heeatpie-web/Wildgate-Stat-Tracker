import React, { type Dispatch, type FC, type RefObject, type SetStateAction } from 'react';
import { Users, Search, Star, ChevronRight, Undo2, X } from 'lucide-react';
import type { MergeHistoryEntry, PendingReview } from '../../store/slices/createDataSlice';
import type { PlayerDetail, PlayerFilterMode, PlayerHubMode, SortMode } from './playerHubTypes';
import { getPlayerStatusChips, getStatusChipClassName } from './playerHubUtils';
import { PlayerHubOcrWorkbench, type PlayerHubOcrWorkbenchProps } from './PlayerHubOcrWorkbench';

export interface PlayerHubRosterColumnProps {
    panelMode: PlayerHubMode;
    setPanelMode: Dispatch<SetStateAction<PlayerHubMode>>;
    rosteredPlayerCount: number;
    trackedOnlyPlayerCount: number;
    ocrWorkbenchCount: number;
    searchTerm: string;
    setSearchTerm: Dispatch<SetStateAction<string>>;
    sortMode: SortMode;
    setSortMode: Dispatch<SetStateAction<SortMode>>;
    playerFilterMode: PlayerFilterMode;
    setPlayerFilterMode: Dispatch<SetStateAction<PlayerFilterMode>>;
    enrichedPilots: PlayerDetail[];
    needsReviewPlayerCount: number;
    activeMergeNotification: MergeHistoryEntry | null;
    onUndoLastMerge: () => void;
    onDismissActiveMergeNotification: () => void;
    pendingRosterCandidates: PendingReview[];
    filtered: PlayerDetail[];
    rosterScrollRef: RefObject<HTMLDivElement | null>;
    onRosterScroll: (scrollTop: number) => void;
    rosterTotalHeight: number;
    rosterVisibleOffsetY: number;
    rosterVisiblePilots: PlayerDetail[];
    selectedPilot: string | null;
    setSelectedPilot: Dispatch<SetStateAction<string | null>>;
    timeAgo: (ts: number | null) => string;
    ocrWorkbenchProps: Omit<PlayerHubOcrWorkbenchProps, 'containerClassName'>;
}

export const PlayerHubRosterColumn: FC<PlayerHubRosterColumnProps> = ({
    panelMode,
    setPanelMode,
    rosteredPlayerCount,
    trackedOnlyPlayerCount,
    ocrWorkbenchCount,
    searchTerm,
    setSearchTerm,
    sortMode,
    setSortMode,
    playerFilterMode,
    setPlayerFilterMode,
    enrichedPilots,
    needsReviewPlayerCount,
    activeMergeNotification,
    onUndoLastMerge,
    onDismissActiveMergeNotification,
    pendingRosterCandidates,
    filtered,
    rosterScrollRef,
    onRosterScroll,
    rosterTotalHeight,
    rosterVisibleOffsetY,
    rosterVisiblePilots,
    selectedPilot,
    setSelectedPilot,
    timeAgo,
    ocrWorkbenchProps,
}) => (
    <div className="w-full lg:w-full shrink-0 flex flex-col gap-3 h-full min-h-0">
        <div className="md3-card mg-surface shadow-lg p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                        <Users size={16} />
                    </div>
                    <div>
                        <h2 className="text-body font-bold text-md-sys-on-surface uppercase tracking-tight">Players</h2>
                        <span className="text-label-xs text-md-sys-on-surface/60">
                            {rosteredPlayerCount} rostered
                            {trackedOnlyPlayerCount > 0 ? ` · ${trackedOnlyPlayerCount} tracked only` : ''}
                        </span>
                    </div>
                </div>
            </div>

            <div className="lg:hidden grid grid-cols-2 gap-1 rounded-xl bg-md-sys-surface-container-high p-1">
                <button
                    type="button"
                    onClick={() => setPanelMode('roster')}
                    className={`h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${panelMode === 'roster'
                        ? 'bg-md-sys-surface text-md-sys-on-surface border border-md-sys-outline/30'
                        : 'text-md-sys-on-surface/68 hover:bg-md-sys-on-surface/5'
                        }`}
                >
                    Details
                </button>
                <button
                    type="button"
                    onClick={() => setPanelMode('ocr-work')}
                    className={`h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${panelMode === 'ocr-work'
                        ? 'bg-md-sys-surface text-md-sys-on-surface border border-md-sys-outline/30'
                        : 'text-md-sys-on-surface/68 hover:bg-md-sys-on-surface/5'
                        }`}
                >
                    OCR Work {ocrWorkbenchCount > 0 ? `(${ocrWorkbenchCount})` : ''}
                </button>
            </div>

            <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 pointer-events-none" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search players..."
                    className="w-full md3-textfield--outlined rounded-xl pl-10 pr-12 py-2 text-label-sm outline-none"
                />
                {searchTerm && (
                    <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10" aria-label="Clear player search">
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="pt-1 border-t border-md-sys-outline/10">
                <div className="mb-1.5 text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/50">
                    Sort
                </div>
                <div className="flex gap-1">
                    {([
                        { id: 'favorites', label: 'Pinned' },
                        { id: 'alpha', label: 'A-Z' },
                        { id: 'recent', label: 'Recent' },
                        { id: 'encounters', label: 'Most Seen' },
                    ] as { id: SortMode; label: string }[]).map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setSortMode(s.id)}
                            className={`flex-1 h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${sortMode === s.id
                                ? 'bg-md-sys-surface text-md-sys-on-surface border border-md-sys-outline/30'
                                : 'text-md-sys-on-surface/68 hover:bg-md-sys-on-surface/5'
                                }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="pt-1 border-t border-md-sys-outline/10">
                <div className="mb-1.5 text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/50">
                    Scope
                </div>
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {([
                        { id: 'all', label: 'All', count: enrichedPilots.length },
                        { id: 'roster', label: 'Roster', count: rosteredPlayerCount },
                        { id: 'tracked-only', label: 'Tracked Only', count: trackedOnlyPlayerCount },
                        { id: 'needs-review', label: 'Needs Review', count: needsReviewPlayerCount },
                    ] as { id: PlayerFilterMode; label: string; count: number }[]).map((filter) => (
                        <button
                            key={filter.id}
                            type="button"
                            onClick={() => setPlayerFilterMode(filter.id)}
                            className={`h-7 shrink-0 whitespace-nowrap rounded-lg px-2.5 text-label-xs font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${playerFilterMode === filter.id
                                ? 'bg-md-sys-surface text-md-sys-on-surface border border-md-sys-outline/30 ring-1 ring-inset ring-md-sys-outline/35'
                                : 'text-md-sys-on-surface/68 hover:bg-md-sys-on-surface/5'
                                }`}
                        >
                            {filter.label} {filter.count > 0 ? `(${filter.count})` : ''}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {activeMergeNotification && (() => {
            const ago = Math.round((Date.now() - activeMergeNotification.timestamp) / 1000);
            const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
            return (
                <div className="flex items-center justify-between gap-2 bg-warning-soft border border-warning-soft rounded-xl px-3 py-2 shrink-0">
                    <span className="text-label-xs text-warning truncate">
                        Merged <strong>{activeMergeNotification.sourceName}</strong> → <strong>{activeMergeNotification.targetName}</strong> ({agoLabel})
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={onUndoLastMerge}
                            className="flex items-center gap-1 px-2 py-1 bg-warning-soft hover:bg-warning hover:text-ink-strong text-warning rounded text-label-xs font-bold transition-colors shrink-0"
                        >
                            <Undo2 size={10} /> Undo
                        </button>
                        <button
                            type="button"
                            onClick={onDismissActiveMergeNotification}
                            className="flex items-center gap-1 px-2 py-1 bg-md-sys-on-surface/10 hover:bg-md-sys-on-surface/15 text-warning rounded text-label-xs font-bold transition-colors shrink-0"
                            aria-label="Dismiss merge notification"
                            title="Dismiss merge notification"
                        >
                            <X size={10} />
                            Dismiss
                        </button>
                    </div>
                </div>
            );
        })()}

        {pendingRosterCandidates.length > 0 && (
            <div className="md3-card mg-surface shadow-lg p-3 border border-info/20 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-label-sm font-semibold uppercase tracking-wide text-info">
                        OCR Workbench Ready
                    </div>
                    <p className="text-label-xs text-md-sys-on-surface/62 truncate">
                        {pendingRosterCandidates.length} pending roster candidate{pendingRosterCandidates.length === 1 ? '' : 's'} to review.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setPanelMode('ocr-work')}
                    className={`h-8 shrink-0 rounded-lg px-3 text-label-xs font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/45 ${panelMode === 'ocr-work'
                        ? 'bg-info/16 text-info border border-info/35'
                        : 'text-info hover:bg-info/12 border border-info/25'
                        }`}
                >
                    {panelMode === 'ocr-work' ? 'Viewing OCR work' : 'Review'}
                </button>
            </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col gap-3">
            {filtered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-md-sys-on-surface/40">
                    <Users size={32} className="mb-2 opacity-40" />
                    <span className="text-label-sm font-semibold">
                        {searchTerm ? 'No tracked players match your search' : 'No tracked players yet'}
                    </span>
                </div>
            ) : (
                <div
                    ref={rosterScrollRef}
                    data-testid="playerhub-roster-viewport"
                    onScroll={(event) => onRosterScroll(event.currentTarget.scrollTop)}
                    className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                >
                    <div style={{ height: `${rosterTotalHeight}px` }}>
                        <div
                            className="grid grid-cols-2 2xl:grid-cols-3 gap-1.5 content-start"
                            style={{ transform: `translateY(${rosterVisibleOffsetY}px)` }}
                        >
                            {rosterVisiblePilots.map((pilot) => {
                                const statusChips = getPlayerStatusChips(pilot);
                                return (
                                    <button
                                        key={pilot.name}
                                        type="button"
                                        onClick={() => {
                                            setSelectedPilot(pilot.name);
                                        }}
                                        className={`player-list-item w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all group ${selectedPilot === pilot.name
                                            ? 'bg-md-sys-primary/10 border border-md-sys-primary/20 text-md-sys-on-surface'
                                            : 'hover:bg-md-sys-on-surface/5 text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {pilot.isFavorite && <Star size={10} className="text-warning fill-amber-400 shrink-0" />}
                                                <span className="player-list-name text-label-sm font-semibold truncate">{pilot.name}</span>
                                                {statusChips.map((chip) => (
                                                    <span
                                                        key={`${pilot.name}-${chip.key}`}
                                                        className={`shrink-0 px-1.5 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-wide ${getStatusChipClassName(chip.key)}`}
                                                    >
                                                        {chip.label}
                                                    </span>
                                                ))}
                                            </div>
                                            {pilot.totalEncounters > 0 && (
                                                <span className="text-label-xs text-md-sys-on-surface/40">
                                                    {pilot.totalEncounters} encounter{pilot.totalEncounters !== 1 ? 's' : ''}
                                                    {pilot.lastSeen ? ` | ${timeAgo(pilot.lastSeen)}` : ''}
                                                </span>
                                            )}
                                        </div>
                                        {pilot.isRoster && pilot.note && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-md-sys-primary/40 shrink-0" title="Has note" />
                                        )}
                                        <ChevronRight size={14} className="text-md-sys-on-surface/40 group-hover:text-md-sys-on-surface/40 shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            <PlayerHubOcrWorkbench {...ocrWorkbenchProps} containerClassName="lg:hidden shrink-0" />
        </div>
    </div>
);
