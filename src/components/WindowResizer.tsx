import React, { useEffect, useState } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

export const WindowResizer: React.FC = () => {
    const [draggingDir, setDraggingDir] = useState<string | null>(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 }); // Mouse Screen Pos
    const [startBounds, setStartBounds] = useState({ x: 0, y: 0, width: 0, height: 0 }); // Window Screen Rect

    useEffect(() => {
        if (!draggingDir) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingDir) return;

            const deltaX = e.screenX - startPos.x;
            const deltaY = e.screenY - startPos.y;

            let newBounds = { ...startBounds };

            if (draggingDir.includes('e')) {
                newBounds.width = Math.max(400, startBounds.width + deltaX);
            }
            if (draggingDir.includes('s')) {
                newBounds.height = Math.max(300, startBounds.height + deltaY);
            }
            if (draggingDir.includes('w')) {
                // Dragging left changes X and Width.
                // If I drag left by -10px, X should decrease by 10, Width increase by 10
                newBounds.width = Math.max(400, startBounds.width - deltaX);
                newBounds.x = startBounds.x + (startBounds.width - newBounds.width);
            }
            if (draggingDir.includes('n')) {
                newBounds.height = Math.max(300, startBounds.height - deltaY);
                newBounds.y = startBounds.y + (startBounds.height - newBounds.height);
            }

            getElectronAPI()?.send('set-window-bounds', newBounds);
        };

        const handleMouseUp = () => {
            setDraggingDir(null);
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingDir, startPos, startBounds]);

    if (!getElectronAPI()) return null;

    const startDrag = async (dir: string, e: React.MouseEvent) => {
        e.preventDefault();
        setDraggingDir(dir);
        setStartPos({ x: e.screenX, y: e.screenY });

        // We need current bounds from main process or calculate?
        // Actually Electron exposes bounds via `window.getBounds()` in main, but renderer doesn't know easily.
        // We can ask main for bounds, or we can infer if we assume the window hasn't moved? No, that's risky.
        // We can get outerWidth/height and screenX/screenY from window object!
        setStartBounds({
            x: window.screenX,
            y: window.screenY,
            width: window.outerWidth,
            height: window.outerHeight
        });

        document.body.style.cursor = `${dir}-resize`;
    };

    const Handle = ({ dir, className }: { dir: string, className: string }) => (
        <div
            className={`fixed z-[99999] ${className}`} // extremely high z-index
            onMouseDown={(e) => startDrag(dir, e)}
            style={{ WebkitAppRegion: 'no-drag' } as any}
        />
    );

    return (
        <>
            {/* Edges */}
            <Handle dir="n" className="top-0 left-0 right-0 h-1 cursor-n-resize hover:bg-blue-500/50 transition-colors" />
            <Handle dir="s" className="bottom-0 left-0 right-0 h-1 cursor-s-resize hover:bg-blue-500/50 transition-colors" />
            <Handle dir="w" className="left-0 top-0 bottom-0 w-1 cursor-w-resize hover:bg-blue-500/50 transition-colors" />
            <Handle dir="e" className="right-0 top-0 bottom-0 w-1 cursor-e-resize hover:bg-blue-500/50 transition-colors" />

            {/* Corners */}
            <Handle dir="nw" className="top-0 left-0 w-3 h-3 cursor-nw-resize hover:bg-blue-500 transition-colors" />
            <Handle dir="ne" className="top-0 right-0 w-3 h-3 cursor-ne-resize hover:bg-blue-500 transition-colors" />
            <Handle dir="sw" className="bottom-0 left-0 w-3 h-3 cursor-sw-resize hover:bg-blue-500 transition-colors" />
            <Handle dir="se" className="bottom-0 right-0 w-3 h-3 cursor-se-resize hover:bg-blue-500 transition-colors" />

            {/* Visible Corner Icon? Optional. The user liked the bottom-right grip. We can keep it or make it part of SE handle */}
            <div
                className="fixed bottom-0 right-0 w-4 h-4 cursor-se-resize z-[99998] pointer-events-none opacity-50"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute bottom-1 right-1 text-md-sys-on-surface/40">
                    <path d="M21 15v6" />
                    <path d="M15 21h6" />
                    <path d="M21 3l-9 9" />
                    <path d="M3 21l9-9" />
                </svg>
            </div>
        </>
    );
};

