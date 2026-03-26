import React, { useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { exportToJSON } from '../utils/export';
import { StorageService } from '../utils/storage';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export const ResetConfirmModal: React.FC = () => {
    const { showResetConfirm, setShowResetConfirm } = useUIState();
    const { matches, players, pilotRegistry } = useGameData();
    const [resetting, setResetting] = useState(false);
    const focusTrapRef = useFocusTrap<HTMLDivElement>(showResetConfirm);

    useKeyboardShortcuts([
        { key: 'Escape', handler: () => !resetting && setShowResetConfirm(false) },
    ], showResetConfirm);

    if (!showResetConfirm) return null;

    const handleReset = async (backup: boolean) => {
        if (resetting) return;
        setResetting(true);
        try {
            if (backup) exportToJSON({ matches, players, pilotRegistry });
            const ok = await StorageService.wipeAllPersistedData();
            if (!ok) {
                setResetting(false);
                window.alert('Reset failed — could not clear saved data. If this keeps happening, try again after closing other windows.');
                return;
            }
            try {
                localStorage.clear();
            } catch {
                // non-fatal
            }
            const delayMs = backup ? 500 : 0;
            window.setTimeout(() => window.location.reload(), delayMs);
        } catch {
            setResetting(false);
            window.alert('Reset failed — an unexpected error occurred.');
        }
    };

    return (
        <div className="fixed inset-0 md3-dialog-scrim z-overlay flex items-center justify-center p-4" onClick={() => !resetting && setShowResetConfirm(false)}>
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-data-title"
                aria-describedby="reset-data-description"
                className="md3-dialog p-10 rounded-2xl w-full max-w-md shadow-2xl border-2 border-md-sys-error"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-4 text-md-sys-error mb-6"><AlertOctagon size={48} /><h2 id="reset-data-title" className="text-3xl font-black uppercase tracking-tighter">Reset Data?</h2></div>
                <p id="reset-data-description" className="text-base opacity-60 mb-10 font-bold leading-relaxed">This action will delete ALL match history and pilot records. This cannot be undone.</p>
                <div className="flex flex-col gap-4">
                    <button type="button" disabled={resetting} onClick={() => void handleReset(true)} className="w-full md3-btn-filled py-5 rounded-2xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50">Backup & Reset</button>
                    <button type="button" disabled={resetting} onClick={() => void handleReset(false)} className="w-full md3-btn-outlined py-5 rounded-2xl font-black uppercase tracking-widest text-md-sys-error border-md-sys-error disabled:opacity-50">Just Reset</button>
                    <button type="button" disabled={resetting} onClick={() => setShowResetConfirm(false)} className="w-full md3-btn-text py-5 rounded-2xl font-black uppercase tracking-widest disabled:opacity-50">Cancel</button>
                </div>
            </div>
        </div>
    );
};

