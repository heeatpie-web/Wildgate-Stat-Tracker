import React, { useState } from 'react';

const HistoryTable = React.lazy(() => import('./HistoryTable'));
const MatchRecordingPage = React.lazy(() =>
    import('./MatchRecordingPage').then(m => ({ default: m.MatchRecordingPage }))
);

type HistoryTab = 'table' | 'log';

const TAB_LABELS: Array<{ id: HistoryTab; label: string }> = [
    { id: 'table', label: 'History' },
    { id: 'log', label: 'Match Log' },
];

interface HistoryViewProps {
    isActive: boolean;
}

/**
 * History workspace. The table is the sortable/filterable overview; the match
 * log is the browse-one-match-at-a-time view with full detail and inline edits.
 * Both stay mounted so switching tabs keeps scroll position and selection.
 */
export const HistoryView: React.FC<HistoryViewProps> = ({ isActive }) => {
    const [tab, setTab] = useState<HistoryTab>('table');

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
            <div
                className="flex w-fit items-center gap-1 rounded-2xl border border-md-sys-outline/10 bg-md-sys-surface-container-high/90 p-1 shadow-sm"
                role="tablist"
                aria-label="History workspaces"
            >
                {TAB_LABELS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={`rounded-xl px-3 py-1.5 text-label-xs font-black uppercase tracking-[0.18em] transition-all ${
                            tab === id
                                ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-sm'
                                : 'text-md-sys-on-surface/62 hover:bg-md-sys-on-surface/5'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className={tab === 'table' ? 'min-h-0 flex-1 overflow-y-auto custom-scrollbar' : 'hidden'}>
                <React.Suspense fallback={null}>
                    <HistoryTable isActive={isActive && tab === 'table'} />
                </React.Suspense>
            </div>
            <div className={tab === 'log' ? 'min-h-0 flex-1 overflow-hidden' : 'hidden'}>
                <React.Suspense fallback={null}>
                    <MatchRecordingPage />
                </React.Suspense>
            </div>
        </div>
    );
};

export default HistoryView;
