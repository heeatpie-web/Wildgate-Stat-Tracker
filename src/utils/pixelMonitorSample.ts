export interface PixelMonitorSampleData {
    avgR: number;
    avgG: number;
    avgB: number;
}

export interface PixelMonitorSampleSuccess {
    success: true;
    data: PixelMonitorSampleData;
}

export interface PixelMonitorSampleError {
    success: false;
    error: string;
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

export const normalizePixelMonitorSampleResult = (value: unknown): PixelMonitorSampleResult => {
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;

        if (record.success === true) {
            const data = normalizePixelMonitorSampleData(record.data);
            if (data) return { success: true, data };
            return { success: false, error: 'Pixel monitor sample returned invalid data' };
        }

        if (record.success === false) {
            return {
                success: false,
                error: typeof record.error === 'string' && record.error.trim()
                    ? record.error
                    : 'Pixel monitor sample failed',
            };
        }

        const data = normalizePixelMonitorSampleData(record);
        if (data) return { success: true, data };
    }

    return { success: false, error: 'Pixel monitor sample failed' };
};

export const extractPixelMonitorSampleData = (value: unknown): PixelMonitorSampleData | null => {
    const result = normalizePixelMonitorSampleResult(value);
    return result.success ? result.data : null;
};
