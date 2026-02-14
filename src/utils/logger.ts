/**
 * Logger - Structured logging with performance tracking
 * Supports file persistence in Electron environment
 */

import { getElectronAPI } from './electronAPI';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
    duration?: number;
}

interface PerformanceTimer {
    start: number;
    label: string;
    category: string;
}

const LOG_BUFFER: LogEntry[] = [];
const MAX_BUFFER_SIZE = 500;
const activeTimers: Map<string, PerformanceTimer> = new Map();
let lastPersistedIndex = 0;

const getIPC = () => getElectronAPI();

const formatEntry = (entry: LogEntry): string => {
    const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
    if (entry.duration !== undefined) {
        return `${base} (${entry.duration.toFixed(2)}ms)`;
    }
    return base;
};

const addEntry = (entry: LogEntry) => {
    LOG_BUFFER.push(entry);
    if (LOG_BUFFER.length > MAX_BUFFER_SIZE) {
        LOG_BUFFER.shift();
    }

    // Console output with styling
    const styles: Record<LogLevel, string> = {
        debug: 'color: gray',
        info: 'color: deepskyblue',
        warn: 'color: orange',
        error: 'color: tomato; font-weight: bold'
    };

    const formatted = formatEntry(entry);
    console.log(`%c${formatted}`, styles[entry.level], entry.data || '');

    // Persist to file periodically (every 50 entries or on error)
    if (entry.level === 'error' || LOG_BUFFER.length % 50 === 0) {
        persistLogs();
    }
};

const persistLogs = async () => {
    const ipc = getIPC();
    if (!ipc) return;

    try {
        const newEntries = LOG_BUFFER.slice(lastPersistedIndex);
        if (newEntries.length === 0) return;
        await ipc.invoke('persist-logs', newEntries.map(formatEntry).join('\n'));
        lastPersistedIndex = LOG_BUFFER.length;
    } catch (e) {
        // Silent fail - logging shouldn't break the app
    }
};

export const Logger = {
    debug: (category: string, message: string, data?: any) => {
        addEntry({
            timestamp: new Date().toISOString(),
            level: 'debug',
            category,
            message,
            data
        });
    },

    info: (category: string, message: string, data?: any) => {
        addEntry({
            timestamp: new Date().toISOString(),
            level: 'info',
            category,
            message,
            data
        });
    },

    warn: (category: string, message: string, data?: any) => {
        addEntry({
            timestamp: new Date().toISOString(),
            level: 'warn',
            category,
            message,
            data
        });
    },

    error: (category: string, message: string, error?: any) => {
        addEntry({
            timestamp: new Date().toISOString(),
            level: 'error',
            category,
            message,
            data: error instanceof Error ? { message: error.message, stack: error.stack } : error
        });
    },

    // Performance timing
    startTimer: (id: string, category: string, label: string) => {
        activeTimers.set(id, {
            start: performance.now(),
            label,
            category
        });
    },

    endTimer: (id: string): number | null => {
        const timer = activeTimers.get(id);
        if (!timer) return null;

        const duration = performance.now() - timer.start;
        activeTimers.delete(id);

        addEntry({
            timestamp: new Date().toISOString(),
            level: 'info',
            category: timer.category,
            message: `⏱ ${timer.label}`,
            duration
        });

        return duration;
    },

    // Get log buffer for debugging
    getBuffer: () => [...LOG_BUFFER],

    // Export logs
    exportLogs: (): string => {
        return LOG_BUFFER.map(formatEntry).join('\n');
    },

    /**
     * Captures an exception with full context for diagnostics.
     * Logs the error, persists immediately, and returns a structured report.
     */
    captureException: (error: unknown, context?: { category?: string; action?: string; extra?: Record<string, unknown> }) => {
        const category = context?.category || 'Uncaught';
        const err = error instanceof Error ? error : new Error(String(error));
        const report = {
            message: err.message,
            stack: err.stack,
            action: context?.action,
            extra: context?.extra,
            timestamp: new Date().toISOString(),
            appVersion: (window as any).__APP_VERSION__ || 'unknown',
        };
        addEntry({
            timestamp: report.timestamp,
            level: 'error',
            category,
            message: `EXCEPTION: ${err.message}${context?.action ? ` [action: ${context.action}]` : ''}`,
            data: report
        });
        // Force immediate persistence
        persistLogs();
        return report;
    },

    // Wrap async function with timing
    timed: async <T>(category: string, label: string, fn: () => Promise<T>): Promise<T> => {
        const id = `${category}-${label}-${Date.now()}`;
        Logger.startTimer(id, category, label);
        try {
            const result = await fn();
            Logger.endTimer(id);
            return result;
        } catch (e) {
            Logger.endTimer(id);
            throw e;
        }
    }
};

export default Logger;
