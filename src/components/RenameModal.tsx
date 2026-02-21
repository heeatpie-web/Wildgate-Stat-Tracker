import React, { useId } from 'react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { Match } from '../types';
import { parseShareCode } from '../utils/export';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export const RenameModal: React.FC = () => {
    const { renameModal, setRenameModal, renameValue, setRenameValue, setToast, activeUser, setActiveUser } = useUIState();
    const { addPlayer, renamePilot, addMatch } = useGameData();
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(renameModal != null);
    const isBlockingNewProfile = renameModal?.type === 'new' && renameModal?.blocking === true;
    useKeyboardShortcuts([
        { key: 'Escape', handler: () => { if (!isBlockingNewProfile) setRenameModal(null); } },
    ], renameModal != null);

    if (!renameModal) return null;

    const handleRegisterUser = (name: string) => {
        if (!name.trim()) return;
        addPlayer(name.trim());
        setToast({ message: `Prospector "${name}" registered!`, type: 'success' });
    };

    const handleSubmit = () => {
        if (!renameModal) return;
        if (!renameValue.trim()) {
            if (renameModal.type === 'new') {
                setToast({ message: 'Username is required and should match your in-game name.', type: 'warning' });
                return;
            }
            setRenameModal(null);
            return;
        }

        if (renameModal.type === 'new') {
            handleRegisterUser(renameValue.trim());
        } else if (renameModal.type === 'rename' && renameModal.oldName) {
            const nextName = renameValue.trim();
            renamePilot(renameModal.oldName, nextName);
            if (activeUser === renameModal.oldName) {
                // Keep active profile in sync when the current profile is renamed.
                setActiveUser(nextName);
            }
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
    const isNewProfile = renameModal.type === 'new';
    const isShare = (renameModal.type as string) === 'share_code';
    const title = isShare ? 'Import Match' : (isRename ? 'Rename Profile' : 'New Profile');
    const sub = isShare ? 'Paste your share code below' : (isRename ? 'Enter a new callsign' : 'Identify yourself, prospector');

    const closeModal = () => {
        if (isBlockingNewProfile) return;
        setRenameModal(null);
    };

    return (
        <div className="fixed inset-0 md3-dialog-scrim z-modal flex items-center justify-center p-4 animate-fade-in" onClick={closeModal}>
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="md3-dialog p-5 rounded-modal max-w-sm w-full shadow-2xl border border-md-sys-outline/20 animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <h3 id={dialogTitleId} className="text-title font-bold uppercase mb-2">{title}</h3>
                <p id={dialogDescriptionId} className="text-label-sm font-bold opacity-60 uppercase tracking-widest mb-6">{sub}</p>
                {isNewProfile && (
                    <div className="mb-4 rounded-control bg-warning-soft border border-warning-soft-strong px-3 py-2 text-label-sm text-warning">
                        For accurate teammate/opponent matching, your app username must exactly match your in-game name.
                    </div>
                )}

                <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full md3-textfield--outlined p-4 rounded-card text-xl font-bold mb-6 outline-none transition-all"
                    placeholder={isShare ? "Paste code..." : "Callsign..."}
                />

                <div className="flex gap-2">
                    {!isBlockingNewProfile && (
                        <button onClick={() => setRenameModal(null)} className="flex-1 md3-btn-outlined py-4 rounded-card font-bold uppercase tracking-widest">Cancel</button>
                    )}
                    <button onClick={handleSubmit} className="flex-1 md3-btn-filled py-4 rounded-card font-bold uppercase tracking-widest shadow-lg">Confirm</button>
                </div>
            </div>
        </div>
    );
};

