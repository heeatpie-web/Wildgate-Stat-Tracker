import React, { useState, useDeferredValue, useMemo, useCallback, type Dispatch, type FC, type SetStateAction } from 'react';
import { Search, ScanEye, X, Image as ImageIcon, ChevronRight, Users, Merge, AlertTriangle, RefreshCw, CheckCheck, XCircle } from 'lucide-react';
import type { PendingReview } from '../../store/slices/createDataSlice';
import { normalizeOcrName } from '../../utils/stringUtils';
import { ConfidenceMeter } from '../ConfidenceMeter';
import type { RosterMergeSuggestionGroup } from '../../utils/rosterMergeSuggestions';
import type { RoleConflictWorkbenchItem } from './playerHubTypes';

export interface PlayerHubOcrWorkbenchProps {
    containerClassName: string;
    panelMode: string;
    ocrWorkbenchCount: number;
    roleConflictWorkbenchItems: RoleConflictWorkbenchItem[];
    onResolveRoleConflict: (matchId: number, playerName: string, role: 'teammate' | 'opponent') => void;
    onOpenMatchInSmartCaptures: (matchId: number) => void;
    possibleMergeGroups: RosterMergeSuggestionGroup[];
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
    onBatchAcceptHighConfidence?: (candidates: PendingReview[]) => void;
    onBatchDismissLowConfidence?: (candidates: PendingReview[]) => void;
    onRequestRerunOcr?: () => void;
    rerunOcrDisabled?: boolean;
    isRerunningOcr?: boolean;
}

type WorkbenchTab = 'candidates' | 'conflicts' | 'merges';

const pillStyle = (active: boolean, color?: 'danger' | 'warning') => {
    if (active) {
        if (color === 'danger') return 'border-danger/30 bg-danger/10 text-danger';
        if (color === 'warning') return 'border-warning/30 bg-warning/10 text-warning';
        return 'border-info/30 bg-info/10 text-info';
    }
    return 'border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06]';
};

interface CandidateRowProps {
    candidate: PendingReview;
    pendingValue: string;
    existingRosterMatch: string | null | undefined;
    onEditValue: (id: string, value: string) => void;
    resolveRosterCandidate: PlayerHubOcrWorkbenchProps['resolveRosterCandidate'];
    mergeRosterCandidateIntoExisting: PlayerHubOcrWorkbenchProps['mergeRosterCandidateIntoExisting'];
    addPilotAlias: PlayerHubOcrWorkbenchProps['addPilotAlias'];
    findRosterMatch: PlayerHubOcrWorkbenchProps['findRosterMatch'];
    onSourcePreview: PlayerHubOcrWorkbenchProps['onSourcePreview'];
}

const CandidateRow = React.memo<CandidateRowProps>(({
    candidate,
    pendingValue,
    existingRosterMatch,
    onEditValue,
    resolveRosterCandidate,
    mergeRosterCandidateIntoExisting,
    addPilotAlias,
    onSourcePreview,
}) => {
    const sourceScreenshotPath = String(candidate.sourceCapture?.screenshotPath || '').trim();
    const sourceScreenshotLabel = String(candidate.sourceCapture?.screenshotLabel || 'Captured Screenshot').trim() || 'Captured Screenshot';
    const sourceCapturedAt = Number(candidate.sourceCapture?.capturedAt || 0);
    const sourceCapturedLabel = Number.isFinite(sourceCapturedAt) && sourceCapturedAt > 0
        ? new Date(sourceCapturedAt).toLocaleString()
        : '';
    const normalizedPendingValue = normalizeOcrName(pendingValue);

    const mergeSuggestions = useMemo(() => {
        // e.name is already normalizeOcrName-applied, so no double-normalize needed for dedup
        const entries = [
            candidate.bestMatch && normalizeOcrName(candidate.bestMatch).toLowerCase() !== normalizeOcrName(candidate.value).toLowerCase()
                ? { name: normalizeOcrName(candidate.bestMatch), score: Number(candidate.bestScore || 0), kind: 'best' as const }
                : null,
            ...((candidate.suggestions || []).map((s) => ({
                name: normalizeOcrName(s.name),
                score: Number(s.score || 0),
                kind: 'suggestion' as const,
            }))),
        ].filter((e): e is { name: string; score: number; kind: 'best' | 'suggestion' } => Boolean(e?.name));

        const pendingLower = normalizedPendingValue.toLowerCase();
        const existingLower = existingRosterMatch ? normalizeOcrName(existingRosterMatch).toLowerCase() : null;
        const seen = new Set<string>();
        const result: typeof entries = [];
        for (const e of entries) {
            const key = e.name.toLowerCase();
            if (key === pendingLower) continue;
            if (existingLower && key === existingLower) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(e);
            if (result.length >= 4) break;
        }
        return result;
    }, [candidate.bestMatch, candidate.bestScore, candidate.suggestions, candidate.value, normalizedPendingValue, existingRosterMatch]);

    const hasIdentityHints = existingRosterMatch || mergeSuggestions.length > 0;

    return (
        <div className="border-b border-md-sys-outline/[0.06] px-4 py-4 space-y-3">
            <input
                type="text"
                value={pendingValue}
                onChange={(e) => onEditValue(candidate.id, e.target.value)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        resolveRosterCandidate(candidate, 'approve', pendingValue);
                    }
                }}
                className="w-full px-3 py-2 text-label-sm font-semibold text-md-sys-on-surface outline-none rounded-control border border-md-sys-outline/15 focus:border-md-sys-primary/40 focus:ring-2 focus:ring-md-sys-primary/10 transition-all"
                style={{ background: 'var(--md-sys-color-surface-container)' }}
                aria-label={`OCR candidate name ${candidate.id}`}
            />

            {candidate.originalConfidence > 0 && (
                <ConfidenceMeter confidence={candidate.originalConfidence} size="sm" />
            )}

            {hasIdentityHints && (
                <div className="space-y-2">
                    <div className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">
                        Possible existing identity
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {existingRosterMatch && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => mergeRosterCandidateIntoExisting(candidate, existingRosterMatch, pendingValue)}
                                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-control border border-md-sys-outline/15 text-left transition-colors hover:bg-md-sys-on-surface/[0.06]"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                >
                                    <span className="text-label-sm font-semibold text-md-sys-on-surface truncate">{existingRosterMatch}</span>
                                    <span className="text-label-xs font-bold text-success shrink-0">exact match</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { addPilotAlias(existingRosterMatch, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                    className="h-9 px-2.5 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] shrink-0 transition-colors"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                    title={`Add "${pendingValue}" as alias of ${existingRosterMatch}`}
                                >
                                    As alias
                                </button>
                            </div>
                        )}
                        {mergeSuggestions.map((s) => (
                            <div key={`${candidate.id}-${s.name}-${s.kind}`} className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => mergeRosterCandidateIntoExisting(candidate, s.name, pendingValue)}
                                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-control border border-md-sys-outline/15 text-left transition-colors hover:bg-md-sys-on-surface/[0.06]"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                >
                                    <span className="text-label-sm font-semibold text-md-sys-on-surface truncate">{s.name}</span>
                                    {s.score > 0 && (
                                        <span className="text-label-xs font-bold text-warning shrink-0">{Math.round(s.score)}%</span>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { addPilotAlias(s.name, pendingValue); resolveRosterCandidate(candidate, 'dismiss', pendingValue); }}
                                    className="h-9 px-2.5 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] shrink-0 transition-colors"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                    title={`Add "${pendingValue}" as alias of ${s.name}`}
                                >
                                    As alias
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sourceScreenshotPath && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-control border border-md-sys-outline/[0.08]" style={{ background: 'var(--md-sys-color-surface-container)' }}>
                    <div className="min-w-0">
                        <div className="text-label-xs font-medium text-md-sys-on-surface/60 truncate">{sourceScreenshotLabel}</div>
                        {sourceCapturedLabel && (
                            <div className="text-label-xs text-md-sys-on-surface/40 truncate">{sourceCapturedLabel}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onSourcePreview({ src: sourceScreenshotPath, label: sourceScreenshotLabel })}
                        className="h-7 px-2.5 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-info hover:bg-info/8 inline-flex items-center gap-1.5 shrink-0 transition-colors"
                        style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                    >
                        <ImageIcon size={11} />
                        View
                    </button>
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => resolveRosterCandidate(candidate, 'approve', pendingValue)}
                    disabled={!pendingValue.trim() || !!existingRosterMatch}
                    className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-success/25 bg-success/10 text-success hover:bg-success/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Add as New
                </button>
                <button
                    type="button"
                    onClick={() => resolveRosterCandidate(candidate, 'dismiss', pendingValue)}
                    disabled={!pendingValue.trim()}
                    className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
});

export const PlayerHubOcrWorkbench: FC<PlayerHubOcrWorkbenchProps> = ({
    containerClassName,
    ocrWorkbenchCount,
    roleConflictWorkbenchItems,
    onResolveRoleConflict,
    onOpenMatchInSmartCaptures,
    possibleMergeGroups,
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
    onBatchAcceptHighConfidence,
    onBatchDismissLowConfidence,
    onRequestRerunOcr,
    rerunOcrDisabled = false,
    isRerunningOcr = false,
}) => {
    const [activeTab, setActiveTab] = useState<WorkbenchTab>('candidates');

    const handleEditValue = useCallback((id: string, value: string) => {
        setPendingCandidateEdits((prev) => ({ ...prev, [id]: value }));
    }, [setPendingCandidateEdits]);

    const highConfidenceCandidates = useMemo(() =>
        pendingRosterCandidates.filter(c => c.originalConfidence >= 80),
        [pendingRosterCandidates]
    );
    const lowConfidenceCandidates = useMemo(() =>
        pendingRosterCandidates.filter(c => c.originalConfidence < 40),
        [pendingRosterCandidates]
    );

    const tabs: { id: WorkbenchTab; label: string; count: number; color?: 'danger' | 'warning' }[] = [
        { id: 'candidates', label: 'Candidates', count: pendingRosterCandidates.length },
        { id: 'conflicts', label: 'Conflicts', count: roleConflictWorkbenchItems.length, color: 'danger' },
        { id: 'merges', label: 'Merge Suggestions', count: possibleMergeGroups.length, color: 'warning' },
    ];

    return (
        <div className={containerClassName}>
            <div className="rounded-card overflow-hidden border border-md-sys-outline/10 mg-surface shadow-xl flex flex-col h-full min-h-0">

                {/* Tab bar */}
                <div className="px-4 pt-4 pb-3 border-b border-md-sys-outline/[0.06] shrink-0 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-card bg-gradient-to-br from-info/20 to-md-sys-primary/15 border border-md-sys-outline/10 flex items-center justify-center shrink-0">
                            <ScanEye size={16} className="text-info" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-bold tracking-tight text-md-sys-on-surface">OCR Workbench</h2>
                            <p className="text-label-sm text-md-sys-on-surface/40 font-medium">
                                {ocrWorkbenchCount} item{ocrWorkbenchCount !== 1 ? 's' : ''} to review
                            </p>
                        </div>
                        {onRequestRerunOcr && (
                            <button
                                type="button"
                                onClick={onRequestRerunOcr}
                                disabled={rerunOcrDisabled || isRerunningOcr}
                                className="h-8 px-2.5 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shrink-0 transition-colors"
                                style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                title="Rerun OCR on latest screenshots"
                            >
                                <RefreshCw size={12} className={isRerunningOcr ? 'animate-spin' : ''} />
                                Rerun
                            </button>
                        )}
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
                                                ? tab.color === 'danger' ? 'bg-danger/20' : tab.color === 'warning' ? 'bg-warning/20' : 'bg-info/20'
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

                {/* Candidates tab */}
                {activeTab === 'candidates' && (
                    <div className="flex flex-col flex-1 min-h-0">
                        {/* Batch actions */}
                        {pendingRosterCandidates.length > 0 && (onBatchAcceptHighConfidence || onBatchDismissLowConfidence) && (
                            <div className="px-4 pt-3 pb-2 border-b border-md-sys-outline/[0.06] shrink-0 flex items-center gap-1.5 flex-wrap">
                                {onBatchAcceptHighConfidence && highConfidenceCandidates.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onBatchAcceptHighConfidence(highConfidenceCandidates)}
                                        className="h-7 px-2.5 rounded-control text-label-xs font-semibold border border-success/25 bg-success/10 text-success hover:bg-success/15 inline-flex items-center gap-1.5 transition-colors"
                                    >
                                        <CheckCheck size={12} />
                                        Accept {highConfidenceCandidates.length} high conf.
                                    </button>
                                )}
                                {onBatchDismissLowConfidence && lowConfidenceCandidates.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onBatchDismissLowConfidence(lowConfidenceCandidates)}
                                        className="h-7 px-2.5 rounded-control text-label-xs font-semibold border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15 inline-flex items-center gap-1.5 transition-colors"
                                    >
                                        <XCircle size={12} />
                                        Dismiss {lowConfidenceCandidates.length} low conf.
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Search */}
                        <div className="px-4 py-3 border-b border-md-sys-outline/[0.06] shrink-0">
                            <div className="relative group">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 group-focus-within:text-md-sys-primary transition-colors pointer-events-none" />
                                <input
                                    type="text"
                                    value={ocrSearchTerm}
                                    onChange={(e) => setOcrSearchTerm(e.target.value)}
                                    placeholder="Search candidates..."
                                    className="w-full pl-9 pr-9 py-2 text-label-sm outline-none text-md-sys-on-surface rounded-control border border-md-sys-outline/10 focus:border-md-sys-primary/40 focus:ring-2 focus:ring-md-sys-primary/10 transition-all"
                                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                                />
                                {ocrSearchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setOcrSearchTerm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                        aria-label="Clear search"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Candidate list */}
                        {pendingRosterCandidates.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-md-sys-on-surface/40">
                                <ScanEye size={28} className="mb-2 opacity-40" />
                                <span className="text-label-sm font-semibold">No pending OCR candidates</span>
                            </div>
                        ) : filteredOcrCandidates.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-md-sys-on-surface/40">
                                <Search size={24} className="mb-2 opacity-40" />
                                <span className="text-label-sm font-semibold">No candidates match your search</span>
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                {filteredOcrCandidates.map((candidate) => (
                                    <CandidateRow
                                        key={candidate.id}
                                        candidate={candidate}
                                        pendingValue={pendingCandidateEdits[candidate.id] ?? candidate.value}
                                        existingRosterMatch={rosterCandidateMatchMap.get(candidate.id) ?? findRosterMatch(pendingCandidateEdits[candidate.id] ?? candidate.value)}
                                        onEditValue={handleEditValue}
                                        resolveRosterCandidate={resolveRosterCandidate}
                                        mergeRosterCandidateIntoExisting={mergeRosterCandidateIntoExisting}
                                        addPilotAlias={addPilotAlias}
                                        findRosterMatch={findRosterMatch}
                                        onSourcePreview={onSourcePreview}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Conflicts tab */}
                {activeTab === 'conflicts' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {roleConflictWorkbenchItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-md-sys-on-surface/40">
                                <AlertTriangle size={28} className="mb-2 opacity-40" />
                                <span className="text-label-sm font-semibold">No role conflicts</span>
                                <span className="text-label-xs mt-1 opacity-70">All players have consistent team assignments</span>
                            </div>
                        ) : (
                            <div className="p-4 space-y-3">
                                <p className="text-label-xs text-md-sys-on-surface/50">
                                    These players were detected on both teams in the same match. Encounters stay in totals but won't count toward teammate or opponent stats until resolved.
                                </p>
                                {roleConflictWorkbenchItems.map((item) => (
                                    <div key={item.key} className="rounded-card border border-md-sys-outline/10 overflow-hidden" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                                        <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-md-sys-outline/[0.06]">
                                            <div className="min-w-0">
                                                <div className="text-label-sm font-semibold text-md-sys-on-surface truncate">{item.playerName}</div>
                                                <div className="mt-0.5 text-label-xs text-md-sys-on-surface/50">
                                                    Match #{item.matchId} · {item.displayTimestamp} · {item.relativeTimestamp}
                                                </div>
                                                <div className="mt-0.5 text-label-xs text-md-sys-on-surface/50">{item.shipLabel}</div>
                                            </div>
                                            <span className={`rounded-pill px-2 py-0.5 text-label-xs font-bold uppercase tracking-wide shrink-0 ${
                                                item.result === 'Win' ? 'bg-success/15 text-success'
                                                : item.result === 'Loss' ? 'bg-danger/15 text-danger'
                                                : 'bg-md-sys-on-surface/10 text-md-sys-on-surface/60'
                                            }`}>
                                                {item.result}
                                            </span>
                                        </div>
                                        <div className="px-4 py-3 flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onResolveRoleConflict(item.matchId, item.playerName, 'teammate')}
                                                className="h-8 px-3 rounded-control text-label-xs font-semibold border border-success/25 bg-success/10 text-success hover:bg-success/15 transition-colors"
                                            >
                                                Teammate
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onResolveRoleConflict(item.matchId, item.playerName, 'opponent')}
                                                className="h-8 px-3 rounded-control text-label-xs font-semibold border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15 transition-colors"
                                            >
                                                Opponent
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onOpenMatchInSmartCaptures(item.matchId)}
                                                className="h-8 px-3 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/55 hover:bg-md-sys-on-surface/[0.06] inline-flex items-center gap-1 transition-colors"
                                                style={{ background: 'var(--md-sys-color-surface-container)' }}
                                            >
                                                Open match
                                                <ChevronRight size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Merge suggestions tab */}
                {activeTab === 'merges' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {possibleMergeGroups.length === 0 ? (
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
                                {possibleMergeGroups.map((group) => (
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
            </div>
        </div>
    );
};
