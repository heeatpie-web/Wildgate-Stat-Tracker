import React, { useId, useMemo, useState } from 'react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { Check, X, Edit2, AlertTriangle, Trash2, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PendingReview } from '../store/slices/createDataSlice';
import { LocalImage } from './LocalImage';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAriaLiveRegion } from '../hooks/useAriaLiveRegion';

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

const isPendingReviewItem = (review: ReviewItem): review is PendingReview =>
    !isUnknownReview(review) && !isLearningReview(review);

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
    const { pushNotification } = useUIState();
    const ocrLearningQueue = useAppStore((s) => s.ocrLearningQueue);
    const approveOcrLearningEvent = useAppStore((s) => s.approveOcrLearningEvent);
    const rejectOcrLearningEvent = useAppStore((s) => s.rejectOcrLearningEvent);
    const recordOcrAliasCorrection = useAppStore((s) => s.recordOcrAliasCorrection);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [sourcePreview, setSourcePreview] = useState<{ src: string; label: string } | null>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const sourcePreviewTitleId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(!sourcePreview);
    const sourcePreviewFocusTrapRef = useFocusTrap<HTMLDivElement>(sourcePreview != null);
    const { announce } = useAriaLiveRegion(true);

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
    const formatCaptureTime = (timestamp?: number) => {
        if (!timestamp || !Number.isFinite(timestamp)) return '';
        return new Date(timestamp).toLocaleString();
    };
    const getReviewSourceDetails = (review: ReviewItem) => {
        if (!isPendingReviewItem(review)) return null;
        const sourceCapture = review.sourceCapture;
        if (!sourceCapture) return null;
        return {
            screenshotPath: sourceCapture.screenshotPath,
            screenshotLabel: sourceCapture.screenshotLabel || 'Captured Screenshot',
            capturedAtLabel: formatCaptureTime(sourceCapture.capturedAt),
        };
    };
    const notifyReviewQueue = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        pushNotification({
            message,
            type,
            source: 'review-queue',
            deepLink: { type: 'openReviewQueue' },
        });
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

    const prioritizedPending = useMemo(() => (
        [...pendingReviews].sort((a, b) => {
            const aPriority = a.type === 'roster_candidate' ? 2 : 1;
            const bPriority = b.type === 'roster_candidate' ? 2 : 1;
            if (aPriority !== bPriority) return bPriority - aPriority;
            return (Number(b.bestScore || 0) - Number(a.bestScore || 0));
        })
    ), [pendingReviews]);

    const allItems: ReviewItem[] = [...learningItems, ...prioritizedPending, ...unknownItems];

    useKeyboardShortcuts([
        {
            key: 'Escape',
            handler: () => {
                if (sourcePreview) {
                    setSourcePreview(null);
                    announce('Closed source preview.', 'polite');
                    return;
                }
                if (editingId) {
                    setEditingId(null);
                    announce('Cancelled edit.', 'polite');
                    return;
                }
                onClose();
            },
        },
    ], true);

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
            notifyReviewQueue('Please rename to identify this item', 'info');
            startEdit(review);
            announce('Unknown item requires a name before confirming.', 'assertive');
            return;
        }
        if (isLearningReview(review)) {
            approveOcrLearningEvent(review.learningEventId);
            notifyReviewQueue(`Approved OCR learning: "${review.rawValue}" -> "${review.suggestedName}"`, 'success');
            announce(`Approved learning correction from ${review.rawValue} to ${review.suggestedName}.`, 'polite');
            return;
        }

        if (review.type === 'player_name') {
            const normalized = normalizeName(review.value);
            if (normalized) addToRegistry(normalized);
            removePendingReview(review.id);
            notifyReviewQueue(`Added "${normalized || review.value}" to roster`, 'success');
            announce(`Added ${normalized || review.value} to roster.`, 'polite');
            return;
        }

        if (review.type === 'roster_candidate') {
            const normalized = normalizeName(review.value);
            if (normalized) addToRegistry(normalized);
            removePendingReview(review.id);
            notifyReviewQueue(`Added "${normalized || review.value}" to roster`, 'success');
            announce(`Added ${normalized || review.value} to roster.`, 'polite');
            return;
        }

        removePendingReview(review.id);
        notifyReviewQueue('Item confirmed', 'success');
        announce('Review item confirmed.', 'polite');
    };

    const handleDelete = (review: ReviewItem) => {
        if (isUnknownReview(review)) {
            notifyReviewQueue('Cannot delete unknown ID yet', 'error');
            announce('Unknown IDs must be mapped before removal.', 'assertive');
            return;
        }
        if (isLearningReview(review)) {
            rejectOcrLearningEvent(review.learningEventId, 'Rejected from review queue');
            notifyReviewQueue('Learning suggestion rejected', 'success');
            announce('Learning suggestion rejected.', 'polite');
            return;
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            removeNameFromSession(review.value);
        }
        removePendingReview(review.id);
        notifyReviewQueue('Item deleted', 'success');
        announce('Review item deleted.', 'polite');
    };

    const handleSaveEdit = (review: ReviewItem) => {
        const normalizedEditValue = normalizeName(editValue);
        if (!normalizedEditValue) {
            announce('Edited value cannot be empty.', 'assertive');
            return;
        }

        if (isUnknownReview(review)) {
            addMapping(review.id, normalizedEditValue);
            notifyReviewQueue(`Mapped ID to "${normalizedEditValue}"`, 'success');
            setEditingId(null);
            announce(`Mapped unknown identifier to ${normalizedEditValue}.`, 'polite');
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
            notifyReviewQueue(`Applied correction "${review.rawValue}" -> "${normalizedEditValue}"`, 'success');
            setEditingId(null);
            announce(`Applied correction from ${review.rawValue} to ${normalizedEditValue}.`, 'polite');
            return;
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            replaceNameInSession(review.value, normalizedEditValue);
        }

        if (review.type === 'player_name' || review.type === 'roster_candidate') {
            addToRegistry(normalizedEditValue);
        }

        removePendingReview(review.id);
        notifyReviewQueue('Item updated', 'success');
        setEditingId(null);
        announce(`Updated item to ${normalizedEditValue}.`, 'polite');
    };

    const startEdit = (review: ReviewItem) => {
        setEditingId(review.id);
        setEditValue(isUnknownReview(review) ? "" : review.value);
    };

    if (allItems.length === 0) {
        return (
            <div className="md3-dialog-scrim fixed inset-0 z-modal-top flex items-center justify-center p-4">
                <div
                    ref={focusTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={dialogTitleId}
                    aria-describedby={dialogDescriptionId}
                    className="md3-dialog rounded-modal w-full max-w-sm text-center"
                >
                    <div id={dialogTitleId} className="md3-dialog-title">All Caught Up!</div>
                    <div id={dialogDescriptionId} className="md3-dialog-content text-md-sys-on-surface/60">
                        No uncertain data pending review.
                    </div>
                    <div className="md3-dialog-actions">
                        <button type="button" onClick={onClose} className="md3-btn-filled w-full">Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="md3-dialog-scrim fixed inset-0 z-modal-top flex items-center justify-center p-4" onClick={onClose}>
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="md3-dialog rounded-modal w-full max-w-lg overflow-hidden max-h-80vh"
                onClick={e => e.stopPropagation()}
            >
                <div className="md3-banner md3-banner--warn">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={20} />
                        <h2 id={dialogTitleId} className="text-title font-bold">Review Queue</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="md3-chip text-label-sm font-mono">{allItems.length} Remaining</span>
                        <button type="button" onClick={onClose} className="md3-icon-btn" title="Close" aria-label="Close review queue">
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <p id={dialogDescriptionId} className="a11y-sr-only">
                    Review uncertain OCR and mapping items. Use Tab to move through actions and Escape to close.
                </p>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar md3-dialog-content">
                    {allItems.map(review => {
                        const sourceDetails = getReviewSourceDetails(review);
                        return (
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
                                            <button onClick={() => handleSaveEdit(review)} className="md3-icon-btn text-success" title="Save" aria-label="Save review edit"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="md3-icon-btn" title="Cancel" aria-label="Cancel review edit"><X size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            {/* For Unknowns, Check button enters edit mode essentially */}
                                            <button onClick={() => isUnknownReview(review) ? startEdit(review) : handleConfirm(review)} className="md3-icon-btn text-success" title="Confirm/Identify" aria-label="Confirm review item"><Check size={16} /></button>
                                            <button onClick={() => startEdit(review)} className="md3-icon-btn text-info" title="Edit" aria-label="Edit review item"><Edit2 size={16} /></button>
                                            {!isUnknownReview(review) && (
                                                <button onClick={() => handleDelete(review)} className="md3-icon-btn text-danger" title="Delete (Junk)" aria-label="Delete review item"><Trash2 size={16} /></button>
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

                            {editingId !== review.id && sourceDetails && (
                                <div className="mt-2 rounded-control md3-surface-high px-2.5 py-2 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-label-sm font-semibold text-md-sys-on-surface/70 truncate">
                                            Source: {sourceDetails.screenshotLabel}
                                        </div>
                                        {sourceDetails.capturedAtLabel && (
                                            <div className="text-label-sm text-md-sys-on-surface/50">
                                                Captured: {sourceDetails.capturedAtLabel}
                                            </div>
                                        )}
                                        {!sourceDetails.screenshotPath && (
                                            <div className="text-label-sm text-md-sys-on-surface/40">
                                                Screenshot unavailable for this entry.
                                            </div>
                                        )}
                                    </div>
                                    {sourceDetails.screenshotPath && (
                                        <button
                                            type="button"
                                            onClick={() => setSourcePreview({ src: sourceDetails.screenshotPath as string, label: sourceDetails.screenshotLabel })}
                                            className="md3-btn-tonal px-2.5 py-1.5 text-label-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5"
                                        >
                                            <ImageIcon size={14} />
                                            View Source
                                        </button>
                                    )}
                                </div>
                            )}

                            {editingId !== review.id && review.type === 'roster_candidate' && (
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
                                                        pushNotification({
                                                            message: `Merged into "${s.name}"`,
                                                            type: 'success',
                                                            source: 'review-queue',
                                                            deepLink: { type: 'openReviewQueue' },
                                                        });
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
                            {editingId !== review.id && isLearningReview(review) && Array.isArray(review.explanation) && review.explanation.length > 0 && (
                                <div className="mt-2 text-label-sm opacity-60 space-y-1">
                                    {review.explanation.slice(0, 3).map((line: string, idx: number) => (
                                        <div key={`${review.id}_exp_${idx}`}>- {line}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )})}
                </div>

                <div className="md3-dialog-actions">
                    <button onClick={onClose} className="md3-btn-outlined w-full">
                        Close & Review Later
                    </button>
                </div>
            </div>
            {sourcePreview && (
                <div
                    className="fixed inset-0 z-modal-top bg-scrim-90 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(event) => {
                        event.stopPropagation();
                        setSourcePreview(null);
                        announce('Closed source preview.', 'polite');
                    }}
                >
                    <div
                        ref={sourcePreviewFocusTrapRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={sourcePreviewTitleId}
                        className="md3-dialog rounded-modal w-full max-w-5xl max-h-80vh overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="md3-banner md3-banner--info">
                            <div className="flex items-center gap-2 min-w-0">
                                <ImageIcon size={18} />
                                <div id={sourcePreviewTitleId} className="text-title font-bold truncate">
                                    {sourcePreview.label}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSourcePreview(null);
                                    announce('Closed source preview.', 'polite');
                                }}
                                className="md3-icon-btn"
                                title="Close Source Preview"
                                aria-label="Close source preview"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 md3-surface-high max-h-80vh overflow-auto">
                            <LocalImage
                                src={sourcePreview.src}
                                alt={sourcePreview.label}
                                className="w-full h-auto object-contain rounded-control"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

