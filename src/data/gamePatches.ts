export interface GamePatch {
    version: string;       // e.g. "1.4.2" or "Patch 7"
    date: string;          // ISO date string e.g. "2026-02-28"
    era?: string;          // which era this patch belongs to e.g. "baseline" | "expansion"
    title: string;         // short name e.g. "Balance Patch: Hunter Nerf"
    description: string;   // 1-3 sentence summary of what changed
    highlights?: string[]; // optional bullet points
}

export const GAME_PATCHES: GamePatch[] = [
    // TODO: populate with real patch data — placeholder only
    {
        version: '1.0',
        date: '2026-01-01',
        era: 'baseline',
        title: 'Launch',
        description: 'Game launch. Baseline meta established.',
    },
    // TODO: add the recent big game patch here once details are provided.
];

