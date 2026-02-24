import React, { useState, useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

const cache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 300;

const getCached = (key: string): string | null => {
    if (!cache.has(key)) return null;
    const value = cache.get(key)!;
    cache.delete(key);
    cache.set(key, value);
    return value;
};

const setCached = (key: string, value: string) => {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (!oldestKey) break;
        cache.delete(oldestKey);
    }
};

const decodeFileUrl = (value: string): string => {
    const raw = String(value || '').trim();
    if (!/^file:/i.test(raw)) return raw;
    try {
        const parsed = new URL(raw);
        let pathname = decodeURIComponent(parsed.pathname || '');
        if (/^\/[a-z]:/i.test(pathname)) pathname = pathname.slice(1);
        if (parsed.hostname && parsed.hostname !== 'localhost') {
            return `\\\\${parsed.hostname}${pathname.replace(/\//g, '\\')}`;
        }
        return pathname.replace(/\//g, '\\');
    } catch {
        return raw.replace(/^file:\/+/i, '');
    }
};

const normalizeCacheKey = (value: string): string =>
    String(value || '').trim().replace(/[\\/]+/g, '\\').toLowerCase();

const buildSourceCandidates = (value: string): string[] => {
    const decoded = decodeFileUrl(value);
    const normalized = String(decoded || '').trim();
    const candidates = [
        normalized,
        normalized.replace(/\//g, '\\'),
        normalized.replace(/\\/g, '/'),
    ].filter(Boolean);
    const deduped: string[] = [];
    const seen = new Set<string>();
    candidates.forEach((candidate) => {
        const key = normalizeCacheKey(candidate);
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(candidate);
    });
    return deduped;
};

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
    const sourceCacheKey = normalizeCacheKey(src);
    const [dataUrl, setDataUrl] = useState<string | null>(() => {
        if (src.startsWith('data:')) return src;
        return getCached(sourceCacheKey);
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
        if (cache.has(sourceCacheKey)) {
            setDataUrl(getCached(sourceCacheKey));
            setFailed(false);
            return;
        }

        setDataUrl(null);
        setFailed(false);

        const api = getElectronAPI();
        if (!api) { setFailed(true); return; }

        const candidates = buildSourceCandidates(src);
        (async () => {
            for (const candidate of candidates) {
                try {
                    const base64 = await api.invoke('read-file-base64', candidate) as string | null;
                    if (!mountedRef.current) return;
                    if (!base64) continue;
                    const ext = candidate.split('.').pop()?.toLowerCase() || 'png';
                    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                        : ext === 'webp' ? 'image/webp'
                            : ext === 'bmp' ? 'image/bmp'
                                : 'image/png';
                    const url = `data:${mime};base64,${base64}`;
                    setCached(sourceCacheKey, url);
                    setCached(normalizeCacheKey(candidate), url);
                    setDataUrl(url);
                    setFailed(false);
                    return;
                } catch {
                    // continue to next candidate
                }
            }
            if (mountedRef.current) setFailed(true);
        })();
    }, [sourceCacheKey, src]);

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

