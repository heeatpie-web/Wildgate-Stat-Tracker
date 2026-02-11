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

        removePendingReview(review.id);
        setToast({ message: "Item confirmed", type: 'success' });
    };

    const handleDelete = (review: any) => {
        if (review.isUnknown) {
            setToast({ message: "Cannot delete unknown ID yet", type: 'error' });
            return;
        }

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
        setEditValue(review.isUnknown ? "" : review.value);
    };

    if (allItems.length === 0) {
        return (
            <div className="md3-dialog-scrim fixed inset-0 z-[10010] flex items-center justify-center p-4">
                <div className="md3-dialog w-full max-w-sm text-center">
                    <div className="md3-dialog-title">All Caught Up!</div>
                    <div className="md3-dialog-content text-md-sys-on-surface/70">
                        No uncertain data pending review.
                    </div>
                    <div className="md3-dialog-actions">
                        <button onClick={onClose} className="md3-btn-filled w-full">Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="md3-dialog-scrim fixed inset-0 z-[10010] flex items-center justify-center p-4" onClick={onClose}>
            <div className="md3-dialog w-full max-w-lg overflow-hidden max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="md3-banner md3-banner--warn">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={20} />
                        <h2 className="md3-dialog-title text-base">Review Queue</h2>
                    </div>
                    <span className="md3-chip text-[11px] font-mono">{allItems.length} Remaining</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar md3-dialog-content">
                    {allItems.map(review => (
                        <div key={review.id} className="md3-card rounded-xl p-3 border border-md-sys-outline-variant/30 animate-fade-in">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-xs font-black uppercase text-md-sys-on-surface/40 tracking-wider mb-1">
                                        {review.context || 'Unknown Context'}
                                    </div>
                                    {!review.isUnknown && (
                                        <div className="text-xs text-md-sys-on-surface/70 font-mono mb-2">
                                            Confidence: {Math.round(review.originalConfidence)}%
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {editingId === review.id ? (
                                        <>
                                            <button onClick={() => handleSaveEdit(review)} className="md3-icon-btn text-emerald-400" title="Save"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="md3-icon-btn" title="Cancel"><X size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            {/* For Unknowns, Check button enters edit mode essentially */}
                                            <button onClick={() => review.isUnknown ? startEdit(review) : handleConfirm(review)} className="md3-icon-btn text-emerald-400" title="Confirm/Identify"><Check size={16} /></button>
                                            <button onClick={() => startEdit(review)} className="md3-icon-btn text-sky-400" title="Edit"><Edit2 size={16} /></button>
                                            {!review.isUnknown && (
                                                <button onClick={() => handleDelete(review)} className="md3-icon-btn text-red-400" title="Delete (Junk)"><Trash2 size={16} /></button>
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
                                    className="md3-textfield md3-textfield--outlined w-full font-semibold text-base"
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
                                                    className="md3-chip text-[10px] font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors"
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

                <div className="md3-dialog-actions">
                    <button onClick={onClose} className="md3-btn-outlined w-full">
                        Close & Review Later
                    </button>
                </div>
            </div>
        </div>
    );
};

