import React, { useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { Check, X, Edit2, AlertTriangle, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PendingReview } from '../store/slices/createDataSlice';

interface ReviewQueueModalProps {
    onClose: () => void;
}

interface UnknownReviewItem {
    id: string;
    value: string;
    context: string;
    type: 'unknown_id';
    originalConfidence: number;
    isUnknown: true;
}

interface LearningReviewItem {
    id: string;
    value: string;
    rawValue: string;
    suggestedName: string;
    context: string;
    type: 'ocr_learning_review';
    originalConfidence: number;
    isLearning: true;
    learningEventId: string;
    explanation: string[];
}

type ReviewItem = PendingReview | UnknownReviewItem | LearningReviewItem;

const isUnknownReview = (review: ReviewItem): review is UnknownReviewItem =>
    review.type === 'unknown_id';

const isLearningReview = (review: ReviewItem): review is LearningReviewItem =>
    review.type === 'ocr_learning_review';

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
    const ocrLearningQueue = useAppStore((s) => s.ocrLearningQueue);
    const approveOcrLearningEvent = useAppStore((s) => s.approveOcrLearningEvent);
    const rejectOcrLearningEvent = useAppStore((s) => s.rejectOcrLearningEvent);
    const recordOcrAliasCorrection = useAppStore((s) => s.recordOcrAliasCorrection);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const normalizeName = (value: string) => value.trim();
    const namesEqual = (a: string, b: string) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
    const dedupeNames = (names: string[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        names.forEach((name) => {
            const normalized = normalizeName(name);
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(normalized);
        });
        return out;
    };

    const unknownItems: UnknownReviewItem[] = Object.entries(detectedUnknowns).map(([id, data]) => ({
        id,
        value: `Unknown ${data.type} (${id.substring(0, 5)})`,
        context: `New ${data.type} Discovered`,
        type: 'unknown_id',
        originalConfidence: 0,
        isUnknown: true
    }));

    const learningItems: LearningReviewItem[] = (ocrLearningQueue || []).map((item) => ({
        id: item.id,
        value: `${item.rawText} -> ${item.suggestedName}`,
        rawValue: item.rawText,
        suggestedName: item.suggestedName,
        context: `OCR Learning (${item.context})`,
        type: 'ocr_learning_review',
        originalConfidence: Math.round(item.score * 100),
        isLearning: true,
        learningEventId: item.eventId,
        explanation: item.explanation || [],
    }));

    const allItems: ReviewItem[] = [...learningItems, ...pendingReviews, ...unknownItems];

    const replaceNameInSession = (oldName: string, newName: string) => {
        const normalizedOld = normalizeName(oldName);
        const normalizedNew = normalizeName(newName);
        if (!normalizedOld || !normalizedNew) return;
        if (namesEqual(normalizedOld, normalizedNew)) return;

        const newTeams = { ...sessionTeams };
        Object.keys(newTeams).forEach(color => {
            const names = Array.isArray(newTeams[color]) ? newTeams[color] : [];
            newTeams[color] = dedupeNames(names.map(n => namesEqual(n, normalizedOld) ? normalizedNew : n));
        });
        setSessionTeams(newTeams);
        setSelectedTeammates(dedupeNames(selectedTeammates.map(n => namesEqual(n, normalizedOld) ? normalizedNew : n)));
        setSelectedOpponents(dedupeNames(selectedOpponents.map(n => namesEqual(n, normalizedOld) ? normalizedNew : n)));
    };

    const removeNameFromSession = (targetName: string) => {
        const normalizedTarget = normalizeName(targetName);
        if (!normalizedTarget) return;

        const newTeams = { ...sessionTeams };
        Object.keys(newTeams).forEach(color => {
            const names = Array.isArray(newTeams[color]) ? newTeams[color] : [];
            newTeams[color] = dedupeNames(names.filter(n => !namesEqual(n, normalizedTarget)));
        });
        setSessionTeams(newTeams);
        setSelectedTeammates(dedupeNames(selectedTeammates.filter(n => !namesEqual(n, normalizedTarget))));
        setSelectedOpponents(dedupeNames(selectedOpponents.filter(n => !namesEqual(n, normalizedTarget))));
    };

    const handleConfirm = (review: ReviewItem) => {
        if (isUnknownReview(review)) {
            setToast({ message: "Please rename to identify this item", type: 'info' });
            startEdit(review);
            return;
        }
        if (isLearningReview(review)) {
            approveOcrLearningEvent(review.learningEventId);
            setToast({ message: `Approved OCR learning: "${review.rawValue}" -> "${review.suggestedName}"`, type: 'success' });
            return;
        }

        if (review.type === 'player_name') {
            const normalized = normalizeName(review.value);
            if (normalized) addToRegistry(normalized);
            removePendingReview(review.id);
            setToast({ message: `Added "${normalized || review.value}" to roster`, type: 'success' });
            return;
        }

        if (review.type === 'roster_candidate') {
            const normalized = normalizeName(review.value);
            if (normalized) addToRegistry(normalized);
            removePendingReview(review.id);
            setToast({ message: `Added "${normalized || review.value}" to roster`, type: 'success' });
            return;
        }

        removePendingReview(review.id);
        setToast({ message: "Item confirmed", type: 'success' });
    };

    const handleDelete = (review: ReviewItem) => {
        if (isUnknownReview(review)) {
            setToast({ message: "Cannot delete unknown ID yet", type: 'error' });
            return;
        }
        if (isLearningReview(review)) {
            rejectOcrLearningEvent(review.learningEventId, 'Rejected from review queue');
            setToast({ message: "Learning suggestion rejected", type: 'success' });
            return;
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            removeNameFromSession(review.value);
        }
        removePendingReview(review.id);
        setToast({ message: "Item deleted", type: 'success' });
    };

    const handleSaveEdit = (review: ReviewItem) => {
        const normalizedEditValue = normalizeName(editValue);
        if (!normalizedEditValue) return;

        if (isUnknownReview(review)) {
            addMapping(review.id, normalizedEditValue);
            setToast({ message: `Mapped ID to "${normalizedEditValue}"`, type: 'success' });
            setEditingId(null);
            return;
        }
        if (isLearningReview(review)) {
            rejectOcrLearningEvent(review.learningEventId, `Edited to "${normalizedEditValue}"`);
            recordOcrAliasCorrection(review.rawValue || review.value, normalizedEditValue, {
                source: 'review_modal',
                context: 'unknown',
                confidenceWeight: 1,
                decisionId: review.learningEventId,
            });
            setToast({ message: `Applied correction "${review.rawValue}" -> "${normalizedEditValue}"`, type: 'success' });
            setEditingId(null);
            return;
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            replaceNameInSession(review.value, normalizedEditValue);
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            addToRegistry(normalizedEditValue);
        }

        removePendingReview(review.id);
        setToast({ message: "Item updated", type: 'success' });
        setEditingId(null);
    };

    const startEdit = (review: ReviewItem) => {
        setEditingId(review.id);
        setEditValue(isUnknownReview(review) ? "" : review.value);
    };

    if (allItems.length === 0) {
        return (
            <div className="md3-dialog-scrim fixed inset-0 z-modal-top flex items-center justify-center p-4">
                <div className="md3-dialog rounded-modal w-full max-w-sm text-center">
                    <div className="md3-dialog-title">All Caught Up!</div>
                    <div className="md3-dialog-content text-md-sys-on-surface/60">
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
        <div className="md3-dialog-scrim fixed inset-0 z-modal-top flex items-center justify-center p-4" onClick={onClose}>
            <div className="md3-dialog rounded-modal w-full max-w-lg overflow-hidden max-h-80vh" onClick={e => e.stopPropagation()}>
                <div className="md3-banner md3-banner--warn">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={20} />
                        <h2 className="text-title font-bold">Review Queue</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="md3-chip text-label-sm font-mono">{allItems.length} Remaining</span>
                        <button onClick={onClose} className="md3-icon-btn" title="Close">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar md3-dialog-content">
                    {allItems.map(review => (
                        <div key={review.id} className="md3-card rounded-card p-3 border border-md-sys-outline-variant/30 animate-fade-in">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-label-sm font-black uppercase text-md-sys-on-surface/40 tracking-wider mb-1">
                                        {review.context || 'Unknown Context'}
                                    </div>
                                    {!isUnknownReview(review) && (
                                        <div className="text-label-sm text-md-sys-on-surface/60 font-mono mb-2">
                                            Confidence: {Math.round(review.originalConfidence)}%
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {editingId === review.id ? (
                                        <>
                                            <button onClick={() => handleSaveEdit(review)} className="md3-icon-btn text-success" title="Save"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="md3-icon-btn" title="Cancel"><X size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            {/* For Unknowns, Check button enters edit mode essentially */}
                                            <button onClick={() => isUnknownReview(review) ? startEdit(review) : handleConfirm(review)} className="md3-icon-btn text-success" title="Confirm/Identify"><Check size={16} /></button>
                                            <button onClick={() => startEdit(review)} className="md3-icon-btn text-info" title="Edit"><Edit2 size={16} /></button>
                                            {!isUnknownReview(review) && (
                                                <button onClick={() => handleDelete(review)} className="md3-icon-btn text-danger" title="Delete (Junk)"><Trash2 size={16} /></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {editingId === review.id ? (
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={isUnknownReview(review) ? "Enter Name..." : ""}
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
                                        <div className="text-label-sm text-md-sys-on-surface/60">
                                            Best match: <span className="font-semibold">{review.bestMatch || 'None'}</span> ({Math.round(review.bestScore)}%)
                                            {review.bestScore >= 90 && (
                                                <span className="ml-2 text-success font-bold">Auto-Merge Suggested</span>
                                            )}
                                        </div>
                                    )}
                                    {Array.isArray(review.suggestions) && review.suggestions.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {review.suggestions.map((s) => (
                                                <button
                                                    key={s.name}
                                                    onClick={() => {
                                                        replaceNameInSession(review.value, s.name);
                                                        removePendingReview(review.id);
                                                        setToast({ message: `Merged into "${s.name}"`, type: 'success' });
                                                    }}
                                                    className="md3-chip text-label-sm font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors"
                                                >
                                                    Merge with {s.name} ({Math.round(s.score)}%)
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!editingId && isLearningReview(review) && Array.isArray(review.explanation) && review.explanation.length > 0 && (
                                <div className="mt-2 text-label-sm opacity-60 space-y-1">
                                    {review.explanation.slice(0, 3).map((line: string, idx: number) => (
                                        <div key={`${review.id}_exp_${idx}`}>- {line}</div>
                                    ))}
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

