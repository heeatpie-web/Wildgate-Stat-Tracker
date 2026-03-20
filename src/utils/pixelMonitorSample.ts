export interface PixelMonitorSampleData {
    avgR: number;
    avgG: number;
    avgB: number;
}

export interface PixelMonitorSampleAbsoluteRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PixelMonitorSampleClientRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface PixelMonitorSampleMeta {
    source?: string;
    absoluteRegion?: PixelMonitorSampleAbsoluteRegion;
    clientRect?: PixelMonitorSampleClientRect;
    geometryAgeMs?: number | null;
    processName?: string;
    processId?: number | null;
    windowHandle?: number | null;
    windowTitle?: string;
}

export interface PixelMonitorSampleSuccess {
    success: true;
    data: PixelMonitorSampleData;
    meta?: PixelMonitorSampleMeta;
}

export interface PixelMonitorSampleError {
    success: false;
    error: string;
    meta?: PixelMonitorSampleMeta;
}

export type PixelMonitorSampleResult = PixelMonitorSampleSuccess | PixelMonitorSampleError;

const isFiniteChannel = (value: unknown): value is number => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue);
};

export const normalizePixelMonitorSampleData = (value: unknown): PixelMonitorSampleData | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (!isFiniteChannel(record.avgR) || !isFiniteChannel(record.avgG) || !isFiniteChannel(record.avgB)) {
        return null;
    }
    return {
        avgR: Math.round(Number(record.avgR)),
        avgG: Math.round(Number(record.avgG)),
        avgB: Math.round(Number(record.avgB)),
    };
};

const normalizeRectValue = (
    value: unknown,
    requiredKeys: Array<'x' | 'y' | 'width' | 'height'> | Array<'left' | 'top' | 'width' | 'height'>,
) => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const normalized = Object.fromEntries(requiredKeys.map((key) => {
        const numericValue = Number(record[key]);
        return [key, Number.isFinite(numericValue) ? Math.round(numericValue) : null];
    }));
    return Object.values(normalized).every((entry) => entry != null) ? normalized : null;
};

export const normalizePixelMonitorSampleMeta = (value: unknown): PixelMonitorSampleMeta | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const absoluteRegion = normalizeRectValue(
        record.absoluteRegion,
        ['x', 'y', 'width', 'height'],
    ) as PixelMonitorSampleAbsoluteRegion | null;
    const clientRect = normalizeRectValue(
        record.clientRect,
        ['left', 'top', 'width', 'height'],
    ) as PixelMonitorSampleClientRect | null;
    const geometryAgeMs = record.geometryAgeMs == null
        ? undefined
        : (Number.isFinite(Number(record.geometryAgeMs)) ? Math.round(Number(record.geometryAgeMs)) : null);
    const processId = record.processId == null
        ? undefined
        : (Number.isFinite(Number(record.processId)) ? Math.round(Number(record.processId)) : null);
    const windowHandle = record.windowHandle == null
        ? undefined
        : (Number.isFinite(Number(record.windowHandle)) ? Math.round(Number(record.windowHandle)) : null);
    const metaEntries = [
        ['source', typeof record.source === 'string' && record.source.trim() ? record.source : undefined],
        ['absoluteRegion', absoluteRegion ?? undefined],
        ['clientRect', clientRect ?? undefined],
        ['geometryAgeMs', geometryAgeMs],
        ['processName', typeof record.processName === 'string' && record.processName.trim() ? record.processName : undefined],
        ['processId', processId],
        ['windowHandle', windowHandle],
        ['windowTitle', typeof record.windowTitle === 'string' ? record.windowTitle : undefined],
    ].filter(([, entry]) => entry !== undefined);
    return metaEntries.length > 0
        ? Object.fromEntries(metaEntries) as PixelMonitorSampleMeta
        : undefined;
};

export const normalizePixelMonitorSampleResult = (value: unknown): PixelMonitorSampleResult => {
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const meta = normalizePixelMonitorSampleMeta(record.meta);

        if (record.success === true) {
            const data = normalizePixelMonitorSampleData(record.data);
            if (data) return { success: true, data, meta };
            return { success: false, error: 'Pixel monitor sample returned invalid data', meta };
        }

        if (record.success === false) {
            return {
                success: false,
                error: typeof record.error === 'string' && record.error.trim()
                    ? record.error
                    : 'Pixel monitor sample failed',
                meta,
            };
        }

        const data = normalizePixelMonitorSampleData(record);
        if (data) return { success: true, data, meta };
    }

    return { success: false, error: 'Pixel monitor sample failed' };
};

export const extractPixelMonitorSampleData = (value: unknown): PixelMonitorSampleData | null => {
    const result = normalizePixelMonitorSampleResult(value);
    return result.success ? result.data : null;
};
