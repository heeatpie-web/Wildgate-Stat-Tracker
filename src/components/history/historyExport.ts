import html2canvas from 'html2canvas';
import type { Match } from '../../types';

/**
 * Renders selected matches as styled cards into an off-screen container,
 * captures them with html2canvas, and triggers a JPG download.
 */
export async function exportMatchesAsImage(targetMatches: Match[]): Promise<void> {
    const styles = getComputedStyle(document.body);
    const mdBackground = styles.getPropertyValue('--md-sys-color-background').trim() || 'var(--md-sys-color-background)';
    const mdSurface = styles.getPropertyValue('--md-sys-color-surface').trim() || 'var(--md-sys-color-surface)';
    const mdOutline = styles.getPropertyValue('--md-sys-color-outline-variant').trim() || 'var(--md-sys-color-outline-variant)';
    const mdOnSurface = styles.getPropertyValue('--md-sys-color-on-surface').trim() || 'var(--md-sys-color-on-surface)';
    const mdSuccess = styles.getPropertyValue('--color-success').trim() || 'var(--color-success)';
    const mdDanger = styles.getPropertyValue('--color-danger').trim() || 'var(--color-danger)';
    const mdNeutral = styles.getPropertyValue('--md-sys-color-on-surface-variant').trim() || 'var(--md-sys-color-on-surface-variant)';

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '600px';
    container.style.backgroundColor = mdBackground;
    container.style.padding = '40px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '20px';
    container.style.fontFamily = 'sans-serif';
    document.body.appendChild(container);

    targetMatches.forEach(m => {
        const isWin = m.result === 'Win';
        const color = isWin ? mdSuccess : (m.result === 'Loss' ? mdDanger : mdNeutral);

        const teammatesStr = (m.teammates && m.teammates.length > 0) ? `with ${m.teammates.join(', ')}` : '';

        const card = document.createElement('div');
        const root = document.createElement('div');
        root.style.background = mdSurface;
        root.style.padding = '24px';
        root.style.borderRadius = '24px';
        root.style.border = `1px solid ${mdOutline}`;
        root.style.color = mdOnSurface;
        root.style.display = 'flex';
        root.style.justifyContent = 'space-between';
        root.style.alignItems = 'center';
        root.style.position = 'relative';
        root.style.overflow = 'hidden';

        const leftBar = document.createElement('div');
        leftBar.style.position = 'absolute';
        leftBar.style.left = '0';
        leftBar.style.top = '0';
        leftBar.style.bottom = '0';
        leftBar.style.width = '6px';
        leftBar.style.background = color;
        root.appendChild(leftBar);

        const glow = document.createElement('div');
        glow.style.position = 'absolute';
        glow.style.right = '-20px';
        glow.style.bottom = '-20px';
        glow.style.width = '100px';
        glow.style.height = '100px';
        glow.style.borderRadius = '50%';
        glow.style.background = color;
        glow.style.opacity = '0.1';
        glow.style.filter = 'blur(20px)';
        root.appendChild(glow);

        const leftBlock = document.createElement('div');
        const missionLabel = document.createElement('div');
        missionLabel.style.fontSize = '10px';
        missionLabel.style.fontWeight = '900';
        missionLabel.style.textTransform = 'uppercase';
        missionLabel.style.letterSpacing = '2px';
        missionLabel.style.opacity = '0.5';
        missionLabel.style.marginBottom = '4px';
        missionLabel.textContent = 'Mission Report';
        leftBlock.appendChild(missionLabel);

        const result = document.createElement('div');
        result.style.fontSize = '32px';
        result.style.fontWeight = '900';
        result.style.textTransform = 'uppercase';
        result.style.letterSpacing = '-1px';
        result.style.color = color;
        result.textContent = m.result || '';
        leftBlock.appendChild(result);

        const shipHero = document.createElement('div');
        shipHero.style.fontSize = '12px';
        shipHero.style.fontWeight = '700';
        shipHero.style.opacity = '0.8';
        shipHero.style.marginTop = '4px';
        shipHero.textContent = `${(m.ship || '').split('(')[0]} - ${m.hero || ''}`;
        leftBlock.appendChild(shipHero);

        if (teammatesStr) {
            const teammates = document.createElement('div');
            teammates.style.fontSize = '10px';
            teammates.style.fontWeight = '500';
            teammates.style.opacity = '0.5';
            teammates.style.marginTop = '2px';
            teammates.textContent = teammatesStr;
            leftBlock.appendChild(teammates);
        }
        root.appendChild(leftBlock);

        const rightBlock = document.createElement('div');
        rightBlock.style.textAlign = 'right';
        const damage = document.createElement('div');
        damage.style.fontSize = '24px';
        damage.style.fontWeight = '900';
        damage.textContent = String(m.damageTaken || 0);
        rightBlock.appendChild(damage);

        const damageLabel = document.createElement('div');
        damageLabel.style.fontSize = '10px';
        damageLabel.style.fontWeight = '700';
        damageLabel.style.opacity = '0.5';
        damageLabel.style.textTransform = 'uppercase';
        damageLabel.textContent = 'Damage Taken';
        rightBlock.appendChild(damageLabel);

        const time = document.createElement('div');
        time.style.marginTop = '8px';
        time.style.fontSize = '14px';
        time.style.fontWeight = '700';
        time.style.fontFamily = 'monospace';
        time.textContent = m.time || '--:--';
        rightBlock.appendChild(time);

        root.appendChild(rightBlock);
        card.appendChild(root);
        container.appendChild(card);
    });

    try {
        const canvas = await html2canvas(container, { backgroundColor: mdBackground });
        const link = document.createElement('a');
        link.download = `wildgate-export-${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    } catch (e) {
        alert("Export failed.");
    }
    document.body.removeChild(container);
}
