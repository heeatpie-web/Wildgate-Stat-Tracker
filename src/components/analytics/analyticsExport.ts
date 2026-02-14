import html2canvas from 'html2canvas';

/**
 * Captures the analytics dashboard content as a PNG image and triggers a download.
 * Targets the closest scrollable analytics container from the trigger element.
 */
export async function exportAnalyticsAsImage(containerEl: HTMLElement | null): Promise<boolean> {
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
        link.download = `wildgate-analytics-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        return true;
    } catch (e) {
        console.error('Analytics export failed:', e);
        return false;
    }
}
