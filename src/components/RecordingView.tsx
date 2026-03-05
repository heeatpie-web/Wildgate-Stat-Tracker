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
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [viewport, setViewport] = React.useState(() => ({
        w: typeof window !== 'undefined' ? window.innerWidth : 1920,
        h: typeof window !== 'undefined' ? window.innerHeight : 1080,
    }));

    React.useEffect(() => {
        const measure = () => {
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = {
                w: Math.round(rect.width) || window.innerWidth,
                h: Math.round(rect.height) || window.innerHeight,
            };
            setViewport((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
        };

        const onResize = () => measure();
        measure();
        window.addEventListener('resize', onResize);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
            observer = new ResizeObserver(() => measure());
            observer.observe(containerRef.current);
        }

        return () => {
            window.removeEventListener('resize', onResize);
            observer?.disconnect();
        };
    }, []);

    // Use measured container size (not raw window size) so mode switching follows available dashboard space.
    const isNarrow = viewport.w < 980;
    const isHeightConstrained = viewport.h < 720;
    const density: 'standard' | 'compact' = (isHeightConstrained || isNarrow) ? 'compact' : 'standard';
    const shouldScrollLeftPanel = !isNarrow;
    const shouldScrollWideLayout = !isNarrow && isHeightConstrained;
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

    const leftShellChrome = isNarrow ? 'recording-left-shell rounded-2xl p-4' : '';

    const LeftPanel = (
        <div className={`min-h-0 ${!isNarrow ? 'h-full' : ''} flex flex-col gap-3 ${leftShellChrome} ${shouldScrollLeftPanel ? 'overflow-y-auto custom-scrollbar pr-1' : 'overflow-hidden'}`}>
            {LeftTabBar}
            {density === 'standard' ? (
                <>
                    <div className="shrink-0">
                        <SquadronPanel density="compact" />
                    </div>
                    <div data-tour="action-panel" className="shrink-0">
                        <ActionPanel onSmartCaptureData={onSmartCaptureData} density="compact" />
                    </div>
                </>
            ) : (
                <div className="min-h-0">
                    {leftTab === 'actions' ? (
                        <div data-tour="action-panel" className="min-h-0">
                            <ActionPanel onSmartCaptureData={onSmartCaptureData} density="compact" />
                        </div>
                    ) : (
                        <div className="min-h-0">
                            <SquadronPanel density="compact" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div ref={containerRef} className="h-full min-h-0 w-full">
            {isNarrow ? (
                // Stack on narrow widths; the view scrolls, but the Recording panel itself never does.
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
            ) : (
                // Wide layout: allow root scrolling only when height constrained to avoid clipping.
                <div
                    data-tour="view-recording"
                    className={`h-full min-h-0 grid gap-4 p-4 pb-6 ${shouldScrollWideLayout ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                    style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1fr) minmax(300px, 1fr)' }}
                >
                    <div className="min-h-0 overflow-hidden">
                        {LeftPanel}
                    </div>

                    <div className="min-h-0 overflow-hidden">
                        <RosterPanel />
                    </div>

                    <div className="min-h-0 overflow-hidden">
                        <MissionPanel accordionMode />
                    </div>
                </div>
            )}
        </div>
    );
};
