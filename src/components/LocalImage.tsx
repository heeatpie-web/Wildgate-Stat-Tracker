import React, { useState, useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

const cache = new Map<string, string>();

interface LocalImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src: string;
    fallback?: React.ReactNode;
}

/**
 * Loads local filesystem images via Electron IPC (read-file-base64),
 * bypassing browser security restrictions on file:// URLs.
 * Caches loaded data URLs to avoid re-reading.
 */
export const LocalImage: React.FC<LocalImageProps> = ({ src, fallback, ...imgProps }) => {
    const [dataUrl, setDataUrl] = useState<string | null>(() => {
        if (src.startsWith('data:')) return src;
        return cache.get(src) || null;
    });
    const [failed, setFailed] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (src.startsWith('data:')) {
            setDataUrl(src);
            setFailed(false);
            return;
        }
        if (cache.has(src)) {
            setDataUrl(cache.get(src)!);
            setFailed(false);
            return;
        }

        setDataUrl(null);
        setFailed(false);

        const api = getElectronAPI();
        if (!api) { setFailed(true); return; }

        api.invoke('read-file-base64', src).then((base64: string | null) => {
            if (!mountedRef.current) return;
            if (!base64) { setFailed(true); return; }
            const ext = src.split('.').pop()?.toLowerCase() || 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'webp' ? 'image/webp'
                : ext === 'bmp' ? 'image/bmp'
                : 'image/png';
            const url = `data:${mime};base64,${base64}`;
            cache.set(src, url);
            setDataUrl(url);
        }).catch(() => {
            if (mountedRef.current) setFailed(true);
        });
    }, [src]);

    if (failed) {
        return fallback ? <>{fallback}</> : (
            <div className="flex flex-col items-center justify-center w-full h-full opacity-30">
                <span className="text-label-sm">Image unavailable</span>
            </div>
        );
    }

    if (!dataUrl) {
        return (
            <div className="flex items-center justify-center w-full h-full opacity-20">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return <img src={dataUrl} {...imgProps} />;
};

