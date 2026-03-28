import React from 'react';
import { SquadronPanel } from './recording/SquadronPanel';
import { RosterPanel } from './recording/RosterPanel';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
import { useUIState } from '../providers/UIStateProvider';
import { useAppStore } from '../store/useAppStore';
import { useGameData } from '../providers/GameDataProvider';
import { findActiveTelemetryDraftMatch } from '../utils/smartCaptureScope';
import { PregameAdvicePanel, PregameAdviceReopenButton } from './PregameAdvicePanel';
// TimelinePanel archived

/** Automation phases that indicate lobby OCR has fully completed for the active draft. */
const POST_LOBBY_PHASES = new Set([
  'lobby-complete',
  'watching-result',
  'watching-result-flash',
  'result-flash-detected',
  'live-match',
]);

interface RecordingViewProps {
    onSmartCaptureData?: (data: any) => void;
    isActive?: boolean;
}

export const RecordingView: React.FC<RecordingViewProps> = ({ onSmartCaptureData, isActive = true }) => {
    const { telemetryLifecycleStage, telemetryAutomationStatus } = useUIState();
    const { matches } = useGameData();
    const activeUser = useAppStore((s) => s.activeUser);
    const sessionStartTime = useAppStore((s) => s.sessionStartTime);
    const pregameAdviceEnabled = useAppStore((s) => s.pregameAdviceEnabled);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [viewport, setViewport] = React.useState(() => ({
        w: typeof window !== 'undefined' ? window.innerWidth : 1920,
        h: typeof window !== 'undefined' ? window.innerHeight : 1080,
    }));

    React.useEffect(() => {
        if (!isActive) return;
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
    }, [isActive]);

    // Use measured container size (not raw window size) so mode switching follows available dashboard space.
    const isNarrow = viewport.w < 980;
    const isHeightConstrained = viewport.h < 720;
    const density: 'standard' | 'compact' = (isHeightConstrained || isNarrow) ? 'compact' : 'standard';
    const shouldScrollLeftPanel = !isNarrow;
    const shouldScrollWideLayout = !isNarrow && isHeightConstrained;
    const [leftTab, setLeftTab] = React.useState<'actions' | 'loadout'>('actions');
    const shouldShowAutomationStrip = telemetryLifecycleStage !== 'idle' || !!telemetryAutomationStatus;
    const automationLevelClass = telemetryAutomationStatus?.level === 'success'
        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
        : telemetryAutomationStatus?.level === 'warning'
            ? 'border-amber-400/25 bg-amber-500/10 text-amber-50'
            : telemetryAutomationStatus?.level === 'error'
                ? 'border-rose-400/25 bg-rose-500/10 text-rose-100'
                : 'border-md-sys-primary/20 bg-md-sys-primary/10 text-md-sys-on-surface';
    const lifecycleBadgeLabel = telemetryLifecycleStage === 'loading'
        ? 'Loading'
        : telemetryLifecycleStage === 'pregame'
            ? 'Pregame'
            : telemetryLifecycleStage === 'live'
                ? 'Live'
                : telemetryLifecycleStage === 'menu'
                    ? 'Menu'
                    : 'Idle';
    const automationMessage = telemetryAutomationStatus?.message || (
        telemetryLifecycleStage === 'loading'
            ? 'Loading match'
            : telemetryLifecycleStage === 'pregame'
                ? 'Pregame lobby detected'
                : telemetryLifecycleStage === 'live'
                    ? 'Watching for match-end result'
                    : telemetryLifecycleStage === 'menu'
                        ? 'Waiting for menu transition'
                        : ''
    );

    React.useEffect(() => {
        // In standard density we show both panels; keep the tab state stable for compact.
        if (density === 'standard') setLeftTab('actions');
    }, [density]);

    // ── Pregame advice panel state ──────────────────────────────────────────

    const activeTelemetryDraftMatch = React.useMemo(
        () => findActiveTelemetryDraftMatch({ activeUser, matches, sessionStartTime }),
        [activeUser, matches, sessionStartTime]
    );
    const activeDraftId = activeTelemetryDraftMatch?.id ?? null;

    // Track which draft ID we've already auto-opened for (component-lifetime ref).
    const autoOpenedForDraftIdRef = React.useRef<number | null>(null);
    // Track which draft ID the user explicitly dismissed.
    const [dismissedForDraftId, setDismissedForDraftId] = React.useState<number | null>(null);
    // Whether the panel is currently open.
    const [advicePanelOpen, setAdvicePanelOpen] = React.useState(false);

    // Reset dismissed + open state when the active draft changes or stops.
    React.useEffect(() => {
        if (activeDraftId == null) {
            setAdvicePanelOpen(false);
            setDismissedForDraftId(null);
            autoOpenedForDraftIdRef.current = null;
        } else if (activeDraftId !== dismissedForDraftId) {
            // New draft started — clear any stale dismissed marker for a different draft.
            setDismissedForDraftId((prev) => (prev !== activeDraftId ? null : prev));
        }
    }, [activeDraftId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-open: fires once per draft when all lobby screenshots are processed.
    React.useEffect(() => {
        if (!pregameAdviceEnabled) return;
        if (activeDraftId == null) return;

        const phase = telemetryAutomationStatus?.phase;
        if (!phase || !POST_LOBBY_PHASES.has(phase)) return;

        // The status matchId must belong to the active draft (or be unset).
        const statusMatchId = telemetryAutomationStatus?.matchId;
        if (statusMatchId != null && statusMatchId !== activeDraftId) return;

        // Already auto-opened for this draft.
        if (autoOpenedForDraftIdRef.current === activeDraftId) return;

        // User already dismissed this draft.
        if (dismissedForDraftId === activeDraftId) return;

        autoOpenedForDraftIdRef.current = activeDraftId;
        setAdvicePanelOpen(true);
    }, [
        pregameAdviceEnabled,
        activeDraftId,
        telemetryAutomationStatus?.phase,
        telemetryAutomationStatus?.matchId,
        dismissedForDraftId,
    ]);

    const handleAdviceDismiss = React.useCallback(() => {
        setAdvicePanelOpen(false);
        if (activeDraftId != null) {
            setDismissedForDraftId(activeDraftId);
        }
    }, [activeDraftId]);

    const handleAdviceReopen = React.useCallback(() => {
        setAdvicePanelOpen(true);
        setDismissedForDraftId(null);
    }, []);

    // Show the reopen button in the automation strip when dismissed but draft is still active.
    const showReopenButton =
        pregameAdviceEnabled &&
        !advicePanelOpen &&
        dismissedForDraftId != null &&
        dismissedForDraftId === activeDraftId;

    // ── Tab bar (compact density) ───────────────────────────────────────────

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
            {/* Pregame Advice Panel */}
            {pregameAdviceEnabled && advicePanelOpen && activeTelemetryDraftMatch && (
                <div className="shrink-0">
                    <PregameAdvicePanel
                        activeDraftMatch={activeTelemetryDraftMatch}
                        allMatches={matches}
                        onDismiss={handleAdviceDismiss}
                    />
                </div>
            )}

            {/* Automation Strip */}
            {shouldShowAutomationStrip ? (
                <div className={`rounded-2xl border px-3 py-3 shadow-sm ${automationLevelClass}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">
                                Full Auto Lifecycle
                            </div>
                            <div className="mt-1 text-sm font-bold leading-snug">
                                {automationMessage}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {showReopenButton && (
                                <PregameAdviceReopenButton onClick={handleAdviceReopen} />
                            )}
                            <div className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em]">
                                {lifecycleBadgeLabel}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
            {LeftTabBar}
            {density === 'standard' ? (
                <>
                    <div className="shrink-0">
                        <SquadronPanel density="compact" />
                    </div>
                    <div data-tour="action-panel" className="shrink-0">
                        <ActionPanel isActive={isActive} onSmartCaptureData={onSmartCaptureData} density="compact" />
                    </div>
                </>
            ) : (
                <div className="min-h-0">
                    {leftTab === 'actions' ? (
                        <div data-tour="action-panel" className="min-h-0">
                            <ActionPanel isActive={isActive} onSmartCaptureData={onSmartCaptureData} density="compact" />
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

                    <div className="min-h-0 overflow-hidden pl-1">
                        <MissionPanel accordionMode />
                    </div>
                </div>
            )}
        </div>
    );
};
