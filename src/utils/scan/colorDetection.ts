/**
 * @module scan/colorDetection
 * RGB-to-team-color classification via HSL hue mapping.
 * Used to determine player team affiliation from screenshot pixel data.
 */
import type { TeamColor, OcrCalibration } from './types';

type ColorSampleOptions = Partial<Pick<OcrCalibration, 'saturationMin' | 'luminanceMin'>>;

export const getTeamColor = (r: number, g: number, b: number, options: ColorSampleOptions = {}): TeamColor => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lum = (max + min) / 2;
    const luminanceMin = options.luminanceMin ?? 30;

    if (delta < 20) return 'Unknown';
    if (lum < luminanceMin) return 'Unknown';

    let hue = 0;
    if (delta === 0) hue = 0;
    else if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;

    if (hue >= 340 || hue < 15) return 'Red';
    if (hue >= 15 && hue < 45) return 'Orange';
    if (hue >= 45 && hue < 75) return 'Yellow';
    if (hue >= 75 && hue < 150) return 'Green';
    if (hue >= 150 && hue < 210) return 'Cyan';
    if (hue >= 210 && hue < 270) return 'Blue';
    if (hue >= 270 && hue < 340) return 'Purple';

    return 'Unknown';
};

export const sampleRegion = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    options: ColorSampleOptions = {}
): TeamColor => {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > ctx.canvas.width) w = ctx.canvas.width - x;
    if (y + h > ctx.canvas.height) h = ctx.canvas.height - y;

    if (w <= 0 || h <= 0) return 'Unknown';

    try {
        const data = ctx.getImageData(x, y, w, h).data;
        let bestColor: TeamColor = 'Unknown';
        let maxSaturation = 0;
        const saturationMin = options.saturationMin ?? 35;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max - min;

            if (saturation > saturationMin) {
                const c = getTeamColor(r, g, b, options);
                if (c !== 'Unknown') {
                    if (saturation > maxSaturation) {
                        maxSaturation = saturation;
                        bestColor = c;
                    }
                }
            }
        }
        return bestColor;
    } catch (e) {
        return 'Unknown';
    }
};
