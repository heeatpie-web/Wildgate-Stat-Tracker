import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, RefreshCw, ArrowRight } from 'lucide-react';
import type { Match } from '../types';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface RerunProposal {
    /** The match as currently confirmed/stored. */
    match: Match;
    /** The match with the freshly reran OCR applied (clean-replace). */
    proposed: Match;
}

interface RerunReviewModalProps {
    proposals: RerunProposal[];
    /** Persist a single reran result into the confirmed data. */
    onApply: (proposed: Match) => void;
    /** Close without resolving the rest. */
    onClose: () => void;
    /** Optional display formatter (e.g. to mark the active user as "(you)"). */
    formatName?: (name: string) => string;
}

const norm = (value: string): string => String(value || '').trim().toLowerCase();

const teamNames = (match: Match): string[] => (
    (match.opponentTeams || [])
        .map((team) => String(team?.teamName || '').trim())
        .filter(Boolean)
);

interface NameDiff {
    added: string[];   // in reran, not in confirmed
    removed: string[]; // in confirmed, not in reran
    unchanged: string[];
}

const diffNames = (prev: string[], next: string[]): NameDiff => {
    const prevKeys = new Set(prev.map(norm));
    const nextKeys = new Set(next.map(norm));
    return {
        added: next.filter((n) => !prevKeys.has(norm(n))),
        removed: prev.filter((p) => !nextKeys.has(norm(p))),
        unchanged: next.filter((n) => prevKeys.has(norm(n))),
    };
};

const matchLabel = (match: Match): string => {
    const when = match.timestamp ? new Date(match.timestamp).toLocaleString() : '';
    const result = match.result ? ` · ${match.result}` : '';
    return `Match #${match.id}${result}${when ? ` · ${when}` : ''}`;
};

const NameColumn: React.FC<{
    title: string;
    names: string[];
    highlight: Set<string>;
    tone: 'add' | 'remove';
    formatName: (name: string) => string;
}> = ({ title, names, highlight, tone, formatName }) => (
    <div className="flex-1 min-w-0">
        <div className="text-label-xs font-bold uppercase tracking-wider text-md-sys-on-surface/35 mb-1">{title}</div>
        {names.length === 0 ? (
            <div className="text-label-xs text-md-sys-on-surface/30 italic">—</div>
        ) : (
            <div className="flex flex-wrap gap-1">
                {names.map((name, i) => {
                    const isHot = highlight.has(norm(name));
                    const cls = isHot
                        ? (tone === 'add'
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-danger/30 bg-danger/10 text-danger line-through opacity-80')
                        : 'border-md-sys-outline/[0.08] text-md-sys-on-surface/65';
                    return (
                        <span
                            key={`${name}-${i}`}
                            className={`px-2 py-0.5 rounded-control text-label-xs font-medium border ${cls}`}
                            style={!isHot ? { background: 'var(--md-sys-color-surface-container)' } : undefined}
                        >
                            {formatName(name)}
                        </span>
                    );
                })}
            </div>
        )}
    </div>
);

const DiffRow: React.FC<{
    label: string;
    prev: string[];
    next: string[];
    formatName: (name: string) => string;
}> = ({ label, prev, next, formatName }) => {
    const diff = diffNames(prev, next);
    if (diff.added.length === 0 && diff.removed.length === 0 && prev.length === 0 && next.length === 0) {
        return null;
    }
    const changed = diff.added.length > 0 || diff.removed.length > 0;
    return (
        <div className="py-2 border-b border-md-sys-outline/[0.05] last:border-b-0">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-label-sm font-semibold text-md-sys-on-surface/70">{label}</span>
                {changed ? (
                    <span className="text-label-xs font-bold text-warning">changed</span>
                ) : (
                    <span className="text-label-xs text-md-sys-on-surface/30">no change</span>
                )}
            </div>
            <div className="flex items-start gap-3">
                <NameColumn title="Confirmed" names={prev} highlight={new Set(diff.removed.map(norm))} tone="remove" formatName={formatName} />
                <ArrowRight size={14} className="text-md-sys-on-surface/25 mt-5 shrink-0" />
                <NameColumn title="Reran (new)" names={next} highlight={new Set(diff.added.map(norm))} tone="add" formatName={formatName} />
            </div>
        </div>
    );
};

const ProposalCard: React.FC<{
    proposal: RerunProposal;
    onApply: () => void;
    onKeep: () => void;
    formatName: (name: string) => string;
}> = ({ proposal, onApply, onKeep, formatName }) => {
    const { match, proposed } = proposal;
    const hasChanges = useMemo(() => {
        const fields: Array<[string[], string[]]> = [
            [match.teammates || [], proposed.teammates || []],
            [match.opponents || [], proposed.opponents || []],
            [teamNames(match), teamNames(proposed)],
            [match.reachModifiers || [], proposed.reachModifiers || []],
            [[String(match.ship || '')].filter(Boolean), [String(proposed.ship || '')].filter(Boolean)],
        ];
        return fields.some(([a, b]) => {
            const d = diffNames(a, b);
            return d.added.length > 0 || d.removed.length > 0;
        });
    }, [match, proposed]);

    return (
        <div className="rounded-card border border-md-sys-outline/10 overflow-hidden" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
            <div className="px-4 py-2.5 border-b border-md-sys-outline/[0.06] flex items-center justify-between gap-2">
                <span className="text-label-sm font-semibold text-md-sys-on-surface/80 truncate">{matchLabel(match)}</span>
                {!hasChanges && <span className="text-label-xs text-md-sys-on-surface/40 shrink-0">no differences</span>}
            </div>
            <div className="px-4 py-2">
                <DiffRow label="Ship" prev={[String(match.ship || '')].filter(Boolean)} next={[String(proposed.ship || '')].filter(Boolean)} formatName={formatName} />
                <DiffRow label="Teammates" prev={match.teammates || []} next={proposed.teammates || []} formatName={formatName} />
                <DiffRow label="Opponents" prev={match.opponents || []} next={proposed.opponents || []} formatName={formatName} />
                <DiffRow label="Enemy ships/teams" prev={teamNames(match)} next={teamNames(proposed)} formatName={formatName} />
                <DiffRow label="Modifiers" prev={match.reachModifiers || []} next={proposed.reachModifiers || []} formatName={formatName} />
            </div>
            <div className="px-4 py-2.5 flex gap-1.5 border-t border-md-sys-outline/[0.06]">
                <button
                    type="button"
                    onClick={onApply}
                    className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-primary/30 bg-md-sys-primary/10 text-md-sys-primary hover:bg-md-sys-primary/15 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                    <Check size={13} /> Apply reran
                </button>
                <button
                    type="button"
                    onClick={onKeep}
                    className="flex-1 h-8 rounded-control text-label-xs font-semibold border border-md-sys-outline/10 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/[0.06] transition-colors inline-flex items-center justify-center gap-1.5"
                    style={{ background: 'var(--md-sys-color-surface-container)' }}
                >
                    <X size={13} /> Keep confirmed
                </button>
            </div>
        </div>
    );
};

export const RerunReviewModal: React.FC<RerunReviewModalProps> = ({
    proposals,
    onApply,
    onClose,
    formatName = (name) => name,
}) => {
    const titleId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
    // Locally track which match proposals remain unresolved.
    const [resolved, setResolved] = useState<Set<number>>(new Set());

    useKeyboardShortcuts([{ key: 'Escape', handler: () => onClose() }], true);

    const remaining = proposals.filter((p) => !resolved.has(p.match.id));

    // Auto-close once every proposal has been resolved (applied or kept).
    useEffect(() => {
        if (proposals.length > 0 && resolved.size >= proposals.length) {
            onClose();
        }
    }, [resolved, proposals.length, onClose]);

    const resolve = (matchId: number) => {
        setResolved((prev) => {
            const next = new Set(prev);
            next.add(matchId);
            return next;
        });
    };

    const handleApply = (proposal: RerunProposal) => {
        onApply(proposal.proposed);
        resolve(proposal.match.id);
    };

    const handleApplyAll = () => {
        remaining.forEach((p) => onApply(p.proposed));
        onClose();
    };

    if (proposals.length === 0) return null;

    return createPortal(
        <div className="fixed inset-0 md3-dialog-scrim z-modal-top flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="md3-dialog rounded-modal w-full max-w-2xl max-h-[85vh] flex flex-col border border-md-sys-outline/20 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 pt-5 pb-3 border-b border-md-sys-outline/[0.06] flex items-center gap-3 shrink-0">
                    <div className="h-9 w-9 rounded-card bg-md-sys-primary/15 border border-md-sys-outline/10 flex items-center justify-center shrink-0">
                        <RefreshCw size={15} className="text-md-sys-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-title font-bold text-md-sys-on-surface">Review reran OCR</h2>
                        <p className="text-label-sm text-md-sys-on-surface/45">
                            Compare confirmed vs reran results, then apply the ones that look right. {remaining.length} to review.
                        </p>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3">
                    {remaining.map((proposal) => (
                        <ProposalCard
                            key={proposal.match.id}
                            proposal={proposal}
                            onApply={() => handleApply(proposal)}
                            onKeep={() => resolve(proposal.match.id)}
                            formatName={formatName}
                        />
                    ))}
                </div>

                <div className="px-5 py-3 border-t border-md-sys-outline/[0.06] flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="md3-btn-text">Close</button>
                    <button type="button" onClick={handleApplyAll} className="md3-btn-filled" disabled={remaining.length === 0}>
                        Apply all reran ({remaining.length})
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default RerunReviewModal;
