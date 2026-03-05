import type { Match } from '../../types';

/**
 * Renders selected matches to a canvas and triggers a PNG download.
 * This avoids html2canvas edge-cases in Electron and keeps exports deterministic.
 */
export async function exportMatchesAsImage(targetMatches: Match[]): Promise<void> {
    if (!Array.isArray(targetMatches) || targetMatches.length === 0) {
        throw new Error('No matches selected.');
    }

    const styles = getComputedStyle(document.body);
    const palette = {
        background: readCssColor(styles, '--md-sys-color-background', '#0f1115'),
        surface: readCssColor(styles, '--md-sys-color-surface', '#171b22'),
        outline: readCssColor(styles, '--md-sys-color-outline-variant', '#3a404a'),
        onSurface: readCssColor(styles, '--md-sys-color-on-surface', '#f0f3f8'),
        success: readCssColor(styles, '--color-success', '#22c55e'),
        danger: readCssColor(styles, '--color-danger', '#ef4444'),
        neutral: readCssColor(styles, '--md-sys-color-on-surface-variant', '#9aa3b3'),
    };

    const width = 600;
    const horizontalPadding = 40;
    const verticalPadding = 40;
    const gap = 20;
    const cardHeight = 140;
    const height = verticalPadding * 2 + targetMatches.length * cardHeight + Math.max(0, targetMatches.length - 1) * gap;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context is unavailable.');
    }
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    targetMatches.forEach((match, index) => {
        const cardX = horizontalPadding;
        const cardY = verticalPadding + index * (cardHeight + gap);
        const cardWidth = width - horizontalPadding * 2;
        drawMatchCard(ctx, match, {
            x: cardX,
            y: cardY,
            width: cardWidth,
            height: cardHeight,
            palette,
        });
    });

    const filename = `wildgate-export-${Date.now()}.png`;
    const blob = await canvasToPngBlob(canvas);
    if (blob) {
        downloadBlob(blob, filename);
        return;
    }

    if (typeof canvas.toDataURL === 'function') {
        const fallbackUrl = canvas.toDataURL('image/png');
        if (fallbackUrl && fallbackUrl !== 'data:,') {
            downloadDataUrl(fallbackUrl, filename);
            return;
        }
    }

    throw new Error('Failed to encode PNG.');
}

interface ExportPalette {
    background: string;
    surface: string;
    outline: string;
    onSurface: string;
    success: string;
    danger: string;
    neutral: string;
}

interface CardGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    palette: ExportPalette;
}

const drawMatchCard = (
    ctx: CanvasRenderingContext2D,
    match: Match,
    geometry: CardGeometry
) => {
    const { x, y, width, height, palette } = geometry;
    const accent = match.result === 'Win'
        ? palette.success
        : match.result === 'Loss'
            ? palette.danger
            : palette.neutral;

    fillRoundedRect(ctx, x, y, width, height, 20, palette.surface);
    strokeRoundedRect(ctx, x, y, width, height, 20, palette.outline, 1);

    ctx.fillStyle = accent;
    fillRoundedRect(ctx, x, y, 6, height, 3, accent);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + width - 30, y + height - 24, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const leftX = x + 24;
    const topY = y + 24;
    const rightX = x + width - 24;

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = palette.onSurface;
    ctx.font = '900 10px "Segoe UI", sans-serif';
    ctx.fillText('MISSION REPORT', leftX, topY);
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.font = '900 32px "Segoe UI", sans-serif';
    ctx.fillText(String(match.result || ''), leftX, topY + 36);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = palette.onSurface;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    const heroLine = `${(match.ship || 'Unknown').split('(')[0].trim()} - ${String(match.hero || 'Unknown').trim()}`;
    ctx.fillText(heroLine, leftX, topY + 56);
    ctx.restore();

    const teammates = Array.isArray(match.teammates) && match.teammates.length > 0
        ? `with ${match.teammates.join(', ')}`
        : '';
    if (teammates) {
        ctx.save();
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = palette.onSurface;
        ctx.font = '500 10px "Segoe UI", sans-serif';
        ctx.fillText(teammates, leftX, topY + 74, width - 220);
        ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = palette.onSurface;
    ctx.font = '900 26px "Segoe UI", sans-serif';
    const damage = String(match.damageTaken ?? 0);
    const damageWidth = ctx.measureText(damage).width;
    ctx.fillText(damage, rightX - damageWidth, topY + 32);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = palette.onSurface;
    ctx.font = '700 10px "Segoe UI", sans-serif';
    const damageLabel = 'DAMAGE TAKEN';
    const damageLabelWidth = ctx.measureText(damageLabel).width;
    ctx.fillText(damageLabel, rightX - damageLabelWidth, topY + 46);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = palette.onSurface;
    ctx.font = '700 14px "Consolas", "SFMono-Regular", monospace';
    const duration = String(match.time || '--:--');
    const durationWidth = ctx.measureText(duration).width;
    ctx.fillText(duration, rightX - durationWidth, topY + 72);
    ctx.restore();
};

const buildRoundedRectPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
};

const fillRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fillStyle: string
) => {
    buildRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
};

const strokeRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    strokeStyle: string,
    lineWidth: number
) => {
    buildRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
};

const readCssColor = (styles: CSSStyleDeclaration, cssVar: string, fallback: string) => {
    const value = styles.getPropertyValue(cssVar).trim();
    return value || fallback;
};

const canvasToPngBlob = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    if (typeof canvas.toBlob !== 'function') return null;
    return await new Promise<Blob | null>((resolve) => {
        let settled = false;
        const finish = (value: Blob | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        try {
            canvas.toBlob((blob) => finish(blob), 'image/png');
        } catch {
            finish(null);
            return;
        }
        window.setTimeout(() => finish(null), 1200);
    });
};

const clickDownloadLink = (link: HTMLAnchorElement) => {
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    clickDownloadLink(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    clickDownloadLink(link);
};
