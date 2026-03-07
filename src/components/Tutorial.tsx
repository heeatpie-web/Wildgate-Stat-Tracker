import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Button } from './ui';

interface TutorialProps {
    onComplete: () => void;
    onSkip: () => void;
}

type ViewId = 'recording' | 'analytics' | 'history' | 'smart-captures' | 'dev-ocr';

interface TutorialStep {
    title: string;
    description: string;
    selector?: string;
    view?: ViewId;
    openSettings?: boolean;
}

const steps: TutorialStep[] = [
    {
        title: 'Getting Around',
        description: 'Use the left sidebar to hop between Recording, Analytics, Smart Captures, Players, and History.',
        selector: 'sidebar-navigation',
    },
    {
        title: 'Your Profile',
        description: 'Tap this profile area to switch pilots and open settings whenever you need to.',
        selector: 'profile-selector',
    },
    {
        title: 'Live Status',
        description: 'This status pulse gives you a quick read on telemetry, OCR, mission state, and update progress.',
        selector: 'system-pulse',
    },
    {
        title: 'Recording',
        description: 'This is your main workspace for session controls, mission intel, and quick match logging.',
        selector: 'view-recording',
        view: 'recording',
    },
    {
        title: 'Smart Capture',
        description: 'Use this to grab the game screen and auto-fill teammates, opponents, ship, and modifiers with OCR.',
        selector: 'smart-capture',
        view: 'recording',
    },
    {
        title: 'Analytics',
        description: 'Your performance hub. Use the chips to jump into Momentum, Insights, Social, Pro, and more.',
        selector: 'view-analytics',
        view: 'analytics',
    },
    {
        title: 'History',
        description: 'Find past matches here. You can edit entries and export when needed.',
        selector: 'view-history',
        view: 'history',
    },
    {
        title: 'Smart Captures',
        description: 'Review captured screenshots, rerun OCR, and apply results back to a match or your live session.',
        selector: 'view-smart-captures',
        view: 'smart-captures',
    },
    {
        title: 'Overlay Mode',
        description: 'Need less screen clutter? Switch to overlay mode for a compact in-game HUD. Press F9 while Wildgate is open to bring the tracker back to the front.',
        selector: 'overlay-button',
    },
];

const highlightPadding = 8;

const Tutorial: React.FC<TutorialProps> = ({ onComplete, onSkip }) => {
    const {
        activeView,
        setActiveView,
        showSettings,
        setShowSettings,
        sidebarCollapsed,
        setSidebarCollapsed,
    } = useUIState();
    const [stepIndex, setStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
    const initialViewRef = useRef(activeView);
    const initialSettingsRef = useRef(showSettings);
    const initialSidebarCollapsedRef = useRef(sidebarCollapsed);
    const openedSettingsRef = useRef(false);
    const openedSidebarForTutorialRef = useRef(false);

    const step = steps[stepIndex];

    const resolveTarget = useCallback(() => {
        if (!step.selector) return null;
        return document.querySelector(`[data-tour="${step.selector}"]`) as HTMLElement | null;
    }, [step.selector]);

    const updateTooltipPosition = useCallback((rect: DOMRect | null) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;

        const tooltipRect = tooltip.getBoundingClientRect();
        const padding = 12;

        if (!rect) {
            const top = Math.max(padding, (window.innerHeight - tooltipRect.height) / 2);
            const left = Math.max(padding, (window.innerWidth - tooltipRect.width) / 2);
            setTooltipStyle({ top, left });
            return;
        }

        const spaceBelow = window.innerHeight - rect.bottom - padding;
        const spaceAbove = rect.top - padding;
        const placeBelow = spaceBelow >= tooltipRect.height || spaceBelow >= spaceAbove;

        let top = placeBelow ? rect.bottom + padding : rect.top - tooltipRect.height - padding;
        top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

        let left = rect.left;
        left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

        setTooltipStyle({ top, left });
    }, []);

    const updateTarget = useCallback(() => {
        const target = resolveTarget();
        if (!target) {
            setTargetRect(null);
            updateTooltipPosition(null);
            return;
        }

        const rect = target.getBoundingClientRect();
        setTargetRect(rect);
        updateTooltipPosition(rect);
    }, [resolveTarget, updateTooltipPosition]);

    const handleNext = useCallback(() => {
        setStepIndex(current => {
            if (current >= steps.length - 1) {
                onComplete();
                return current;
            }
            return current + 1;
        });
    }, [onComplete]);

    const handlePrev = useCallback(() => {
        setStepIndex(current => Math.max(0, current - 1));
    }, []);

    const setOverlayRefs = useCallback((node: HTMLDivElement | null) => {
        tooltipRef.current = node;
        focusTrapRef.current = node;
    }, [focusTrapRef]);

    useKeyboardShortcuts([
        { key: 'Escape', handler: () => onSkip() },
        { key: 'ArrowRight', handler: () => handleNext() },
        { key: 'ArrowLeft', handler: () => handlePrev() },
    ], true);

    useEffect(() => {
        if (sidebarCollapsed) {
            setSidebarCollapsed(false);
            openedSidebarForTutorialRef.current = true;
        }
        // Run once at tutorial start.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (step.view) {
            setActiveView(step.view);
        }

        if (step.openSettings) {
            setShowSettings(true);
            openedSettingsRef.current = true;
        } else if (openedSettingsRef.current) {
            setShowSettings(false);
            openedSettingsRef.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex]);

    useEffect(() => {
        let cancelled = false;
        let attempts = 0;

        const locate = () => {
            if (cancelled) return;
            const target = resolveTarget();
            if (!target) {
                attempts += 1;
                if (attempts < 12) {
                    setTimeout(locate, 120);
                } else {
                    setTargetRect(null);
                    updateTooltipPosition(null);
                }
                return;
            }

            const rect = target.getBoundingClientRect();
            const offscreen = rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth;
            if (offscreen) {
                target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
            }

            setTimeout(() => {
                if (!cancelled) updateTarget();
            }, 50);
        };

        locate();
        return () => {
            cancelled = true;
        };
    }, [stepIndex, activeView, showSettings, resolveTarget, updateTarget, updateTooltipPosition]);

    useEffect(() => {
        const handleResize = () => updateTarget();
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleResize, true);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleResize, true);
        };
    }, [updateTarget]);

    useEffect(() => {
        return () => {
            setActiveView(initialViewRef.current);
            if (initialSettingsRef.current !== showSettings) {
                setShowSettings(initialSettingsRef.current);
            }
            if (openedSidebarForTutorialRef.current) {
                setSidebarCollapsed(initialSidebarCollapsedRef.current);
            }
        };
    }, [setActiveView, setShowSettings, setSidebarCollapsed, showSettings]);

    const tooltipInlineStyle: React.CSSProperties =
        tooltipStyle || { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    return (
        <div className="fixed inset-0 z-tour">
            {targetRect ? (
                <div
                    className="absolute rounded-xl shadow-tour-scrim transition-all duration-200 pointer-events-none"
                    style={{
                        top: Math.max(targetRect.top - highlightPadding, 0),
                        left: Math.max(targetRect.left - highlightPadding, 0),
                        width: Math.max(targetRect.width + highlightPadding * 2, 0),
                        height: Math.max(targetRect.height + highlightPadding * 2, 0),
                    }}
                />
            ) : (
                <div className="absolute inset-0 bg-scrim-70 pointer-events-none" />
            )}

            <div
                ref={setOverlayRefs}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="absolute w-320px max-w-screen-minus-32 md3-card bg-md-sys-surface-container-highest text-md-sys-on-surface rounded-2xl border border-md-sys-outline/20 shadow-2xl p-4 pointer-events-auto"
                style={tooltipInlineStyle}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-label-sm uppercase tracking-wide-20 text-md-sys-primary font-bold">
                            Quick Tour {stepIndex + 1} of {steps.length}
                        </div>
                        <h2 id={dialogTitleId} className="text-lg font-black mt-1">{step.title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onSkip}
                        className="md3-icon-btn"
                        aria-label="Exit tutorial"
                    >
                        <X size={18} />
                    </button>
                </div>

                <p id={dialogDescriptionId} className="text-body opacity-60 leading-relaxed mt-2">{step.description}</p>

                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        onClick={stepIndex === 0 ? onSkip : handlePrev}
                        className="md3-btn-text"
                    >
                        {stepIndex === 0 ? 'Skip for now' : 'Back'}
                    </button>
                    {stepIndex < steps.length - 1 && (
                        <button
                            type="button"
                            onClick={onComplete}
                            className="md3-btn-text"
                        >
                            End tour
                        </button>
                    )}
                    <Button
                        variant="primary"
                        onClick={handleNext}
                        icon={stepIndex === steps.length - 1 ? undefined : <ChevronRight size={16} />}
                        iconPosition="end"
                        className="flex-1 rounded-full font-semibold"
                    >
                        {stepIndex === steps.length - 1 ? 'All set' : 'Next'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Tutorial;

