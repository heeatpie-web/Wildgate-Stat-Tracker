import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { LocalImage } from '../LocalImage';

interface WorkspaceImageViewerProps {
    images: string[];
    activeIndex: number;
    onActiveIndexChange: (index: number) => void;
    onClose?: () => void;
    title?: string;
    subtitle?: string;
    className?: string;
    stageClassName?: string;
    imageAltPrefix?: string;
    showThumbnails?: boolean;
    showHeader?: boolean;
    enableLoupe?: boolean;
    autoFocus?: boolean;
}

interface ViewerLoupeState {
    imagePath: string;
    clientX: number;
    clientY: number;
    relX: number;
    relY: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const WorkspaceImageViewer: React.FC<WorkspaceImageViewerProps> = ({
    images,
    activeIndex,
    onActiveIndexChange,
    onClose,
    title = 'Evidence Viewer',
    subtitle = '',
    className = '',
    stageClassName = '',
    imageAltPrefix = 'Screenshot',
    showThumbnails = true,
    showHeader = true,
    enableLoupe = true,
    autoFocus = false,
}) => {
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [loupeState, setLoupeState] = useState<ViewerLoupeState | null>(null);

    const safeImages = useMemo(
        () => (images || []).map((entry) => String(entry || '').trim()).filter(Boolean),
        [images]
    );
    const hasImages = safeImages.length > 0;
    const clampedIndex = hasImages ? clamp(activeIndex, 0, safeImages.length - 1) : 0;
    const currentImage = hasImages ? safeImages[clampedIndex] : '';
    const canPan = zoom > 1.02;

    useEffect(() => {
        if (!hasImages) return;
        if (clampedIndex !== activeIndex) {
            onActiveIndexChange(clampedIndex);
        }
    }, [activeIndex, clampedIndex, hasImages, onActiveIndexChange]);

    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setIsDragging(false);
        setDragStart(null);
        setLoupeState(null);
    }, [clampedIndex, currentImage]);

    useEffect(() => {
        if (!autoFocus || !viewerRef.current) return;
        viewerRef.current.focus();
    }, [autoFocus, clampedIndex]);

    const resetView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setIsDragging(false);
        setDragStart(null);
    }, []);

    const goPrev = useCallback(() => {
        if (!hasImages) return;
        onActiveIndexChange((clampedIndex - 1 + safeImages.length) % safeImages.length);
    }, [clampedIndex, hasImages, onActiveIndexChange, safeImages.length]);

    const goNext = useCallback(() => {
        if (!hasImages) return;
        onActiveIndexChange((clampedIndex + 1) % safeImages.length);
    }, [clampedIndex, hasImages, onActiveIndexChange, safeImages.length]);

    const adjustZoom = useCallback((nextZoom: number) => {
        const bounded = clamp(nextZoom, 1, 4);
        setZoom(bounded);
        if (bounded <= 1.02) {
            setPan({ x: 0, y: 0 });
        }
    }, []);

    const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        if (!currentImage) return;
        event.preventDefault();
        const delta = event.deltaY < 0 ? 0.18 : -0.18;
        adjustZoom(zoom + delta);
    }, [adjustZoom, currentImage, zoom]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!canPan) return;
        event.preventDefault();
        setIsDragging(true);
        setDragStart({
            x: event.clientX - pan.x,
            y: event.clientY - pan.y,
        });
    }, [canPan, pan.x, pan.y]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!stageRef.current || !currentImage) return;
        if (isDragging && dragStart) {
            event.preventDefault();
            setPan({
                x: event.clientX - dragStart.x,
                y: event.clientY - dragStart.y,
            });
            return;
        }
        if (!enableLoupe) return;
        const bounds = stageRef.current.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const relX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        const relY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
        setLoupeState({
            imagePath: currentImage,
            clientX: event.clientX,
            clientY: event.clientY,
            relX,
            relY,
        });
    }, [currentImage, dragStart, enableLoupe, isDragging]);

    const stopDragging = useCallback(() => {
        setIsDragging(false);
        setDragStart(null);
    }, []);

    const clearLoupe = useCallback(() => {
        if (isDragging) return;
        setLoupeState(null);
    }, [isDragging]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!hasImages) return;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goPrev();
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goNext();
            return;
        }
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            adjustZoom(zoom + 0.2);
            return;
        }
        if (event.key === '-') {
            event.preventDefault();
            adjustZoom(zoom - 0.2);
            return;
        }
        if (event.key === '0') {
            event.preventDefault();
            resetView();
            return;
        }
        if (event.key === 'Escape' && onClose) {
            event.preventDefault();
            onClose();
        }
    }, [adjustZoom, goNext, goPrev, hasImages, onClose, resetView, zoom]);

    if (!hasImages) {
        return (
            <div className={`rounded-card border border-md-sys-outline/15 bg-md-sys-surface-container p-6 text-center text-label-sm text-md-sys-on-surface/60 ${className}`.trim()}>
                No screenshots available.
            </div>
        );
    }

    return (
        <div
            ref={viewerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={`flex min-h-0 flex-col rounded-card border border-md-sys-outline/15 bg-md-sys-surface-container shadow-sm outline-none ${className}`.trim()}
        >
            {showHeader && (
                <div className="flex items-center gap-3 border-b border-md-sys-outline/10 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-label-sm font-black uppercase tracking-wide text-md-sys-on-surface/70">
                            {title}
                        </div>
                        <div className="truncate text-label-sm text-md-sys-on-surface/55">
                            {subtitle || `${clampedIndex + 1} of ${safeImages.length}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => adjustZoom(zoom - 0.2)}
                            className="md3-icon-btn"
                            title="Zoom out"
                            aria-label="Zoom out"
                        >
                            <ZoomOut size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => adjustZoom(zoom + 0.2)}
                            className="md3-icon-btn"
                            title="Zoom in"
                            aria-label="Zoom in"
                        >
                            <ZoomIn size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={resetView}
                            className="md3-icon-btn"
                            title="Reset zoom and pan"
                            aria-label="Reset view"
                        >
                            <RotateCcw size={16} />
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="md3-icon-btn"
                                title="Close viewer"
                                aria-label="Close viewer"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 px-4 py-2">
                <button
                    type="button"
                    onClick={goPrev}
                    className="md3-icon-btn"
                    title="Previous screenshot"
                    aria-label="Previous screenshot"
                >
                    <ChevronLeft size={18} />
                </button>
                <div className="min-w-0 flex-1 truncate text-center text-label-sm font-semibold text-md-sys-on-surface/72">
                    {currentImage.split(/[\\/]/).pop() || `${imageAltPrefix} ${clampedIndex + 1}`}
                </div>
                <button
                    type="button"
                    onClick={goNext}
                    className="md3-icon-btn"
                    title="Next screenshot"
                    aria-label="Next screenshot"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            <div
                ref={stageRef}
                className={`relative min-h-[360px] flex-1 overflow-hidden bg-md-sys-surface-container-lowest ${canPan ? 'cursor-grab' : 'cursor-crosshair'} ${stageClassName}`.trim()}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
                onPointerLeave={() => {
                    stopDragging();
                    clearLoupe();
                }}
            >
                <div className="absolute inset-0 flex items-center justify-center p-4">
                    <LocalImage
                        src={currentImage}
                        alt={`${imageAltPrefix} ${clampedIndex + 1}`}
                        className="max-h-full max-w-full select-none rounded-xl shadow-xl"
                        draggable={false}
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isDragging ? 'none' : 'transform 120ms ease-out',
                            cursor: canPan ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
                        }}
                    />
                </div>
            </div>

            {showThumbnails && safeImages.length > 1 && (
                <div className="border-t border-md-sys-outline/10 px-3 py-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {safeImages.map((imagePath, index) => {
                            const isActive = index === clampedIndex;
                            return (
                                <button
                                    key={`${imagePath}-${index}`}
                                    type="button"
                                    onClick={() => onActiveIndexChange(index)}
                                    className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border transition-all ${isActive
                                        ? 'border-md-sys-primary shadow-md'
                                        : 'border-md-sys-outline/18 opacity-75 hover:border-md-sys-primary/40 hover:opacity-100'
                                    }`}
                                    aria-label={`Open ${imageAltPrefix.toLowerCase()} ${index + 1}`}
                                >
                                    <LocalImage
                                        src={imagePath}
                                        alt={`${imageAltPrefix} thumbnail ${index + 1}`}
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-scrim-40 px-1 py-0.5 text-center text-label-xs font-bold text-on-scrim">
                                        #{index + 1}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {enableLoupe && loupeState && !isDragging && (
                <div
                    className="pointer-events-none fixed z-top overflow-hidden rounded-card border border-md-sys-primary/35 bg-md-sys-surface shadow-2xl"
                    style={{
                        width: 220,
                        height: 220,
                        left: clamp(loupeState.clientX + 18, 8, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 228),
                        top: clamp(loupeState.clientY + 18, 8, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 228),
                    }}
                >
                    <LocalImage
                        src={loupeState.imagePath}
                        alt="Image loupe preview"
                        className="h-full w-full object-cover select-none"
                        style={{
                            transform: 'scale(2.8)',
                            transformOrigin: `${Math.round(loupeState.relX * 100)}% ${Math.round(loupeState.relY * 100)}%`,
                        }}
                    />
                    <div className="absolute inset-0 border border-white/20" />
                </div>
            )}
        </div>
    );
};

export default WorkspaceImageViewer;
