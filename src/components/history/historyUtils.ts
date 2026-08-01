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

/** Row background shading by match outcome (Step 20.5: full row width, at-a-glance win/loss) */
export const getRowBg = (m: Match): string => {
    if (m.result === 'Win') return 'bg-success/15 hover:bg-success/20';
    if (m.result === 'Loss') return 'bg-danger/15 hover:bg-danger/20';
    if (m.result === 'Draw') return 'bg-warning/15 hover:bg-warning/20';
    if (m.result === 'Ongoing') return 'bg-info/15 hover:bg-info/20';
    return 'bg-neutral/15 hover:bg-neutral/20';
};
