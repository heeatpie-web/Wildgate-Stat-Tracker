import Logger from './logger';

interface RuntimeSampleBucket {
    count: number;
    totalMs: number;
    maxMs: number;
    samples: number[];
}

interface RuntimeSampleOptions {
    logEvery?: number;
    sampleSize?: number;
}

const DEFAULT_LOG_EVERY = 100;
const DEFAULT_SAMPLE_SIZE = 128;

const runtimeSampleBuckets = new Map<string, RuntimeSampleBucket>();

const nowMs = (): number => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const roundMs = (value: number): number => Math.round(value * 1000) / 1000;

const getPercentile = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const clampedPercentile = Math.max(0, Math.min(1, percentile));
    const index = Math.min(
        values.length - 1,
        Math.max(0, Math.ceil((values.length * clampedPercentile)) - 1)
    );
    return values[index];
};

export const recordRuntimeSample = (
    category: string,
    label: string,
    durationMs: number,
    options: RuntimeSampleOptions = {},
): void => {
    const logEvery = Math.max(1, Math.floor(options.logEvery || DEFAULT_LOG_EVERY));
    const sampleSize = Math.max(1, Math.floor(options.sampleSize || DEFAULT_SAMPLE_SIZE));
    const bucketKey = `${category}:${label}`;
    const bucket = runtimeSampleBuckets.get(bucketKey) || {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        samples: [],
    };

    bucket.count += 1;
    bucket.totalMs += durationMs;
    bucket.maxMs = Math.max(bucket.maxMs, durationMs);
    bucket.samples.push(durationMs);
    if (bucket.samples.length > sampleSize) {
        bucket.samples.shift();
    }
    runtimeSampleBuckets.set(bucketKey, bucket);

    if (bucket.count % logEvery !== 0) return;

    const sortedSamples = [...bucket.samples].sort((left, right) => left - right);
    Logger.info(category, `Runtime sample: ${label}`, {
        callCount: bucket.count,
        sampleCount: sortedSamples.length,
        latestMs: roundMs(durationMs),
        avgMs: roundMs(bucket.totalMs / bucket.count),
        p50Ms: roundMs(getPercentile(sortedSamples, 0.5)),
        p95Ms: roundMs(getPercentile(sortedSamples, 0.95)),
        maxMs: roundMs(bucket.maxMs),
    });
};

export const measureSyncRuntime = <T>(
    category: string,
    label: string,
    fn: () => T,
    options?: RuntimeSampleOptions,
): T => {
    const start = nowMs();
    try {
        return fn();
    } finally {
        recordRuntimeSample(category, label, nowMs() - start, options);
    }
};
