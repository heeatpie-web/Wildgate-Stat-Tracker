import React from 'react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { Match } from '../types';
import { parseShareCode } from '../utils/export';

export const RenameModal: React.FC = () => {
    const { renameModal, setRenameModal, renameValue, setRenameValue, setToast } = useUIState();
    const { addPlayer, renamePilot, addMatch } = useGameData();

    if (!renameModal) return null;

    const handleRegisterUser = (name: string) => {
        if (!name.trim()) return;
        addPlayer(name.trim());
        setToast({ message: `Prospector "${name}" registered!`, type: 'success' });
    };

    const handleSubmit = () => {
        if (!renameModal || !renameValue.trim()) { setRenameModal(null); return; }

        if (renameModal.type === 'new') {
            handleRegisterUser(renameValue.trim());
        } else if (renameModal.type === 'rename' && renameModal.oldName) {
            renamePilot(renameModal.oldName, renameValue.trim());
            setToast({ message: "Profile renamed successfully.", type: 'success' });
        } else if (renameModal.type === 'share_code') {
            try {
                const match = parseShareCode(renameValue.trim());
                if (match) {
                    addMatch(match as Match);
                    setToast({ message: "Match imported successfully!", type: 'success' });
                }
            } catch (e) {
                setToast({ message: "Invalid or corrupt share code.", type: 'error' });
            }
        }
        setRenameModal(null);
    };

    const isRename = renameModal.type === 'rename';
    const isShare = (renameModal.type as string) === 'share_code';
    const title = isShare ? 'Import Match' : (isRename ? 'Rename Profile' : 'New Profile');
    const sub = isShare ? 'Paste your share code below' : (isRename ? 'Enter a new callsign' : 'Identify yourself, prospector');

    return (
        <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setRenameModal(null)}>
            <div className="bg-md-sys-surface1 p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-md-sys-outline/20 animate-scale-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-2xl font-black uppercase mb-2">{title}</h3>
                <p className="text-xs font-bold opacity-60 uppercase tracking-widest mb-6">{sub}</p>

                <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full bg-md-sys-surface2 p-4 rounded-2xl text-xl font-bold mb-6 outline-none border border-transparent focus:border-md-sys-primary transition-all"
                    placeholder={isShare ? "Paste code..." : "Callsign..."}
                />

                <div className="flex gap-2">
                    <button onClick={() => setRenameModal(null)} className="flex-1 py-4 bg-md-sys-surface3 rounded-2xl font-black uppercase tracking-widest hover:bg-md-sys-outline/20">Cancel</button>
                    <button onClick={handleSubmit} className="flex-1 py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg">Confirm</button>
                </div>
            </div>
        </div>
    );
};
