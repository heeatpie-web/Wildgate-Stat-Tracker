import React, { useMemo, useState } from 'react';
import type { OCRWord } from '../utils/ocr/ocrTypes';

export interface OcrBoundingBoxOverlayProps {
  imageUrl: string;
  boundingBoxes: OCRWord[];
  imageWidth: number;
  imageHeight: number;
  onImageClick?: () => void;
}

interface BoxPalette {
  stroke: string;
  fill: string;
}

const HIGH_CONFIDENCE_PALETTE: BoxPalette = {
  stroke: '#4CAF50',
  fill: 'rgba(76, 175, 80, 0.18)',
};

const MEDIUM_CONFIDENCE_PALETTE: BoxPalette = {
  stroke: '#FF9800',
  fill: 'rgba(255, 152, 0, 0.2)',
};

const LOW_CONFIDENCE_PALETTE: BoxPalette = {
  stroke: '#F44336',
  fill: 'rgba(244, 67, 54, 0.2)',
};

const toPalette = (confidence: number): BoxPalette => {
  if (confidence >= 80) return HIGH_CONFIDENCE_PALETTE;
  if (confidence >= 40) return MEDIUM_CONFIDENCE_PALETTE;
  return LOW_CONFIDENCE_PALETTE;
};

const toBoxArea = (box: OCRWord['bbox']): number => Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);

export const OcrBoundingBoxOverlay: React.FC<OcrBoundingBoxOverlayProps> = ({
  imageUrl,
  boundingBoxes,
  imageWidth,
  imageHeight,
  onImageClick,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const orderedBoxes = useMemo(
    () => [...boundingBoxes].sort((a, b) => toBoxArea(b.bbox) - toBoxArea(a.bbox)),
    [boundingBoxes]
  );

  const selected = selectedIndex != null ? orderedBoxes[selectedIndex] : null;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
      <div className="relative inline-block max-w-full max-h-full">
        <img
          src={imageUrl}
          className="object-contain max-w-full max-h-full select-none cursor-zoom-in"
          alt="OCR Debug Preview"
          draggable={false}
          onClick={onImageClick}
        />
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${Math.max(1, imageWidth)} ${Math.max(1, imageHeight)}`}
          role="img"
          aria-label={`OCR bounding boxes overlay with ${orderedBoxes.length} words`}
        >
          {orderedBoxes.map((box, idx) => {
            const width = Math.max(1, box.bbox.x1 - box.bbox.x0);
            const height = Math.max(1, box.bbox.y1 - box.bbox.y0);
            const isSelected = selectedIndex === idx;
            const palette = toPalette(box.confidence);
            const confidenceLabel = `${Math.round(box.confidence)}%`;
            const textLabel = box.text || '(blank)';
            return (
              <rect
                key={`${idx}-${box.bbox.x0}-${box.bbox.y0}-${box.bbox.x1}-${box.bbox.y1}`}
                x={box.bbox.x0}
                y={box.bbox.y0}
                width={width}
                height={height}
                style={{
                  stroke: palette.stroke,
                  fill: palette.fill,
                  strokeWidth: isSelected ? 2 : 1,
                  cursor: 'pointer',
                }}
                role="button"
                tabIndex={0}
                aria-label={`OCR box ${idx + 1}: ${textLabel}, confidence ${confidenceLabel}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(idx);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedIndex(idx);
                  }
                }}
              >
                <title>{`${textLabel} (${confidenceLabel})`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      {selected && (
        <div className="md3-card md3-surface-high rounded-control border border-md-sys-outline/20 px-3 py-2 text-label-sm w-full">
          <div className="font-bold uppercase opacity-60">Selected Box</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <span className="opacity-60">Text:</span> {selected.text || '(blank)'}
            </span>
            <span>
              <span className="opacity-60">Confidence:</span> {Math.round(selected.confidence)}%
            </span>
            <span className="font-mono opacity-60">
              ({Math.round(selected.bbox.x0)}, {Math.round(selected.bbox.y0)}) - ({Math.round(selected.bbox.x1)}, {Math.round(selected.bbox.y1)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OcrBoundingBoxOverlay;
