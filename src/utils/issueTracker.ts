/**
 * @module issueTracker
 * Internal error/bug tracker. There was previously no way for an error to
 * reach the user at all beyond an ad-hoc `setToast()` call some call sites
 * remembered to add - most `Logger.error()` calls were (and still are, for
 * routine/expected failures) silent: logged to the console/log file only.
 *
 * `reportIssue()` is the tracker's entry point: it always logs via `Logger`
 * (so the on-disk log / "Copy Logs" flow keeps working exactly as before)
 * AND pushes a severity-ranked notification, so the issue actually surfaces
 * in the Notification Center (and, for severity >= 3, as a toast) instead of
 * only ever existing in a log file nobody is looking at.
 *
 * Severity scale (1 lowest - 5 worst), matching what NotificationCenter
 * renders as a badge:
 *   5 - Critical: crash, data loss/corruption risk, feature totally broken.
 *   4 - High: an operation failed and the user's action was lost/not saved.
 *   3 - Medium: a fallback kicked in, but something didn't work as expected.
 *   2 - Low: minor/cosmetic issue, self-heals or has no real consequence.
 *   1 - Info: worth a record, not really a "problem" (e.g. a retried request).
 *
 * Deliberately NOT imported by low-level modules like `storage.ts` - this
 * file imports `useAppStore`, and `useAppStore` imports `storage.ts`, so
 * importing this from `storage.ts` would create a circular import. Call it
 * from React components/hooks and app-boot code instead.
 */
import Logger from './logger';
import { useAppStore } from '../store/useAppStore';
import type {
    IssueSeverity,
    NotificationAction,
    NotificationDeepLink,
    NotificationKind,
    NotificationSource,
} from '../store/slices/createUISlice';

export type { IssueSeverity };

export interface ReportIssueOptions {
    /** Log category (e.g. 'Storage', 'Submission') - groups related issues in the log file. */
    category: string;
    /** User-facing message. Keep it plain-language; put technical detail in `error`/`extra`. */
    message: string;
    /** 1 (lowest) - 5 (worst). See module doc for the scale. */
    severity: IssueSeverity;
    /** The underlying error/exception, if any - goes to the log entry, not the notification text. */
    error?: unknown;
    extra?: Record<string, unknown>;
    source?: NotificationSource;
    action?: NotificationAction;
    deepLink?: NotificationDeepLink;
    /** Show as a transient toast in addition to the notification center. Defaults to true for severity >= 3. */
    popup?: boolean;
}

const notificationTypeForSeverity = (severity: IssueSeverity): NotificationKind => {
    if (severity >= 4) return 'error';
    if (severity === 3) return 'warning';
    return 'info';
};

/** Logs and surfaces an issue as a severity-ranked, user-visible notification. */
export const reportIssue = (options: ReportIssueOptions): void => {
    const { category, message, severity, error, extra } = options;
    if (severity >= 4) {
        Logger.error(category, message, extra ? { error, ...extra } : error);
    } else {
        Logger.warn(category, message, extra ? { error, ...extra } : error);
    }
    try {
        useAppStore.getState().pushNotification({
            message,
            type: notificationTypeForSeverity(severity),
            severity,
            source: options.source ?? 'system',
            action: options.action,
            deepLink: options.deepLink,
            popup: options.popup ?? severity >= 3,
        });
    } catch (notifyError) {
        // Store not ready yet (very early boot) - the Logger call above
        // already captured the issue, so losing the notification here is
        // non-fatal, just log it for visibility in the log file.
        Logger.warn('IssueTracker', 'Failed to push issue notification', notifyError);
    }
};

/**
 * Convenience wrapper for the common "caught an exception, this is a
 * tracked Sev-5 issue" case (uncaught errors, unhandled rejections, React
 * render crashes). Uses `Logger.captureException` so the structured
 * {message, stack, action, extra, appVersion} report and immediate log
 * flush-to-disk behavior is unchanged from before this module existed.
 */
export const reportCriticalException = (
    error: unknown,
    context?: { category?: string; message?: string; action?: string; extra?: Record<string, unknown> }
): void => {
    const report = Logger.captureException(error, context);
    try {
        useAppStore.getState().pushNotification({
            message: context?.message || `Unexpected error: ${report.message}`,
            type: 'error',
            severity: 5,
            source: 'system',
            popup: true,
        });
    } catch (notifyError) {
        Logger.warn('IssueTracker', 'Failed to push critical issue notification', notifyError);
    }
};
