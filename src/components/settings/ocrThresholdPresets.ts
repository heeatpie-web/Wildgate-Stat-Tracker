export const DEFAULT_OCR_BEST_GUESS_THRESHOLDS = {
    cloud: { player: 80, mod: 82, ship: 62 },
    merged: { player: 78, mod: 80, ship: 60 },
    local: { player: 84, mod: 87, ship: 68 },
    lowConfidenceBump: 4,
} as const;

export type SensitivityLevel = 'strict' | 'balanced' | 'lenient';

export interface OcrThresholdSet {
    cloud: { player: number; mod: number; ship: number };
    merged: { player: number; mod: number; ship: number };
    local: { player: number; mod: number; ship: number };
    lowConfidenceBump: number;
}

const PRESETS: Record<SensitivityLevel, OcrThresholdSet> = {
    strict: {
        cloud: { player: 84, mod: 86, ship: 70 },
        merged: { player: 82, mod: 84, ship: 68 },
        local: { player: 88, mod: 90, ship: 72 },
        lowConfidenceBump: 2,
    },
    balanced: {
        cloud: { player: 80, mod: 82, ship: 62 },
        merged: { player: 78, mod: 80, ship: 60 },
        local: { player: 84, mod: 87, ship: 68 },
        lowConfidenceBump: 4,
    },
    lenient: {
        cloud: { player: 70, mod: 72, ship: 56 },
        merged: { player: 68, mod: 70, ship: 54 },
        local: { player: 74, mod: 76, ship: 58 },
        lowConfidenceBump: 8,
    },
};

export const getPreset = (level: SensitivityLevel): OcrThresholdSet => ({ ...PRESETS[level] });

export const detectSensitivityLevel = (thresholds: OcrThresholdSet): SensitivityLevel => {
    const avgPlayer = Math.round(
        (thresholds.cloud.player + thresholds.merged.player + thresholds.local.player) / 3
    );
    if (avgPlayer >= 82) return 'strict';
    if (avgPlayer <= 73) return 'lenient';
    return 'balanced';
};
