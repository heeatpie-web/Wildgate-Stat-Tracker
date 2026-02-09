import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { exportToJSON } from '../utils/export';

export const ResetConfirmModal: React.FC = () => {
    const { showResetConfirm, setShowResetConfirm } = useUIState();
    const { matches, players, pilotRegistry } = useGameData();

    if (!showResetConfirm) return null;

    const handleReset = (backup: boolean) => {
        if (backup) exportToJSON({ matches, players, pilotRegistry });
        setTimeout(() => { localStorage.clear(); window.location.reload(); }, 500);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
            <div className="bg-md-sys-surface1 p-10 rounded-2xl w-full max-w-md shadow-2xl border-2 border-md-sys-error" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 text-md-sys-error mb-6"><AlertOctagon size={48} /><h2 className="text-3xl font-black uppercase tracking-tighter">Reset Data?</h2></div>
                <p className="text-base opacity-80 mb-10 font-bold leading-relaxed">This action will delete ALL match history and pilot records. This cannot be undone.</p>
                <div className="flex flex-col gap-4">
                    <button onClick={() => handleReset(true)} className="w-full py-5 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg">Backup & Reset</button>
                    <button onClick={() => handleReset(false)} className="w-full py-5 bg-md-sys-error-container text-md-sys-on-error-container rounded-2xl font-black uppercase tracking-widest hover:brightness-110">Just Reset</button>
                    <button onClick={() => setShowResetConfirm(false)} className="w-full py-5 bg-md-sys-surface3 rounded-2xl font-black uppercase tracking-widest hover:bg-md-sys-surface-variant">Cancel</button>
                </div>
            </div>
        </div>
    );
};
