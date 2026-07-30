import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus } from 'lucide-react';
import { SHIPS } from '../utils/constants';
import { SHIP_KILL_POPUP_AUTO_DISMISS_DEFAULT_MS } from '../store/slices/createSettingsSlice';
import type { KillMap } from '../types';

const ALL_SHIP_TYPES = [...SHIPS, 'AI Legion'];

interface ShipKillPopupProps {
    matchId: number;
    onSave: (matchId: number, kills: KillMap) => void;
    onDismiss: () => void;
    /**
     * Auto-dismiss duration in ms. `0` (or any non-positive value) disables
     * auto-dismiss entirely — the popup stays open until the user saves or
     * manually closes it. Defaults to the app-wide default (30s).
     */
    autoDismissMs?: number;
}

export const ShipKillPopup: React.FC<ShipKillPopupProps> = ({
    matchId,
    onSave,
    onDismiss,
    autoDismissMs = SHIP_KILL_POPUP_AUTO_DISMISS_DEFAULT_MS,
}) => {
    const [kills, setKills] = useState<KillMap>(() => {
        const initial: KillMap = {};
        ALL_SHIP_TYPES.forEach(s => { initial[s] = 0; });
        return initial;
    });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Restarts (rather than permanently cancels) the auto-dismiss countdown.
    // Any interaction with the popup — including +/- clicks — pushes the
    // dismissal back out by the full duration instead of disabling it.
    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!autoDismissMs || autoDismissMs <= 0) return; // 0 = never auto-dismiss
        timerRef.current = setTimeout(() => {
            onDismiss();
        }, autoDismissMs);
    }, [autoDismissMs, onDismiss]);

    useEffect(() => {
        resetTimer();
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [resetTimer]);

    const adjust = (ship: string, delta: number) => {
        resetTimer();
        setKills(prev => ({
            ...prev,
            [ship]: Math.max(0, (prev[ship] || 0) + delta),
        }));
    };

    const totalKills = Object.values(kills).reduce((a, b) => a + b, 0);

    const handleSave = () => {
        const nonZero: KillMap = {};
        Object.entries(kills).forEach(([k, v]) => { if (v > 0) nonZero[k] = v; });
        onSave(matchId, nonZero);
        onDismiss();
    };

    return createPortal(
        <div className="fixed bottom-4 right-4 z-50 w-72 rounded-card border border-md-sys-outline/15 mg-surface-high shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-md-sys-outline/[0.06]">
                <div>
                    <div className="text-label-sm font-bold text-success uppercase tracking-wide">Win — Log Kills</div>
                    <div className="text-label-xs text-md-sys-on-surface/40">Match #{matchId}</div>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="w-7 h-7 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                    aria-label="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
            <div className="px-4 py-3 space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                {ALL_SHIP_TYPES.map(ship => (
                    <div key={ship} className="flex items-center justify-between gap-2">
                        <span className="text-label-xs font-medium text-md-sys-on-surface/70 truncate flex-1">{ship}</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => adjust(ship, -1)}
                                disabled={!kills[ship]}
                                className="w-6 h-6 rounded-full inline-flex items-center justify-center border border-md-sys-outline/10 text-md-sys-on-surface/50 hover:bg-md-sys-on-surface/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Minus size={10} />
                            </button>
                            <span className="w-6 text-center text-label-sm font-bold tabular-nums">{kills[ship] || 0}</span>
                            <button
                                type="button"
                                onClick={() => adjust(ship, 1)}
                                className="w-6 h-6 rounded-full inline-flex items-center justify-center border border-md-sys-outline/10 text-md-sys-on-surface/50 hover:bg-md-sys-on-surface/[0.06]"
                            >
                                <Plus size={10} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="px-4 py-3 border-t border-md-sys-outline/[0.06] flex items-center justify-between gap-2">
                <span className="text-label-xs text-md-sys-on-surface/50">{totalKills} kill{totalKills !== 1 ? 's' : ''}</span>
                <button
                    type="button"
                    onClick={handleSave}
                    className="h-7 px-3 rounded-control text-label-xs font-bold border border-success/25 bg-success/10 text-success hover:bg-success/15 transition-colors"
                >
                    Save
                </button>
            </div>
        </div>,
        document.body
    );
};
