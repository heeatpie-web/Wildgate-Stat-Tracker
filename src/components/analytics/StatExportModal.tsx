import React, { useRef, useState, useEffect } from 'react';
import { Pin, X, Download } from 'lucide-react';
import { TILE_CATALOG, ExportTileData } from './exportTileCatalog';
import { exportTilesAsImage } from './analyticsExport';

interface StatExportModalProps {
  pinnedIds: string[];
  analyticsData: ExportTileData;
  onClose: () => void;
  onClearPins: () => void;
}

export default function StatExportModal({
  pinnedIds,
  analyticsData,
  onClose,
  onClearPins,
}: StatExportModalProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDownload = async () => {
    if (!gridRef.current) return;
    setExporting(true);
    try {
      await exportTilesAsImage(gridRef.current);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleClearPins = () => {
    onClearPins();
    onClose();
  };

  const pinnedTiles = pinnedIds
    .map((id) => TILE_CATALOG.find((t) => t.id === id))
    .filter((t): t is (typeof TILE_CATALOG)[number] => t !== undefined);

  return (
    <div
      className="fixed inset-0 z-50 bg-scrim-80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="mg-surface-high rounded-modal p-6 w-full max-w-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-md-sys-primary">
            <Pin size={18} />
            <span className="text-body font-semibold">Export Tiles</span>
          </div>
          <button className="md3-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Subheader */}
        <div className="text-label-sm text-md-sys-on-surface/60">
          {pinnedIds.length} {pinnedIds.length === 1 ? 'tile' : 'tiles'} selected
        </div>

        {/* Tile Grid or Empty State */}
        {pinnedTiles.length === 0 ? (
          <div className="text-body text-md-sys-on-surface/60 py-8 text-center">
            No tiles pinned. Close and pin tiles using the 📌 button.
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-3"
          >
            {pinnedTiles.map((tile) => (
              <div
                key={tile.id}
                className="md3-card rounded-card p-4 min-h-[200px] flex flex-col gap-2"
              >
                <div className="flex items-center gap-1.5 text-md-sys-on-surface/60">
                  {tile.icon}
                  <span className="text-label-sm font-medium">{tile.title}</span>
                </div>
                <div className="flex-1">
                  {tile.render(analyticsData)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            className="text-label-sm text-danger hover:underline"
            onClick={handleClearPins}
          >
            Clear pins
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-medium disabled:opacity-50 ${exporting ? 'animate-pulse' : ''}`}
            onClick={handleDownload}
            disabled={exporting || pinnedTiles.length === 0}
          >
            <Download size={16} />
            {exporting ? 'Exporting…' : 'Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
