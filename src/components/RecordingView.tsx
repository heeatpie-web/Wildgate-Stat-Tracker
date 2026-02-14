import React from 'react';
import { SquadronPanel } from './recording/SquadronPanel';
import { RosterPanel } from './recording/RosterPanel';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
// TimelinePanel archived

interface RecordingViewProps {
    onSmartCaptureData?: (data: any) => void;
}

export const RecordingView: React.FC<RecordingViewProps> = ({ onSmartCaptureData }) => {
    const [viewport, setViewport] = React.useState(() => ({
        w: typeof window !== 'undefined' ? window.innerWidth : 1920,
        h: typeof window !== 'undefined' ? window.innerHeight : 1080,
    }));

    React.useEffect(() => {
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // The left Recording panel must never scroll at 1080p+ and should not introduce scrollbars at 1366x768.
    // On shorter heights, we swap content via tabs instead of allowing a scroll container.
    const isNarrow = viewport.w < 1100;
    const density: 'standard' | 'compact' = (viewport.h < 900 || isNarrow) ? 'compact' : 'standard';
    const [leftTab, setLeftTab] = React.useState<'actions' | 'loadout'>('actions');

    React.useEffect(() => {
        // In standard density we show both panels; keep the tab state stable for compact.
        if (density === 'standard') setLeftTab('actions');
    }, [density]);

    const LeftTabBar = density === 'compact' ? (
        <div className="grid grid-cols-2 gap-1 md3-surface rounded-xl p-0.5 border border-md-sys-outline/10 h-8">
            <button
                onClick={() => setLeftTab('actions')}
                className={`h-7 rounded-lg text-label-xs font-black uppercase tracking-widest transition-all ${leftTab === 'actions'
                        ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md'
                        : 'md3-surface text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                    }`}
            >
                Actions
            </button>
            <button
                onClick={() => setLeftTab('loadout')}
                className={`h-7 rounded-lg text-label-xs font-black uppercase tracking-widest transition-all ${leftTab === 'loadout'
                        ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md'
                        : 'md3-surface text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                    }`}
            >
                Loadout
            </button>
        </div>
    ) : null;

    const LeftPanel = (
        <div className="recording-left-shell min-h-0 flex flex-col gap-4 overflow-hidden rounded-2xl p-4">
            {LeftTabBar}
            {density === 'standard' ? (
                <>
                    <div className="shrink-0">
                        <SquadronPanel />
                    </div>
                    <div data-tour="action-panel" className="shrink-0">
                        <ActionPanel onSmartCaptureData={onSmartCaptureData} density="compact" />
                    </div>
                </>
            ) : (
                <div className="min-h-0 overflow-hidden">
                    {leftTab === 'actions' ? (
                        <div data-tour="action-panel" className="min-h-0 overflow-hidden">
                            <ActionPanel onSmartCaptureData={onSmartCaptureData} density="compact" />
                        </div>
                    ) : (
                        <div className="min-h-0 overflow-hidden">
                            <SquadronPanel density="compact" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (isNarrow) {
        // Stack on narrow widths; the view scrolls, but the Recording panel itself never does.
        return (
            <div data-tour="view-recording" className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 pb-6">
                <div className="sticky top-0 z-10 mb-4">
                    {LeftPanel}
                </div>
                <div className="min-h-0 flex flex-col gap-4">
                    <div className="min-h-420px">
                        <RosterPanel />
                    </div>
                    <div className="min-h-420px">
                        <MissionPanel accordionMode />
                    </div>
                </div>
            </div>
        );
    }

    return (
        // Avoid nested scrollbars inside the dashboard grid. Panels manage their own overflow.
        <div
            data-tour="view-recording"
            className="h-full min-h-0 grid gap-4 p-4 pb-6 overflow-hidden"
            style={{ gridTemplateColumns: 'minmax(240px, 300px) minmax(320px, 1fr) minmax(420px, 1.65fr)' }}
        >
            {/* Left Column: Recording panel (must not scroll). */}
            <div className="min-h-0 overflow-hidden">
                {LeftPanel}
            </div>

            {/* Center: Roster Manager */}
            <div className="min-h-0 overflow-hidden">
                <RosterPanel />
            </div>

            {/* Right: Mission Intel */}
            <div className="min-h-0 overflow-hidden">
                <MissionPanel accordionMode />
            </div>
        </div>
    );
};
