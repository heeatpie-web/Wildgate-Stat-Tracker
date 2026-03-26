import React, { type Dispatch, type FC, type SetStateAction } from 'react';
import { Search, ScanEye, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
import type { PendingReview } from '../../store/slices/createDataSlice';
import { normalizeOcrName } from '../../utils/stringUtils';
import type { RosterMergeSuggestionGroup } from '../../utils/rosterMergeSuggestions';
import type { PlayerHubMode, RoleConflictWorkbenchItem } from './playerHubTypes';

export interface PlayerHubOcrWorkbenchProps {
    containerClassName: string;
    panelMode: PlayerHubMode;
    ocrWorkbenchCount: number;
    roleConflictWorkbenchItems: RoleConflictWorkbenchItem[];
    onResolveRoleConflict: (matchId: number, playerName: string, role: 'teammate' | 'opponent') => void;
    onOpenMatchInSmartCaptures: (matchId: number) => void;
    possibleMergeGroups: RosterMergeSuggestionGroup[];
    possibleMergesExpanded: boolean;
    setPossibleMergesExpanded: Dispatch<SetStateAction<boolean>>;
    onMergeSuggestionGroup: (group: RosterMergeSuggestionGroup) => void;
    onDismissMergeSuggestionGroup: (group: RosterMergeSuggestionGroup) => void;
    ocrSearchTerm: string;
    setOcrSearchTerm: (value: string) => void;
    pendingRosterCandidates: PendingReview[];
    filteredOcrCandidates: PendingReview[];
    pendingCandidateEdits: Record<string, string>;
    setPendingCandidateEdits: Dispatch<SetStateAction<Record<string, string>>>;
    rosterCandidateMatchMap: Map<string, string | null>;
    findRosterMatch: (value: string) => string | null;
    mergeRosterCandidateIntoExisting: (
        candidate: { id: string; value: string; canonicalTargetKey?: string | null | undefined },
        targetName: string,
        overrideValue?: string
    ) => void;
    resolveRosterCandidate: (
        candidate: { id: string; value: string },
        action: 'approve' | 'dismiss',
        overrideValue?: string
    ) => void;
    addPilotAlias: (pilotName: string, alias: string) => void;
    onSourcePreview: (preview: { src: string; label: string } | null) => void;
}

export const PlayerHubOcrWorkbench: FC<PlayerHubOcrWorkbenchProps> = ({
    containerClassName,
    panelMode,
    ocrWorkbenchCount,
    roleConflictWorkbenchItems,
    onResolveRoleConflict,
    onOpenMatchInSmartCaptures,
    possibleMergeGroups,
    possibleMergesExpanded,
    setPossibleMergesExpanded,
    onMergeSuggestionGroup,
    onDismissMergeSuggestionGroup,
    ocrSearchTerm,
    setOcrSearchTerm,
    pendingRosterCandidates,
    filteredOcrCandidates,
    pendingCandidateEdits,
    setPendingCandidateEdits,
    rosterCandidateMatchMap,
    findRosterMatch,
    mergeRosterCandidateIntoExisting,
    resolveRosterCandidate,
    addPilotAlias,
    onSourcePreview,
}) => (
    <div className={containerClassName}>
        <div className={`md3-card mg-surface shadow-lg p-3 border flex flex-col gap-2 h-full min-h-0 ${panelMode === 'ocr-work'
            ? 'border-info/40 ring-1 ring-info/25'
            : 'border-md-sys-outline/12'
            }`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ScanEye size={14} className="text-info" />
                    <div className="text-label-sm font-semibold uppercase tracking-wide text-info">OCR Roster Workbench</div>
                </div>
                <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-info-soft text-info">
                    {ocrWorkbenchCount}
                </span>
            </div>
            <p className="text-label-xs text-md-sys-on-surface/62">
                Review OCR-detected roster names, add them as new pilots, or merge them into an existing identity without hiding your roster list.
            </p>
            <div className="ocr-workbench-role-conflicts rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-label-sm font-semibold uppercase tracking-wide text-danger">Role conflicts</div>
                        <div className="text-label-xs text-md-sys-on-surface/62">
                            Same resolved player was detected on both teams in these matches. They stay in total encounters but do not count toward teammate or opponent stats until reviewed.
                        </div>
                    </div>
                    <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-danger/12 text-danger shrink-0">
                        {roleConflictWorkbenchItems.length}
                    </span>
                </div>
                {roleConflictWorkbenchItems.length === 0 ? (
                    <div className="rounded-lg border border-md-sys-outline/12 bg-md-sys-surface px-3 py-2 text-label-sm text-md-sys-on-surface/50">
                        No unresolved role conflicts right now.
                    </div>
                ) : (
                    <div className="max-h-60 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2">
                        {roleConflictWorkbenchItems.map((item) => (
                            <div key={item.key} className="ocr-workbench-role-conflict-row rounded-lg px-3 py-2.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-label-sm font-semibold text-md-sys-on-surface truncate">
                                            {item.playerName}
                                        </div>
                                        <div className="mt-1 text-label-xs text-md-sys-on-surface/58">
                                            Match #{item.matchId} · {item.displayTimestamp}
                                        </div>
                                        <div className="mt-1 text-label-xs text-md-sys-on-surface/58">
                                            {item.relativeTimestamp} · {item.shipLabel}
                                        </div>
                                    </div>
                                    <span className={`rounded-pill px-2 py-0.5 text-label-xs font-bold uppercase tracking-wide shrink-0 ${
                                        item.result === 'Win'
                                            ? 'bg-success/15 text-success'
                                            : item.result === 'Loss'
                                                ? 'bg-danger/15 text-danger'
                                                : 'bg-md-sys-primary/12 text-md-sys-primary'
                                    }`}>
                                        {item.result}
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => onResolveRoleConflict(item.matchId, item.playerName, 'teammate')}
                                        className="px-2.5 py-1.5 rounded-md text-label-xs font-bold bg-success/15 text-success hover:bg-success/25"
                                    >
                                        Count as teammate
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onResolveRoleConflict(item.matchId, item.playerName, 'opponent')}
                                        className="px-2.5 py-1.5 rounded-md text-label-xs font-bold bg-danger/12 text-danger hover:bg-danger/20"
                                    >
                                        Count as opponent
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onOpenMatchInSmartCaptures(item.matchId)}
                                        className="px-2.5 py-1.5 rounded-md text-label-xs font-bold bg-info/15 text-info hover:bg-info/25"
                                    >
                                        Open in Smart Captures
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {possibleMergeGroups.length === 0 ? (
                <div className="px-1 text-label-xs text-md-sys-on-surface/50">
                    No merge candidates found
                </div>
            ) : (
                <div className="rounded-xl border border-warning-soft bg-warning-soft/20">
                    <button
                        type="button"
                        onClick={() => setPossibleMergesExpanded((prev) => !prev)}
                        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
                        aria-expanded={possibleMergesExpanded}
                        aria-label={`${possibleMergesExpanded ? 'Collapse' : 'Expand'} possible merges`}
                    >
                        <div>
                            <div className="text-label-sm font-semibold uppercase tracking-wide text-warning">Possible Merges</div>
                            <div className="text-label-xs text-md-sys-on-surface/62">
                                {possibleMergeGroups.length} roster merge candidate{possibleMergeGroups.length === 1 ? '' : 's'} need review
                            </div>
                        </div>
                        <div className={`transition-transform ${possibleMergesExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight size={14} className="text-warning" />
                        </div>
                    </button>
                    {possibleMergesExpanded && (
                        <div className="px-3 pb-3 flex flex-col gap-2">
                            {possibleMergeGroups.map((group) => (
                                <div key={group.pairKeys.join('|')} className="rounded-lg border border-warning-soft/80 bg-md-sys-surface px-3 py-2.5 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-label-sm font-semibold text-warning truncate">
                                                Keep &quot;{group.canonicalDisplayName}&quot;
                                            </div>
                                            <div className="text-label-xs text-md-sys-on-surface/58">
                                                Highest similarity: {Math.round(group.score)}%
                                            </div>
                                        </div>
                                        <span className="text-label-xs font-bold px-2 py-0.5 rounded-pill bg-warning-soft text-warning shrink-0">
                                            {group.variants.length + 1} names
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="px-2 py-1 rounded-pill bg-warning text-ink-strong text-label-xs font-bold">
                                            Keep &quot;{group.canonicalDisplayName}&quot;
                                        </span>
                                        {group.variants.map((variant) => (
                                            <span
                                                key={`${group.canonicalName}-${variant.name}`}
                                                className="px-2 py-1 rounded-pill bg-md-sys-on-surface/8 text-label-xs font-semibold text-md-sys-on-surface/72"
                                            >
                                                Merge &quot;{variant.displayName}&quot; into &quot;{group.canonicalDisplayName}&quot; ({Math.round(variant.score)}%)
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => onMergeSuggestionGroup(group)}
                                            className="flex-1 h-8 rounded-md text-label-xs font-bold bg-warning text-ink-strong hover:brightness-95"
                                            aria-label={`Merge listed roster variants into ${group.canonicalDisplayName}`}
                                        >
                                            Merge into &quot;{group.canonicalDisplayName}&quot;
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDismissMergeSuggestionGroup(group)}
                                            className="flex-1 h-8 rounded-md text-label-xs font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/15"
                                            aria-label={`Dismiss possible merge suggestions for ${group.canonicalDisplayName}`}
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
            <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 pointer-events-none" />
                <input
                    type="text"
                    value={ocrSearchTerm}
                    onChange={(event) => setOcrSearchTerm(event.target.value)}
                    placeholder="Search OCR candidates..."
                    className="w-full md3-textfield--outlined rounded-xl pl-8 pr-8 py-1.5 text-label-sm outline-none"
                />
                {ocrSearchTerm && (
                    <button
                        type="button"
                        onClick={() => setOcrSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                        aria-label="Clear OCR candidate search"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            <div className="flex-1 min-h-0">
                {pendingRosterCandidates.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-8 text-md-sys-on-surface/40">
                        <ScanEye size={24} className="mb-2 opacity-40" />
                        <span className="text-label-sm font-semibold">No pending OCR roster candidates</span>
                    </div>
                ) : filteredOcrCandidates.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-8 text-md-sys-on-surface/40">
                        <Search size={20} className="mb-2 opacity-40" />
                        <span className="text-label-sm font-semibold">No OCR candidates match your search</span>
                    </div>
                ) : (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
                        <div className="flex flex-col gap-2 content-start">
                            {filteredOcrCandidates.map((candidate) => {
                                const pendingValue = pendingCandidateEdits[candidate.id] ?? candidate.value;
                                const sourceScreenshotPath = String(candidate.sourceCapture?.screenshotPath || '').trim();
                                const sourceScreenshotLabel = String(candidate.sourceCapture?.screenshotLabel || 'Captured Screenshot').trim() || 'Captured Screenshot';
                                const sourceCapturedAt = Number(candidate.sourceCapture?.capturedAt || 0);
                                const sourceCapturedLabel = Number.isFinite(sourceCapturedAt) && sourceCapturedAt > 0
                                    ? new Date(sourceCapturedAt).toLocaleString()
                                    : '';
                                const normalizedPendingValue = normalizeOcrName(pendingValue);
                                const existingRosterMatch = rosterCandidateMatchMap.get(candidate.id) ?? findRosterMatch(pendingValue);
                                const mergeSuggestions = [
                                    candidate.bestMatch && normalizeOcrName(candidate.bestMatch).toLowerCase() !== normalizeOcrName(candidate.value).toLowerCase()
                                        ? {
                                            name: normalizeOcrName(candidate.bestMatch),
                                            score: Number(candidate.bestScore || 0),
                                            kind: 'best' as const,
                                        }
                                        : null,
                                    ...((candidate.suggestions || []).map((suggestion) => ({
                                        name: normalizeOcrName(suggestion.name),
                                        score: Number(suggestion.score || 0),
                                        kind: 'suggestion' as const,
                                    }))),
                                ]
                                    .filter((entry): entry is { name: string; score: number; kind: 'best' | 'suggestion' } => Boolean(entry?.name))
                                    .filter((entry, index, list) => (
                                        normalizeOcrName(entry.name).toLowerCase() !== normalizedPendingValue.toLowerCase()
                                        && (!existingRosterMatch || normalizeOcrName(entry.name).toLowerCase() !== normalizeOcrName(existingRosterMatch).toLowerCase())
                                        && list.findIndex((candidateEntry) => normalizeOcrName(candidateEntry.name).toLowerCase() === normalizeOcrName(entry.name).toLowerCase()) === index
                                    ))
                                    .slice(0, 4);
                                return (
                                    <div key={candidate.id} className="rounded-xl border border-md-sys-outline/14 bg-md-sys-surface-container p-2.5 space-y-2">
                                        <input
                                            type="text"
                                            value={pendingValue}
                                            onChange={(event) => setPendingCandidateEdits((prev) => ({
                                                ...prev,
                                                [candidate.id]: event.target.value,
                                            }))}
                                            onKeyDown={(event) => {
                                                event.stopPropagation();
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    resolveRosterCandidate(candidate, 'approve', pendingValue);
                                                }
                                            }}
                                            className="md3-textfield md3-textfield--outlined w-full text-label-sm font-semibold"
                                            aria-label={`Pending OCR roster candidate ${candidate.id}`}
                                        />
                                        {sourceScreenshotPath && (
                                            <div className="rounded-lg border border-md-sys-outline/16 bg-md-sys-surface px-2 py-1.5 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-label-xs font-semibold truncate text-md-sys-on-surface/75">
                                                        Source: {sourceScreenshotLabel}
                                                    </div>
                                                    {sourceCapturedLabel && (
                                                        <div className="text-label-xs text-md-sys-on-surface/50 truncate">
                                                            Captured: {sourceCapturedLabel}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onSourcePreview({ src: sourceScreenshotPath, label: sourceScreenshotLabel })}
                                                    className="h-7 px-2 rounded-md text-label-xs font-bold bg-info/15 text-info hover:bg-info/25 inline-flex items-center gap-1 shrink-0"
                                                >
                                                    <ImageIcon size={12} />
                                                    View Source
                                                </button>
                                            </div>
                                        )}
                                        {(existingRosterMatch || mergeSuggestions.length > 0) && (
                                            <div className="rounded-lg border border-warning-soft bg-warning-soft/30 px-2.5 py-2 space-y-2">
                                                <div className="text-label-xs font-semibold uppercase tracking-wide text-warning">
                                                    Possible existing identity
                                                </div>
                                                {existingRosterMatch && (
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => mergeRosterCandidateIntoExisting(candidate, existingRosterMatch, pendingValue)}
                                                            className="flex-1 flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left bg-md-sys-surface hover:bg-md-sys-surface-container-high"
                                                        >
                                                            <span className="text-label-sm font-semibold text-md-sys-on-surface truncate">
                                                                Use existing: {existingRosterMatch}
                                                            </span>
                                                            <span className="text-label-xs font-bold uppercase text-warning">Match</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { addPilotAlias(existingRosterMatch, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                                            className="px-2.5 py-1.5 rounded-md text-label-xs font-bold bg-md-sys-primary/15 text-md-sys-primary hover:bg-md-sys-primary/25 shrink-0"
                                                            title={`Add "${pendingValue}" as alias of ${existingRosterMatch}`}
                                                        >
                                                            As alias
                                                        </button>
                                                    </div>
                                                )}
                                                {mergeSuggestions.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {mergeSuggestions.map((suggestion) => (
                                                            <div key={`${candidate.id}-${suggestion.name}-${suggestion.kind}`} className="flex rounded-md overflow-hidden">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => mergeRosterCandidateIntoExisting(candidate, suggestion.name, pendingValue)}
                                                                    className="px-2.5 py-1.5 text-label-xs font-bold bg-warning text-ink-strong hover:brightness-95"
                                                                >
                                                                    Merge into {suggestion.name}
                                                                    {suggestion.score > 0 ? ` (${Math.round(suggestion.score)}%)` : ''}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { addPilotAlias(suggestion.name, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                                                    className="px-2 py-1.5 text-label-xs font-bold bg-md-sys-primary/20 text-md-sys-primary hover:bg-md-sys-primary/30 border-l border-ink-strong/10"
                                                                    title={`Add "${pendingValue}" as alias of ${suggestion.name}`}
                                                                >
                                                                    as alias
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => resolveRosterCandidate(candidate, 'approve', pendingValue)}
                                                className="flex-1 h-8 rounded-md text-label-xs font-bold bg-success/15 text-success hover:bg-success/25 disabled:opacity-disabled"
                                                disabled={!pendingValue.trim() || !!existingRosterMatch}
                                            >
                                                Add as New
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => resolveRosterCandidate(candidate, 'dismiss', pendingValue)}
                                                className="flex-1 h-8 rounded-md text-label-xs font-bold bg-md-sys-on-surface/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/15"
                                                disabled={!pendingValue.trim()}
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
);
