import type { Match } from '../../types';

export const timeAgo = (timestamp: number, nowMs: number): string => {
    if (!timestamp) return '';
    const seconds = Math.floor((nowMs - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};

export const formatDayHeader = (timestamp: number): string => {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
};

/**
 * Row background shading by match outcome (Step 20.5: full row width, at-a-glance win/loss).
 * Uses the hand-authored `-soft` classes, not Tailwind's `bg-x/NN` opacity-modifier syntax:
 * these theme colors resolve through CSS custom properties (var(--color-success), etc.), and
 * Tailwind can't decompose a var() reference to inject an alpha channel, so `bg-success/15`
 * silently compiles to nothing. The `:hover` intensification lives in index.css, keyed off
 * `[data-result]` on the row, since the same limitation blocks a `hover:` variant here too.
 */
export const getRowBg = (m: Match): string => {
    if (m.result === 'Win') return 'bg-success-soft';
    if (m.result === 'Loss') return 'bg-danger-soft';
    if (m.result === 'Draw') return 'bg-warning-soft';
    if (m.result === 'Ongoing') return 'bg-info-soft';
    return 'bg-neutral-soft';
};
