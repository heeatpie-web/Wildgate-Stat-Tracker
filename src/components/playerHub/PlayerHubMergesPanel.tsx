import React, { useMemo, useState, type FC } from 'react';
import { Merge } from 'lucide-react';
import type {
    AutoMergeApplicationRecord,
    AutoMergeDismissalRecord,
} from '../../store/slices/createDataSlice';
import type { RosterMergeSuggestionGroup } from '../../utils/rosterMergeSuggestions';

export type MergesPanelTab = 'merges' | 'auto-merges';

export interface PlayerHubMergesPanelProps {
    containerClassName: string;
    possibleMergeGroups: RosterMergeSuggestionGroup[];
    activeMergeNotification: { sourceName: string; targetName: string } | null;
    onUndoLastMerge: () => boolean;
    recentAutoMergeApplications: AutoMergeApplicationRecord[];
    recentAutoMergeDismissals: AutoMergeDismissalRecord[];
    onUndoAutoMergeApplication: (id: string) => void;
    onRestoreAutoMergeDismissal: (id: string) => void;
    onMergeSuggestionGroup: (group: RosterMergeSuggestionGroup) => void;
    onDismissMergeSuggestionGroup: (group: RosterMergeSuggestionGroup) => void;
    /** Applies every currently-pending auto-merge (tier === 'auto') suggestion in one batch. */
    onApproveAllAutoMerges: (groups: RosterMergeSuggestionGroup[]) => void;
}

const pillStyle = (active: boolean, color?: 'warning') => {
    if (active) {
        if (color === 'warning') return 'border-warning/30 bg-warning/10 text-warning';
        return 'border-info/30 bg-info/10 text-info';
    }
    return 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]';
};

/**
 * Top-level "Possible Merges" tab (whole-roster fuzzy duplicate detection).
 * Extracted from PlayerHubOcrWorkbench so this isn't buried three clicks deep
 * inside the OCR Work panel's Merges sub-tab.
 */
export const PlayerHubMergesPanel: FC<PlayerHubMergesPanelProps> = ({
    containerClassName,
    possibleMergeGroups,
    activeMergeNotification,
    onUndoLastMerge,
    recentAutoMergeApplications,
    recentAutoMergeDismissals,
    onUndoAutoMergeApplication,
    onRestoreAutoMergeDismissal,
    onMergeSuggestionGroup,
    onDismissMergeSuggestionGroup,
    onApproveAllAutoMerges,
}) => {
    const [activeTab, setActiveTab] = useState<MergesPanelTab>('merges');

    // Partition merge groups by confidence tier. 'review' groups need the user to
    // confirm; 'auto' groups are high-confidence (>= the auto-merge threshold) and
    // get their own tab so the user can review/undo what auto-merging would apply.
    const reviewMergeGroups = useMemo(
        () => possibleMergeGroups.filter((group) => group.tier !== 'auto'),
        [possibleMergeGroups]
    );
    const autoMergeGroups = useMemo(
        () => possibleMergeGroups.filter((group) => group.tier === 'auto'),
        [possibleMergeGroups]
    );

    const tabs: { id: MergesPanelTab; label: string; count: number; color?: 'warning' }[] = [
        { id: 'merges', label: 'Merge Suggestions', count: reviewMergeGroups.length, color: 'warning' },
        { id: 'auto-merges', label: 'Auto-merge', count: autoMergeGroups.length },
    ];

    return (
        <div className={containerClassName}>
            <div className="rounded-card overflow-hidden border border-md-sys-outline/10 mg-surface shadow-xl flex flex-col h-full min-h-0">
                {/* Tab bar */}
                <div className="px-4 pt-4 pb-3 border-b border-md-sys-outline/[0.06] shrink-0 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-card bg-gradient-to-br from-warning/20 to-md-sys-primary/15 border border-md-sys-outline/10 flex items-center justify-center shrink-0">
                            <Merge size={16} className="text-warning" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-bold tracking-tight text-md-sys-on-surface">Possible Merges</h2>
                            <p className="text-label-sm text-md-sys-on-surface/40 font-medium">
                                {possibleMergeGroups.length} possible duplicate{possibleMergeGroups.length !== 1 ? 's' : ''} to review
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        {tabs.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`h-7 px-2.5 rounded-control text-label-xs font-semibold whitespace-nowrap transition-all border inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary/35 ${pillStyle(active, tab.color)}`}
                                    style={!active ? { background: 'var(--md-sys-color-surface-container-high)' } : undefined}
                                >
                                    {tab.label}
                                    {tab.count > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-pill text-[10px] font-bold leading-none ${
                                            active
                                                ? tab.color === 'warning' ? 'bg-warning/20' : 'bg-info/20'
                                                : 'bg-md-sys-on-surface/10'
                                        }`}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Merge suggestions tab */}
                {activeTab === 'merges' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {reviewMergeGroups.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-md-sys-on-surface/40">
                                <Merge size={28} className="mb-2 opacity-40" />
                                <span className="text-label-sm font-semibold">No merge suggestions</span>
                                <span className="text-label-xs mt-1 opacity-70">No roster entries look like duplicates</span>
                            </div>
                        ) : (
                            <div className="p-4 space-y-3">
                                <p className="text-label-xs text-md-sys-on-surface/50">
                                    These roster entries may represent the same player. Review and merge duplicates to consolidate encounter history.
                                </p>
                                {reviewMergeGroups.map((group) => (
                                    <div key={group.pairKeys.join('|')} className="rounded-card border border-md-sys-outline/10 overflow-hidden" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                        <div className="px-4 py-3 border-b border-md-sys-outline/[0.06]">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-label-sm font-semibold text-md-sys-on-surface truncate">
                                                        Keep &ldquo;{group.canonicalDisplayName}&rdquo;
                                                    </div>
                                                    <div className="text-label-xs text-md-sys-on-surface/50 mt-0.5">
                                                        {group.variants.length + 1} names · {Math.round(group.score)}% similarity
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {group.variants.map((variant) => (
                                                    <span
                                                        key={`${group.canonicalName}-${variant.name}`}
                                                        className="px-2 py-1 rounded-control text-label-xs font-medium border border-md-sys-outline/[0.08] text-md-sys-on-surface/65"
                                                        style={{ background: 'var(--md-sys-color-surface-container)' }}
                                                    >
                                                        {variant.displayName}
                                                        <span className="ml-1 opacity-50">{Math.round(variant.score)}%</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="px-4 py-3 flex gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onMergeSuggestionGroup(group)}
                                                className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-warning/30 bg-warning/10 text-warning hover:bg-warning/15 transition-colors"
                                                aria-label={`Merge into ${group.canonicalDisplayName}`}
                                            >
                                                Merge
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDismissMergeSuggestionGroup(group)}
                                                className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] transition-colors"
                                                style={{ background: 'var(--md-sys-color-surface-container)' }}
                                                aria-label={`Dismiss merge suggestion for ${group.canonicalDisplayName}`}
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Auto-merge tab — high-confidence groups (>= the auto-merge threshold).
                    Surfaced here so near-identical names are never silently lost and the
                    user can review / apply / undo them. */}
                {activeTab === 'auto-merges' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {autoMergeGroups.length === 0
                            && recentAutoMergeApplications.length === 0
                            && recentAutoMergeDismissals.length === 0
                            && !activeMergeNotification ? (
                            <div className="h-full flex flex-col items-center justify-center text-md-sys-on-surface/40">
                                <Merge size={28} className="mb-2 opacity-40" />
                                <span className="text-label-sm font-semibold">No high-confidence merges</span>
                                <span className="text-label-xs mt-1 opacity-70">Nothing scored above the auto-merge threshold</span>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                {activeMergeNotification && (
                                    <div
                                        className="rounded-card border border-md-sys-primary/25 bg-md-sys-primary/10 px-3 py-2 flex items-center justify-between gap-3"
                                        data-testid="auto-merge-active-notification"
                                    >
                                        <div className="min-w-0 text-label-xs text-md-sys-on-surface/65">
                                            Auto-merged &ldquo;{activeMergeNotification.sourceName}&rdquo; into &ldquo;{activeMergeNotification.targetName}&rdquo;.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onUndoLastMerge}
                                            className="h-7 px-3 rounded-control text-label-xs font-semibold border border-md-sys-primary/30 text-md-sys-primary hover:bg-md-sys-primary/15 shrink-0 transition-colors"
                                            aria-label="Undo auto-merge"
                                        >
                                            Undo
                                        </button>
                                    </div>
                                )}

                                {autoMergeGroups.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/55">
                                                    Pending suggestions
                                                </h3>
                                                <span className="text-label-xs text-md-sys-on-surface/45">
                                                    {autoMergeGroups.length}
                                                </span>
                                            </div>
                                            {autoMergeGroups.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => onApproveAllAutoMerges(autoMergeGroups)}
                                                    className="h-7 px-2.5 rounded-control text-label-xs font-semibold border border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary hover:bg-md-sys-primary/15 shrink-0 transition-colors"
                                                    aria-label={`Approve all ${autoMergeGroups.length} pending auto-merge suggestions`}
                                                    data-testid="auto-merge-approve-all"
                                                >
                                                    Approve all
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-label-xs text-md-sys-on-surface/50">
                                            These roster entries are near-identical (at or above the auto-merge threshold). Apply to consolidate, or dismiss to keep them separate.
                                        </p>
                                        {autoMergeGroups.map((group) => (
                                            <div
                                                key={group.pairKeys.join('|')}
                                                data-testid={`auto-merge-pending-${group.canonicalName}`}
                                                className="rounded-card border border-md-sys-primary/25 overflow-hidden"
                                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                            >
                                                <div className="px-4 py-3 border-b border-md-sys-outline/[0.06]">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-label-sm font-semibold text-md-sys-on-surface truncate">
                                                                Keep &ldquo;{group.canonicalDisplayName}&rdquo;
                                                            </div>
                                                            <div className="text-label-xs text-md-sys-on-surface/50 mt-0.5">
                                                                {group.variants.length + 1} names · {Math.round(group.score)}% similarity · high confidence
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {group.variants.map((variant) => (
                                                            <span
                                                                key={`${group.canonicalName}-${variant.name}`}
                                                                className="px-2 py-1 rounded-control text-label-xs font-medium border border-md-sys-outline/[0.08] text-md-sys-on-surface/65"
                                                                style={{ background: 'var(--md-sys-color-surface-container)' }}
                                                            >
                                                                {variant.displayName}
                                                                <span className="ml-1 opacity-50">{Math.round(variant.score)}%</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="px-4 py-3 flex gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onMergeSuggestionGroup(group)}
                                                        className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary hover:bg-md-sys-primary/15 transition-colors"
                                                        aria-label={`Apply merge into ${group.canonicalDisplayName}`}
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDismissMergeSuggestionGroup(group)}
                                                        className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] transition-colors"
                                                        style={{ background: 'var(--md-sys-color-surface-container)' }}
                                                        aria-label={`Dismiss merge suggestion for ${group.canonicalDisplayName}`}
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {recentAutoMergeApplications.length > 0 && (
                                    <div className="space-y-2" data-testid="auto-merge-applied-section">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/55">
                                                Recently applied
                                            </h3>
                                            <span className="text-label-xs text-md-sys-on-surface/45">
                                                {recentAutoMergeApplications.length}
                                            </span>
                                        </div>
                                        {recentAutoMergeApplications.map((entry) => (
                                            <div
                                                key={entry.id}
                                                data-testid={`auto-merge-applied-${entry.targetName}`}
                                                className="rounded-card border border-md-sys-primary/15 px-3 py-2 flex items-center justify-between gap-3"
                                                style={{ background: 'var(--md-sys-color-surface-container)' }}
                                            >
                                                <div className="min-w-0 text-label-xs text-md-sys-on-surface/65">
                                                    <div className="font-semibold text-md-sys-on-surface truncate">
                                                        Merged into &ldquo;{entry.targetDisplayName}&rdquo;
                                                    </div>
                                                    <div className="opacity-70 truncate">
                                                        From: {entry.sourceDisplayNames.join(', ')}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onUndoAutoMergeApplication(entry.id)}
                                                    className="h-7 px-3 rounded-control text-label-xs font-semibold border border-md-sys-primary/30 text-md-sys-primary hover:bg-md-sys-primary/15 shrink-0 transition-colors"
                                                    aria-label={`Undo auto-merge into ${entry.targetDisplayName}`}
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {recentAutoMergeDismissals.length > 0 && (
                                    <div className="space-y-2" data-testid="auto-merge-dismissed-section">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/55">
                                                Recently dismissed
                                            </h3>
                                            <span className="text-label-xs text-md-sys-on-surface/45">
                                                {recentAutoMergeDismissals.length}
                                            </span>
                                        </div>
                                        {recentAutoMergeDismissals.map((entry) => (
                                            <div
                                                key={entry.id}
                                                data-testid={`auto-merge-dismissed-${entry.canonicalName}`}
                                                className="rounded-card border border-md-sys-outline/15 px-3 py-2 flex items-center justify-between gap-3"
                                                style={{ background: 'var(--md-sys-color-surface-container)' }}
                                            >
                                                <div className="min-w-0 text-label-xs text-md-sys-on-surface/65">
                                                    <div className="font-semibold text-md-sys-on-surface truncate">
                                                        Kept &ldquo;{entry.canonicalDisplayName}&rdquo; separate
                                                    </div>
                                                    <div className="opacity-70 truncate">
                                                        From: {entry.variantDisplayNames.join(', ')}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onRestoreAutoMergeDismissal(entry.id)}
                                                    className="h-7 px-3 rounded-control text-label-xs font-semibold border border-md-sys-outline/20 text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/[0.06] shrink-0 transition-colors"
                                                    aria-label={`Restore dismissed merge suggestion for ${entry.canonicalDisplayName}`}
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
