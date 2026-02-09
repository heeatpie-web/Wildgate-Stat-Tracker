import React, { useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { Check, X, Edit2, AlertTriangle, Trash2 } from 'lucide-react';

interface ReviewQueueModalProps {
    onClose: () => void;
}

export const ReviewQueueModal: React.FC<ReviewQueueModalProps> = ({ onClose }) => {
    const {
        pendingReviews,
        removePendingReview,
        sessionTeams,
        setSessionTeams,
        detectedUnknowns,
        addMapping,
        addToRegistry,
        selectedTeammates,
        setSelectedTeammates,
        selectedOpponents,
        setSelectedOpponents
    } = useGameData();
    const { setToast } = useUIState();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    // Combine standard reviews with unknown IDs
    const unknownItems = Object.entries(detectedUnknowns).map(([id, data]) => ({
        id,
        value: `Unknown ${data.type} (${id.substring(0, 5)})`,
        context: `New ${data.type} Discovered`,
        type: 'unknown_id',
        originalConfidence: 0,
        isUnknown: true
    }));

    const allItems = [...pendingReviews, ...unknownItems];

    const replaceNameInSession = (oldName: string, newName: string) => {
        if (oldName === newName) return;
        const newTeams = { ...sessionTeams };
        Object.keys(newTeams).forEach(color => {
            newTeams[color] = newTeams[color].map(n => n === oldName ? newName : n);
        });
        setSessionTeams(newTeams);
        setSelectedTeammates(selectedTeammates.map(n => n === oldName ? newName : n));
        setSelectedOpponents(selectedOpponents.map(n => n === oldName ? newName : n));
    };

    const handleConfirm = (review: any) => {
        if (review.isUnknown) {
            // Confirming an unknown without editing doesn't make sense unless we want to keep it as "Unknown X"
            // But let's assume confirm just dismisses it or requires edit.
            // For better UX, clicking Check on unknown should probably trigger "Please rename" toast or enter edit mode.
            setToast({ message: "Please rename to identify this item", type: 'info' });
            startEdit(review);
            return;
        }

        if (review.type === 'roster_candidate') {
            addToRegistry(review.value);
            removePendingReview(review.id);
            setToast({ message: `Added "${review.value}" to roster`, type: 'success' });
            return;
        }

        // Data is already involved in session, so we just clear the review flag.
        removePendingReview(review.id);
        setToast({ message: "Item confirmed", type: 'success' });
    };

    const handleDelete = (review: any) => {
        if (review.isUnknown) {
            // We can't easily "delete" an unknown from the registry without clearing all
            // For now, let's just ignore/toast
            setToast({ message: "Cannot delete unknown ID yet", type: 'error' });
            return;
        }

        // Remove from sessionTeams
        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            const newTeams = { ...sessionTeams };
            let found = false;
            Object.keys(newTeams).forEach(color => {
                const idx = newTeams[color].indexOf(review.value);
                if (idx !== -1) {
                    newTeams[color] = newTeams[color].filter(n => n !== review.value);
                    found = true;
                }
            });
            if (found) setSessionTeams(newTeams);
            setSelectedTeammates(selectedTeammates.filter(n => n !== review.value));
            setSelectedOpponents(selectedOpponents.filter(n => n !== review.value));
        }
        removePendingReview(review.id);
        setToast({ message: "Item deleted", type: 'success' });
    };

    const handleSaveEdit = (review: any) => {
        if (!editValue.trim()) return;

        if (review.isUnknown) {
            addMapping(review.id, editValue);
            setToast({ message: `Mapped ID to "${editValue}"`, type: 'success' });
            setEditingId(null);
            return;
        }

        // Update Session Teams
        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            const newTeams = { ...sessionTeams };
            Object.keys(newTeams).forEach(color => {
                const idx = newTeams[color].indexOf(review.value);
                if (idx !== -1) {
                    newTeams[color][idx] = editValue;
                }
            });
            setSessionTeams(newTeams);
        }

        if (review.type === 'roster_candidate') {
            addToRegistry(editValue);
        }

        removePendingReview(review.id);
        setToast({ message: "Item updated", type: 'success' });
        setEditingId(null);
    };

    const startEdit = (review: any) => {
        setEditingId(review.id);
        setEditValue(review.isUnknown ? "" : review.value); // specific behavior: clear text for naming unknowns
    };

    if (allItems.length === 0) {
        return (
            <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-md-sys-surface1 rounded-2xl p-6 max-w-sm w-full text-center border border-md-sys-outline/10">
                    <div className="text-lg font-bold mb-2">All Caught Up!</div>
                    <p className="text-md-sys-on-surface/60 mb-6 text-sm">No uncertain data pending review.</p>
                    <button onClick={onClose} className="w-full py-3 bg-md-sys-primary text-md-sys-onPrimary rounded-xl font-bold">Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-md-sys-surface1 rounded-2xl w-full max-w-lg overflow-hidden border border-md-sys-outline/10 shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-orange-400">
                        <AlertTriangle size={20} />
                        <h2 className="font-bold text-lg">Review Queue</h2>
                    </div>
                    <span className="text-xs font-mono opacity-60 bg-black/20 px-2 py-1 rounded">{allItems.length} Remaining</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {allItems.map(review => (
                        <div key={review.id} className="bg-md-sys-surface2 rounded-xl p-3 border border-md-sys-outline/10 animate-fade-in">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-xs font-black uppercase text-md-sys-on-surface/40 tracking-wider mb-1">
                                        {review.context || 'Unknown Context'}
                                    </div>
                                    {!review.isUnknown && (
                                        <div className="text-xs text-orange-400 font-mono mb-2">
                                            Confidence: {Math.round(review.originalConfidence)}%
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {editingId === review.id ? (
                                        <>
                                            <button onClick={() => handleSaveEdit(review)} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition-colors"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="p-2 bg-md-sys-surface3 rounded-lg hover:bg-md-sys-surface4 transition-colors"><X size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            {/* For Unknowns, Check button enters edit mode essentially */}
                                            <button onClick={() => review.isUnknown ? startEdit(review) : handleConfirm(review)} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition-colors" title="Confirm/Identify"><Check size={16} /></button>
                                            <button onClick={() => startEdit(review)} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white transition-colors" title="Edit"><Edit2 size={16} /></button>
                                            {!review.isUnknown && (
                                                <button onClick={() => handleDelete(review)} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Delete (Junk)"><Trash2 size={16} /></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {editingId === review.id ? (
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={review.isUnknown ? "Enter Name..." : ""}
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    className="w-full bg-black/20 border border-md-sys-primary rounded-lg px-3 py-2 font-bold text-lg text-md-sys-primary outline-none"
                                />
                            ) : (
                                <div className="text-lg font-bold text-md-sys-on-surface break-all">
                                    {review.value}
                                </div>
                            )}

                            {!editingId && review.type === 'roster_candidate' && (
                                <div className="mt-2 space-y-2">
                                    {review.bestScore != null && (
                                        <div className="text-xs text-md-sys-on-surface/60">
                                            Best match: <span className="font-semibold">{review.bestMatch || 'None'}</span> ({Math.round(review.bestScore)}%)
                                            {review.bestScore >= 90 && (
                                                <span className="ml-2 text-green-400 font-bold">Auto-Merge Suggested</span>
                                            )}
                                        </div>
                                    )}
                                    {Array.isArray(review.suggestions) && review.suggestions.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {review.suggestions.map((s: any) => (
                                                <button
                                                    key={s.name}
                                                    onClick={() => {
                                                        replaceNameInSession(review.value, s.name);
                                                        removePendingReview(review.id);
                                                        setToast({ message: `Merged into "${s.name}"`, type: 'success' });
                                                    }}
                                                    className="px-2 py-1 rounded-lg bg-md-sys-surface3 text-[10px] font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors"
                                                >
                                                    Merge with {s.name} ({Math.round(s.score)}%)
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-md-sys-outline/10 bg-md-sys-surface2/50">
                    <button onClick={onClose} className="w-full py-3 bg-md-sys-surface3 hover:bg-md-sys-surface4 rounded-xl font-bold transition-colors">
                        Close & Review Later
                    </button>
                </div>
            </div>
        </div>
    );
};
