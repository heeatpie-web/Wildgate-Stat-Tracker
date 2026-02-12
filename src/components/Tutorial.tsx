import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';

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
        title: 'Profile Selector',
        description: 'Open the profile hub to switch profiles and manage pilot settings.',
        selector: 'profile-selector',
    },
    {
        title: 'System Status',
        description: 'This pulse shows key background health: telemetry online/offline, OCR activity, mission live/idle, and update state.',
        selector: 'system-pulse',
    },
    {
        title: 'Data Safety',
        description: 'This indicates your local save safety. Hover it for last save/backup details and recovery state.',
        selector: 'data-safety',
    },
    {
        title: 'Match Recording',
        description: 'This is the main recording surface: live session controls, mission intel, and rapid match logging.',
        selector: 'view-recording',
        view: 'recording',
    },
    {
        title: 'Smart Capture',
        description: 'High-priority action. Captures the game window and extracts teammates/opponents/ship/modifiers via OCR for faster entry.',
        selector: 'smart-capture',
        view: 'recording',
    },
    {
        title: 'Quick Actions',
        description: 'Use this panel to log wins/losses quickly and keep your mission/session timer in one place.',
        selector: 'action-panel',
        view: 'recording',
    },
    {
        title: 'Analytics',
        description: 'Your performance cockpit. Use quick chips to jump into Momentum, Insights, Social, Pro, and more.',
        selector: 'view-analytics',
        view: 'analytics',
    },
    {
        title: 'History',
        description: 'Browse, edit, and export previous matches from the history table.',
        selector: 'view-history',
        view: 'history',
    },
    {
        title: 'Smart Captures',
        description: 'Review captured screenshots, rerun OCR, and apply extracted data back into matches or your current session.',
        selector: 'view-smart-captures',
        view: 'smart-captures',
    },
    {
        title: 'Overlay Mode',
        description: 'Switch to overlay when you want a compact HUD during play.',
        selector: 'overlay-button',
    },
    {
        title: 'Settings',
        description: 'Configure OCR, backups, UI preferences, and advanced options here.',
        selector: 'nav-settings',
    },
];

const highlightPadding = 8;

const Tutorial: React.FC<TutorialProps> = ({ onComplete, onSkip }) => {
    const { activeView, setActiveView, showSettings, setShowSettings } = useUIState();
    const [stepIndex, setStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const initialViewRef = useRef(activeView);
    const initialSettingsRef = useRef(showSettings);
    const openedSettingsRef = useRef(false);

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

    useEffect(() => {
        if (step.view && step.view !== activeView) {
            setActiveView(step.view);
        }

        if (step.openSettings && !showSettings) {
            setShowSettings(true);
            openedSettingsRef.current = true;
        } else if (!step.openSettings && openedSettingsRef.current) {
            setShowSettings(false);
            openedSettingsRef.current = false;
        }
    }, [activeView, setActiveView, showSettings, setShowSettings, step.openSettings, step.view]);

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
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onSkip();
            if (event.key === 'ArrowRight') handleNext();
            if (event.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleNext, handlePrev, onSkip]);

    useEffect(() => {
        return () => {
            setActiveView(initialViewRef.current);
            if (initialSettingsRef.current !== showSettings) {
                setShowSettings(initialSettingsRef.current);
            }
        };
    }, [setActiveView, setShowSettings, showSettings]);

    const tooltipInlineStyle: React.CSSProperties =
        tooltipStyle || { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    return (
        <div className="fixed inset-0 z-[1000]">
            {targetRect ? (
                <div
                    className="absolute rounded-xl border-2 border-md-sys-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-200 pointer-events-none"
                    style={{
                        top: Math.max(targetRect.top - highlightPadding, 0),
                        left: Math.max(targetRect.left - highlightPadding, 0),
                        width: Math.max(targetRect.width + highlightPadding * 2, 0),
                        height: Math.max(targetRect.height + highlightPadding * 2, 0),
                    }}
                />
            ) : (
                <div className="absolute inset-0 bg-black/70 pointer-events-none" />
            )}

            <div
                ref={tooltipRef}
                className="absolute w-[320px] max-w-[calc(100vw-32px)] md3-card text-md-sys-on-surface rounded-2xl border border-md-sys-outline/20 shadow-2xl p-4 pointer-events-auto"
                style={tooltipInlineStyle}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-label-sm uppercase tracking-[0.2em] text-md-sys-primary font-bold">
                            Step {stepIndex + 1} of {steps.length}
                        </div>
                        <h2 className="text-lg font-black mt-1">{step.title}</h2>
                    </div>
                    <button
                        onClick={onSkip}
                        className="md3-icon-btn"
                        aria-label="Exit tutorial"
                    >
                        <X size={18} />
                    </button>
                </div>

                <p className="text-body opacity-60 leading-relaxed mt-2">{step.description}</p>

                <div className="flex gap-2 mt-4">
                    <button
                        onClick={stepIndex === 0 ? onSkip : handlePrev}
                        className="md3-btn-text"
                    >
                        {stepIndex === 0 ? 'Skip' : 'Back'}
                    </button>
                    <button
                        onClick={handleNext}
                        className="md3-btn-filled flex-1 font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                        {stepIndex === steps.length - 1 ? (
                            <>Finish</>
                        ) : (
                            <>
                                Next <ChevronRight size={16} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Tutorial;

