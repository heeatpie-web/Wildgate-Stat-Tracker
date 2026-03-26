import html2canvas from 'html2canvas';

async function exportAsImage(containerEl: HTMLElement | null, filename: string): Promise<boolean> {
    if (!containerEl) return false;
    const styles = getComputedStyle(document.body);
    const bg = styles.getPropertyValue('--md-sys-color-background').trim() || styles.backgroundColor || 'rgb(24, 26, 34)';
    try {
        const canvas = await html2canvas(containerEl, {
            backgroundColor: bg,
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: containerEl.scrollWidth,
            windowHeight: containerEl.scrollHeight,
        });
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    } catch (e) {
        console.error('Analytics export failed:', e);
        return false;
    }
}

export function exportAnalyticsAsImage(containerEl: HTMLElement | null): Promise<boolean> {
    return exportAsImage(containerEl, `wildgate-analytics-${new Date().toISOString().slice(0, 10)}.png`);
}

export function exportTilesAsImage(containerEl: HTMLElement | null): Promise<boolean> {
    return exportAsImage(containerEl, `wildgate-stats-${new Date().toISOString().slice(0, 10)}.png`);
}
