import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Upload, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
    createDefaultOcrRegions,
    type OcrRegionBounds,
    type OcrRegionSettings,
} from '../store/slices/createSettingsSlice';

type ScreenKey = 'crewHub' | 'mapScreen';
type CrewRegionKey = keyof OcrRegionSettings['crewHub'];
type MapRegionKey = keyof OcrRegionSettings['mapScreen'];
type RegionKey = CrewRegionKey | MapRegionKey;
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface OcrRegionEditorModalProps {
    isOpen: boolean;
    initialRegions: OcrRegionSettings;
    onApply: (regions: OcrRegionSettings) => void;
    onClose: () => void;
}

interface PointPx {
    x: number;
    y: number;
}

interface RectPx {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

type InteractionState =
    | {
        mode: 'draw';
        pointerId: number;
        start: PointPx;
        screen: ScreenKey;
        regionKey: RegionKey;
    }
    | {
        mode: 'move';
        pointerId: number;
        start: PointPx;
        startRect: RectPx;
        screen: ScreenKey;
        regionKey: RegionKey;
    }
    | {
        mode: 'resize';
        pointerId: number;
        start: PointPx;
        startRect: RectPx;
        handle: ResizeHandle;
        screen: ScreenKey;
        regionKey: RegionKey;
    };

interface ImageSize {
    width: number;
    height: number;
}

const CREW_REGION_KEYS: CrewRegionKey[] = [
    'leftPanel', 'rightPanel', 'teamHeader',
    'leftTeamHeader', 'leftTeamPlayers', 'rightTeamHeader', 'rightTeamPlayers',
];
const MAP_REGION_KEYS: MapRegionKey[] = [
    'yourShip',
    'enemyShips',
    'enemyShips2',
    'enemyShips3',
    'enemyShips4',
    'hazards',
    'players',
    'alliedShips',
    'scoreOrTimer',
];

const REGION_LABELS: Record<RegionKey, string> = {
    leftPanel: 'Crew Left Panel',
    rightPanel: 'Crew Right Panel',
    teamHeader: 'Crew Team Header',
    leftTeamHeader: 'Crew Left Team Header',
    leftTeamPlayers: 'Crew Left Team Players',
    rightTeamHeader: 'Crew Right Team Header',
    rightTeamPlayers: 'Crew Right Team Players',
    yourShip: 'Map Your Ship',
    enemyShips: 'Map Enemy Ships #1',
    enemyShips2: 'Map Enemy Ships #2',
    enemyShips3: 'Map Enemy Ships #3',
    enemyShips4: 'Map Enemy Ships #4',
    hazards: 'Map Hazards',
    players: 'Map Players',
    alliedShips: 'Map Allied Ships',
    scoreOrTimer: 'Map Score / Timer',
};

const REGION_COLORS: Record<RegionKey, string> = {
    leftPanel: '#34D399',
    rightPanel: '#F59E0B',
    teamHeader: '#38BDF8',
    leftTeamHeader: '#6EE7B7',
    leftTeamPlayers: '#10B981',
    rightTeamHeader: '#FCD34D',
    rightTeamPlayers: '#D97706',
    yourShip: '#34D399',
    enemyShips: '#F59E0B',
    enemyShips2: '#FB923C',
    enemyShips3: '#FDBA74',
    enemyShips4: '#FCD34D',
    hazards: '#EF4444',
    players: '#6366F1',
    alliedShips: '#22D3EE',
    scoreOrTimer: '#E879F9',
};

const MIN_NORMALIZED_SIZE = 0.005;
const MIN_PIXEL_SIZE = 8;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|bmp|webp|gif)$/i;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const cloneRegions = (regions: OcrRegionSettings): OcrRegionSettings => ({
    crewHub: {
        leftPanel: { ...regions.crewHub.leftPanel },
        rightPanel: { ...regions.crewHub.rightPanel },
        teamHeader: { ...regions.crewHub.teamHeader },
        leftTeamHeader: { ...regions.crewHub.leftTeamHeader },
        leftTeamPlayers: { ...regions.crewHub.leftTeamPlayers },
        rightTeamHeader: { ...regions.crewHub.rightTeamHeader },
        rightTeamPlayers: { ...regions.crewHub.rightTeamPlayers },
    },
    mapScreen: {
        yourShip: { ...regions.mapScreen.yourShip },
        enemyShips: { ...regions.mapScreen.enemyShips },
        enemyShips2: { ...regions.mapScreen.enemyShips2 },
        enemyShips3: { ...regions.mapScreen.enemyShips3 },
        enemyShips4: { ...regions.mapScreen.enemyShips4 },
        hazards: { ...regions.mapScreen.hazards },
        players: { ...regions.mapScreen.players },
        alliedShips: { ...regions.mapScreen.alliedShips },
        scoreOrTimer: { ...regions.mapScreen.scoreOrTimer },
    },
});

const normalizeBounds = (bounds: OcrRegionBounds): OcrRegionBounds => {
    let xMin = clamp(bounds.xMin, 0, 1);
    let xMax = clamp(bounds.xMax, 0, 1);
    let yMin = clamp(bounds.yMin, 0, 1);
    let yMax = clamp(bounds.yMax, 0, 1);

    if (xMax - xMin < MIN_NORMALIZED_SIZE) {
        if (xMin + MIN_NORMALIZED_SIZE <= 1) {
            xMax = xMin + MIN_NORMALIZED_SIZE;
        } else {
            xMin = xMax - MIN_NORMALIZED_SIZE;
        }
    }
    if (yMax - yMin < MIN_NORMALIZED_SIZE) {
        if (yMin + MIN_NORMALIZED_SIZE <= 1) {
            yMax = yMin + MIN_NORMALIZED_SIZE;
        } else {
            yMin = yMax - MIN_NORMALIZED_SIZE;
        }
    }

    return {
        xMin: clamp(xMin, 0, 1),
        xMax: clamp(xMax, 0, 1),
        yMin: clamp(yMin, 0, 1),
        yMax: clamp(yMax, 0, 1),
    };
};

const boundsToRectPx = (bounds: OcrRegionBounds, imageSize: ImageSize): RectPx => ({
    left: bounds.xMin * imageSize.width,
    top: bounds.yMin * imageSize.height,
    right: bounds.xMax * imageSize.width,
    bottom: bounds.yMax * imageSize.height,
});

const rectPxToBounds = (rect: RectPx, imageSize: ImageSize): OcrRegionBounds => normalizeBounds({
    xMin: rect.left / imageSize.width,
    xMax: rect.right / imageSize.width,
    yMin: rect.top / imageSize.height,
    yMax: rect.bottom / imageSize.height,
});

const clampRectToImage = (rect: RectPx, imageSize: ImageSize): RectPx => {
    const maxWidth = imageSize.width;
    const maxHeight = imageSize.height;
    const width = clamp(rect.right - rect.left, MIN_PIXEL_SIZE, maxWidth);
    const height = clamp(rect.bottom - rect.top, MIN_PIXEL_SIZE, maxHeight);
    const left = clamp(rect.left, 0, maxWidth - width);
    const top = clamp(rect.top, 0, maxHeight - height);
    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
    };
};

const getScreenRegionKeys = (screen: ScreenKey): RegionKey[] => (
    screen === 'crewHub' ? [...CREW_REGION_KEYS] : [...MAP_REGION_KEYS]
);

const getRegionBounds = (
    regions: OcrRegionSettings,
    screen: ScreenKey,
    regionKey: RegionKey
): OcrRegionBounds => {
    if (screen === 'crewHub') {
        return { ...regions.crewHub[regionKey as CrewRegionKey] };
    }
    return { ...regions.mapScreen[regionKey as MapRegionKey] };
};

const setRegionBounds = (
    regions: OcrRegionSettings,
    screen: ScreenKey,
    regionKey: RegionKey,
    bounds: OcrRegionBounds
): OcrRegionSettings => {
    if (screen === 'crewHub') {
        return {
            ...regions,
            crewHub: {
                ...regions.crewHub,
                [regionKey as CrewRegionKey]: normalizeBounds(bounds),
            },
        };
    }
    return {
        ...regions,
        mapScreen: {
            ...regions.mapScreen,
            [regionKey as MapRegionKey]: normalizeBounds(bounds),
        },
    };
};

const toPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
    nw: 'cursor-nwse-resize',
    n: 'cursor-ns-resize',
    ne: 'cursor-nesw-resize',
    e: 'cursor-ew-resize',
    se: 'cursor-nwse-resize',
    s: 'cursor-ns-resize',
    sw: 'cursor-nesw-resize',
    w: 'cursor-ew-resize',
};

export const OcrRegionEditorModal: React.FC<OcrRegionEditorModalProps> = ({
    isOpen,
    initialRegions,
    onApply,
    onClose,
}) => {
    const [draftRegions, setDraftRegions] = useState<OcrRegionSettings>(() => cloneRegions(initialRegions));
    const [screen, setScreen] = useState<ScreenKey>('crewHub');
    const [activeRegionKey, setActiveRegionKey] = useState<RegionKey>('leftPanel');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [imageSize, setImageSize] = useState<ImageSize | null>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const interactionRef = useRef<InteractionState | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const selectedFileRef = useRef<File | null>(null);
    const attemptedDataUrlFallbackRef = useRef(false);
    const attemptedFileUrlFallbackRef = useRef(false);
    const [imageLoadError, setImageLoadError] = useState<string | null>(null);
    const [imageLoadStatus, setImageLoadStatus] = useState<string>('No screenshot selected.');

    useKeyboardShortcuts([
        { key: 'Escape', handler: () => onClose() },
    ], isOpen);

    useEffect(() => {
        if (!isOpen) return;
        setDraftRegions(cloneRegions(initialRegions));
        setScreen('crewHub');
        setActiveRegionKey('leftPanel');
        setImageLoadError(null);
        setImageLoadStatus('No screenshot selected.');
    }, [initialRegions, isOpen]);

    useEffect(() => {
        if (screen === 'crewHub' && !CREW_REGION_KEYS.includes(activeRegionKey as CrewRegionKey)) {
            setActiveRegionKey('leftPanel');
            return;
        }
        if (screen === 'mapScreen' && !MAP_REGION_KEYS.includes(activeRegionKey as MapRegionKey)) {
            setActiveRegionKey('yourShip');
        }
    }, [activeRegionKey, screen]);

    const activeKeys = useMemo(() => getScreenRegionKeys(screen), [screen]);
    const activeBounds = useMemo(
        () => getRegionBounds(draftRegions, screen, activeRegionKey),
        [activeRegionKey, draftRegions, screen]
    );

    const updateActiveRegionFromRect = (screenKey: ScreenKey, regionKey: RegionKey, rect: RectPx) => {
        if (!imageSize) return;
        const clampedRect = clampRectToImage(rect, imageSize);
        const normalized = rectPxToBounds(clampedRect, imageSize);
        setDraftRegions((prev) => setRegionBounds(prev, screenKey, regionKey, normalized));
    };

    const getPointFromClient = (clientX: number, clientY: number): PointPx | null => {
        if (!svgRef.current || !imageSize) return null;
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const xScale = imageSize.width / rect.width;
        const yScale = imageSize.height / rect.height;
        return {
            x: clamp((clientX - rect.left) * xScale, 0, imageSize.width),
            y: clamp((clientY - rect.top) * yScale, 0, imageSize.height),
        };
    };

    const clearInteraction = () => {
        interactionRef.current = null;
    };

    const clearObjectUrl = () => {
        if (!objectUrlRef.current) return;
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = null;
    };

    const setPreviewSource = (source: string | null, fromObjectUrl = false) => {
        clearObjectUrl();
        if (source && fromObjectUrl) {
            objectUrlRef.current = source;
        }
        setImageSrc(source);
        setImageSize(null);
    };

    const readFileAsDataUrl = (file: File) => {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const dataUrl = typeof loadEvent.target?.result === 'string' ? loadEvent.target.result : null;
            if (!dataUrl) {
                setPreviewSource(null);
                setImageLoadError('Unable to load the selected image.');
                setImageLoadStatus('Failed reading selected file as data URL.');
                return;
            }
            setPreviewSource(dataUrl);
            setImageLoadStatus('Preview source: data URL');
        };
        reader.onerror = () => {
            const fallbackSrc = getElectronFileUrl(file);
            if (!attemptedFileUrlFallbackRef.current && fallbackSrc) {
                attemptedFileUrlFallbackRef.current = true;
                setPreviewSource(fallbackSrc);
                setImageLoadStatus('Preview source: file URL fallback');
                return;
            }
            setPreviewSource(null);
            setImageLoadError('Unable to load the selected image.');
            setImageLoadStatus('Failed to read selected file.');
        };
        reader.readAsDataURL(file);
    };

    const getElectronFileUrl = (file: File): string | null => {
        const candidate = (file as File & { path?: unknown }).path;
        if (typeof candidate !== 'string' || candidate.trim().length === 0) return null;
        const normalized = candidate.replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(normalized)) {
            return `file:///${encodeURI(normalized)}`;
        }
        return `file://${encodeURI(normalized)}`;
    };

    const beginImageLoad = (file: File) => {
        const hasImageMime = typeof file.type === 'string' && file.type.startsWith('image/');
        const hasImageExtension = IMAGE_EXTENSION_PATTERN.test(file.name || '');
        if (!hasImageMime && !hasImageExtension) {
            setPreviewSource(null);
            setImageLoadError('Selected file is not a supported image.');
            setImageLoadStatus(`Rejected file: ${file.name || 'unknown'} (unsupported type)`);
            return;
        }

        selectedFileRef.current = file;
        attemptedDataUrlFallbackRef.current = false;
        attemptedFileUrlFallbackRef.current = false;
        setImageLoadError(null);
        setImageLoadStatus(`Selected: ${file.name || 'unknown'} (${file.type || 'unknown type'})`);

        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            try {
                const previewUrl = URL.createObjectURL(file);
                setPreviewSource(previewUrl, true);
                setImageLoadStatus('Preview source: blob URL');
                return;
            } catch {
                // Fallback to FileReader below if object URL creation fails.
            }
        }

        readFileAsDataUrl(file);
    };

    useEffect(() => () => {
        if (!objectUrlRef.current) return;
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = null;
    }, []);

    const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
        if (event.button !== 0 || !imageSize) return;
        const point = getPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault();
        interactionRef.current = {
            mode: 'draw',
            pointerId: event.pointerId,
            start: point,
            screen,
            regionKey: activeRegionKey,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        const initialRect: RectPx = {
            left: point.x,
            top: point.y,
            right: point.x + MIN_PIXEL_SIZE,
            bottom: point.y + MIN_PIXEL_SIZE,
        };
        updateActiveRegionFromRect(screen, activeRegionKey, initialRect);
    };

    const handleBoxPointerDown = (
        event: React.PointerEvent<SVGRectElement>,
        regionKey: RegionKey
    ) => {
        event.stopPropagation();
        if (!imageSize || event.button !== 0) return;
        if (regionKey !== activeRegionKey) {
            setActiveRegionKey(regionKey);
            return;
        }
        const point = getPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        const startRect = boundsToRectPx(getRegionBounds(draftRegions, screen, regionKey), imageSize);
        interactionRef.current = {
            mode: 'move',
            pointerId: event.pointerId,
            start: point,
            startRect,
            screen,
            regionKey,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleResizePointerDown = (
        event: React.PointerEvent<SVGRectElement>,
        regionKey: RegionKey,
        handle: ResizeHandle
    ) => {
        event.stopPropagation();
        if (!imageSize || event.button !== 0) return;
        const point = getPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        const startRect = boundsToRectPx(getRegionBounds(draftRegions, screen, regionKey), imageSize);
        interactionRef.current = {
            mode: 'resize',
            pointerId: event.pointerId,
            start: point,
            startRect,
            handle,
            screen,
            regionKey,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!imageSize) return;
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        const point = getPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;

        if (interaction.mode === 'draw') {
            updateActiveRegionFromRect(interaction.screen, interaction.regionKey, {
                left: Math.min(interaction.start.x, point.x),
                top: Math.min(interaction.start.y, point.y),
                right: Math.max(interaction.start.x, point.x),
                bottom: Math.max(interaction.start.y, point.y),
            });
            return;
        }

        if (interaction.mode === 'move') {
            const width = interaction.startRect.right - interaction.startRect.left;
            const height = interaction.startRect.bottom - interaction.startRect.top;
            const left = clamp(interaction.startRect.left + dx, 0, imageSize.width - width);
            const top = clamp(interaction.startRect.top + dy, 0, imageSize.height - height);
            updateActiveRegionFromRect(interaction.screen, interaction.regionKey, {
                left,
                top,
                right: left + width,
                bottom: top + height,
            });
            return;
        }

        if (interaction.mode === 'resize') {
            let left = interaction.startRect.left;
            let right = interaction.startRect.right;
            let top = interaction.startRect.top;
            let bottom = interaction.startRect.bottom;

            if (interaction.handle.includes('w')) {
                left = clamp(left + dx, 0, right - MIN_PIXEL_SIZE);
            }
            if (interaction.handle.includes('e')) {
                right = clamp(right + dx, left + MIN_PIXEL_SIZE, imageSize.width);
            }
            if (interaction.handle.includes('n')) {
                top = clamp(top + dy, 0, bottom - MIN_PIXEL_SIZE);
            }
            if (interaction.handle.includes('s')) {
                bottom = clamp(bottom + dy, top + MIN_PIXEL_SIZE, imageSize.height);
            }

            updateActiveRegionFromRect(interaction.screen, interaction.regionKey, {
                left,
                top,
                right,
                bottom,
            });
        }
    };

    const handleCanvasPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        clearInteraction();
    };

    const resetCurrentScreen = () => {
        const defaults = createDefaultOcrRegions();
        setDraftRegions((prev) => (
            screen === 'crewHub'
                ? { ...prev, crewHub: cloneRegions(defaults).crewHub }
                : { ...prev, mapScreen: cloneRegions(defaults).mapScreen }
        ));
    };

    const resetSelectedRegion = () => {
        const defaults = createDefaultOcrRegions();
        const defaultBounds = getRegionBounds(defaults, screen, activeRegionKey);
        setDraftRegions((prev) => setRegionBounds(prev, screen, activeRegionKey, defaultBounds));
    };

    const applyAndClose = () => {
        onApply(cloneRegions(draftRegions));
        onClose();
    };

    const handleImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        beginImageLoad(file);
        event.target.value = '';
    };

    const openImagePicker = () => {
        setImageLoadError(null);
        fileInputRef.current?.click();
    };

    const selectedRect = imageSize ? boundsToRectPx(activeBounds, imageSize) : null;
    const selectedHandles = selectedRect
        ? ([
            { id: 'nw' as const, x: selectedRect.left, y: selectedRect.top },
            { id: 'n' as const, x: (selectedRect.left + selectedRect.right) / 2, y: selectedRect.top },
            { id: 'ne' as const, x: selectedRect.right, y: selectedRect.top },
            { id: 'e' as const, x: selectedRect.right, y: (selectedRect.top + selectedRect.bottom) / 2 },
            { id: 'se' as const, x: selectedRect.right, y: selectedRect.bottom },
            { id: 's' as const, x: (selectedRect.left + selectedRect.right) / 2, y: selectedRect.bottom },
            { id: 'sw' as const, x: selectedRect.left, y: selectedRect.bottom },
            { id: 'w' as const, x: selectedRect.left, y: (selectedRect.top + selectedRect.bottom) / 2 },
        ])
        : [];

    if (!isOpen) return null;

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-modal-top bg-scrim-70 backdrop-blur-sm flex items-stretch justify-center p-1 sm:p-2">
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                className="md3-dialog md3-dialog--roi-editor rounded-modal overflow-hidden flex flex-col"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-md-sys-outline/10 px-4 py-3">
                    <div>
                        <h2 id={dialogTitleId} className="text-title font-bold">Visual OCR ROI Editor</h2>
                        <p id={dialogDescriptionId} className="text-label-sm opacity-60">
                            Load an image, choose a region, then draw, drag, or resize directly on the full-resolution screenshot.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="md3-icon-btn" aria-label="Close ROI editor">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-3 p-3">
                    <div
                        ref={canvasViewportRef}
                        className="roi-canvas-viewport flex-1 min-w-0 min-h-0 md3-surface rounded-card border border-md-sys-outline/10 overflow-auto"
                    >
                        {imageSrc ? (
                            <div className="roi-canvas-stage">
                                <img
                                    src={imageSrc}
                                    alt="ROI editing target"
                                    className="roi-canvas-image block max-w-full h-auto select-none"
                                    draggable={false}
                                    onLoad={(event) => {
                                        const target = event.currentTarget;
                                        const naturalWidth = target.naturalWidth;
                                        const naturalHeight = target.naturalHeight;
                                        const renderedWidth = Math.round(target.getBoundingClientRect().width);
                                        const renderedHeight = Math.round(target.getBoundingClientRect().height);
                                        setImageSize({
                                            width: naturalWidth,
                                            height: naturalHeight,
                                        });
                                        if (canvasViewportRef.current) {
                                            canvasViewportRef.current.scrollTop = 0;
                                            canvasViewportRef.current.scrollLeft = 0;
                                        }
                                        setImageLoadError(null);
                                        setImageLoadStatus(
                                            `Image loaded: ${naturalWidth} x ${naturalHeight} (shown ${renderedWidth} x ${renderedHeight})`
                                        );
                                    }}
                                    onError={() => {
                                        const fallbackFile = selectedFileRef.current;
                                        if (
                                            !attemptedDataUrlFallbackRef.current
                                            && fallbackFile
                                            && imageSrc?.startsWith('blob:')
                                        ) {
                                            attemptedDataUrlFallbackRef.current = true;
                                            setImageLoadStatus('Blob URL failed. Trying data URL fallback...');
                                            readFileAsDataUrl(fallbackFile);
                                            return;
                                        }
                                        if (
                                            !attemptedFileUrlFallbackRef.current
                                            && fallbackFile
                                        ) {
                                            const fileUrl = getElectronFileUrl(fallbackFile);
                                            if (fileUrl) {
                                                attemptedFileUrlFallbackRef.current = true;
                                                setPreviewSource(fileUrl);
                                                setImageLoadStatus('Data/blob failed. Trying file URL fallback...');
                                                return;
                                            }
                                        }
                                        setPreviewSource(null);
                                        setImageLoadError('Unable to preview this image. Try PNG or JPEG.');
                                        setImageLoadStatus('Preview failed after all fallbacks.');
                                    }}
                                />
                                {imageSize && (
                                    <svg
                                        ref={svgRef}
                                        className="roi-canvas-overlay absolute inset-0"
                                        width="100%"
                                        height="100%"
                                        viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                                        onPointerDown={handleCanvasPointerDown}
                                        onPointerMove={handleCanvasPointerMove}
                                        onPointerUp={handleCanvasPointerUp}
                                        onPointerCancel={clearInteraction}
                                    >
                                        {activeKeys.map((regionKey) => {
                                            const bounds = getRegionBounds(draftRegions, screen, regionKey);
                                            const rect = boundsToRectPx(bounds, imageSize);
                                            const selected = regionKey === activeRegionKey;
                                            return (
                                                <g key={regionKey}>
                                                    <rect
                                                        x={rect.left}
                                                        y={rect.top}
                                                        width={Math.max(1, rect.right - rect.left)}
                                                        height={Math.max(1, rect.bottom - rect.top)}
                                                        fill="transparent"
                                                        stroke={REGION_COLORS[regionKey]}
                                                        strokeOpacity={selected ? 1 : 0.75}
                                                        strokeWidth={selected ? 3 : 2}
                                                        onPointerDown={(event) => handleBoxPointerDown(event, regionKey)}
                                                        className={selected ? 'cursor-move' : 'cursor-pointer'}
                                                    />
                                                </g>
                                            );
                                        })}
                                        {selectedHandles.map((handle) => (
                                            <rect
                                                key={handle.id}
                                                x={handle.x - 5}
                                                y={handle.y - 5}
                                                width={10}
                                                height={10}
                                                rx={2}
                                                ry={2}
                                                fill={REGION_COLORS[activeRegionKey]}
                                                stroke="#ffffff"
                                                strokeWidth={1}
                                                className={HANDLE_CURSOR[handle.id]}
                                                onPointerDown={(event) => handleResizePointerDown(event, activeRegionKey, handle.id)}
                                            />
                                        ))}
                                    </svg>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center px-6">
                                <div>
                                    <div className="text-label-lg font-bold">Load a full-resolution screenshot</div>
                                    <div className="text-label-sm opacity-60 mt-1">
                                        The image canvas stays at native resolution so ROI coordinates map exactly to OCR processing.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-full xl:w-[360px] xl:shrink-0 md3-surface-high rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-3 max-h-[40vh] xl:max-h-none">
                        <button
                            type="button"
                            onClick={openImagePicker}
                            className="md3-btn-tonal w-full inline-flex items-center justify-center gap-2 text-center"
                        >
                            <Upload size={14} />
                            Load Screenshot
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageFile}
                            aria-label="Load screenshot file"
                        />
                        <div className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface p-2 text-label-xs opacity-80 break-words">
                            {imageLoadStatus}
                        </div>
                        {imageLoadError && (
                            <div
                                role="alert"
                                className="rounded-control border border-danger-soft bg-danger-soft px-2 py-1.5 text-label-xs text-danger"
                            >
                                {imageLoadError}
                            </div>
                        )}
                        {imageLoadError && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="md3-btn-text w-full text-label-xs"
                            >
                                Use Browser Picker
                            </button>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setScreen('crewHub')}
                                className={`rounded-control px-2 py-1.5 text-label-sm font-bold ${screen === 'crewHub' ? 'md3-btn-filled' : 'md3-btn-outlined'}`}
                            >
                                Crew Hub
                            </button>
                            <button
                                type="button"
                                onClick={() => setScreen('mapScreen')}
                                className={`rounded-control px-2 py-1.5 text-label-sm font-bold ${screen === 'mapScreen' ? 'md3-btn-filled' : 'md3-btn-outlined'}`}
                            >
                                Tactical Map
                            </button>
                        </div>

                        <div className="text-label-sm font-bold uppercase opacity-60">Regions</div>
                        <div className="space-y-1 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                            {activeKeys.map((regionKey) => (
                                <button
                                    key={regionKey}
                                    type="button"
                                    onClick={() => setActiveRegionKey(regionKey)}
                                    className={`w-full text-left rounded-control px-2 py-1.5 text-label-sm ${activeRegionKey === regionKey ? 'bg-md-sys-primary/15 text-md-sys-primary font-bold' : 'hover:bg-md-sys-on-surface/5'}`}
                                >
                                    {REGION_LABELS[regionKey]}
                                </button>
                            ))}
                        </div>

                        <div className="md3-surface-low rounded-control border border-md-sys-outline/10 px-2 py-2 text-label-sm">
                            <div className="font-bold mb-1">{REGION_LABELS[activeRegionKey]}</div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-label-xs">
                                <span className="opacity-60">xMin</span>
                                <span>{toPercent(activeBounds.xMin)}</span>
                                <span className="opacity-60">xMax</span>
                                <span>{toPercent(activeBounds.xMax)}</span>
                                <span className="opacity-60">yMin</span>
                                <span>{toPercent(activeBounds.yMin)}</span>
                                <span className="opacity-60">yMax</span>
                                <span>{toPercent(activeBounds.yMax)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-auto">
                            <button type="button" onClick={resetSelectedRegion} className="md3-btn-outlined px-2 py-1.5 text-label-sm">
                                Reset Selected
                            </button>
                            <button type="button" onClick={resetCurrentScreen} className="md3-btn-outlined px-2 py-1.5 text-label-sm inline-flex items-center justify-center gap-1">
                                <RotateCcw size={12} />
                                Reset Screen
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={onClose} className="md3-btn-text">
                                Cancel
                            </button>
                            <button type="button" onClick={applyAndClose} className="md3-btn-filled">
                                Apply ROI
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default OcrRegionEditorModal;
