/**
 * @module export
 * Data export utilities: CSV, JSON backup, match image generation,
 * and share code encoding/decoding (base64-encoded JSON subset).
 */
import { Match } from '../types';

/** Returns a filename-safe timestamp string (YYYY-MM-DD_HH-MM-SS). */
const getFormattedDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
    }, 100);
};

export const exportToCSV = (matches: Match[]) => {
  let csv = "Date,Mode,Player,Teammates,Opponents,Ship,Hero,Result,SubType,Damage Taken,Kills,ReachModifiers,Time,Notes\n";
  matches.forEach(m => {
      const kills = Object.entries(m.kills)
        .filter(k => k[1] > 0)
        .map(k => `${k[1]} ${k[0]}`)
        .join('|');
      const teammates = m.teammates.join('|');
      const opponents = (m.opponents || []).join('|');
      // Use reachModifiers with fallback to hazards for old data
      const modifiers = (m.reachModifiers || (m as any).hazards || []).join('|');
      
      const cleanNotes = '';
      
      csv += `"${m.date}","${m.mode}","${m.player}","${teammates}","${opponents}","${m.ship}","${m.hero}","${m.result}","${m.subType}","${m.damageTaken||0}","${kills}","${modifiers}","${m.time||''}","${cleanNotes}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `wildgate_export_${getFormattedDate()}.csv`);
};

export const exportJSONFile = (data: any, filenamePrefix = 'wildgate_export') => {
  const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
  downloadBlob(blob, `${filenamePrefix}_${getFormattedDate()}.json`);
};

export const exportToJSON = (data: any) => {
  exportJSONFile(data, 'wildgate_backup');
};

export const generateMatchImage = (match: Match) => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 350; 
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;

  const styles = getComputedStyle(document.body);
  const mdBackground = styles.getPropertyValue('--md-sys-color-background').trim() || styles.backgroundColor;
  const mdOutline = styles.getPropertyValue('--md-sys-color-outline-variant').trim();
  const mdOnSurface = styles.getPropertyValue('--md-sys-color-on-surface').trim() || styles.color;
  const mdSuccess = styles.getPropertyValue('--color-success').trim();
  const mdDanger = styles.getPropertyValue('--color-danger').trim();
  const mdInfo = styles.getPropertyValue('--color-info').trim();
  const mdOnSurfaceVariant = styles.getPropertyValue('--md-sys-color-on-surface-variant').trim();
  const mdWarn = styles.getPropertyValue('--color-warning').trim();

  // Background
  ctx.fillStyle = mdBackground || 'rgb(22, 27, 41)';
  ctx.fillRect(0, 0, 600, 350);

  // Border based on result
  ctx.strokeStyle = match.result === 'Win' ? (mdSuccess || 'rgb(0, 255, 157)') : (mdDanger || 'rgb(255, 71, 87)');
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 590, 340);

  // Title
  ctx.fillStyle = mdOnSurface || "white";
  ctx.font = "bold 30px 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`${match.result.toUpperCase()} - ${match.subType}`, 40, 60);

  // Details
  ctx.font = "18px 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = mdOnSurfaceVariant || 'rgb(224, 230, 237)';
  
  let y = 100;
  ctx.fillText(`Prospector: ${match.player}`, 40, y);
  y += 35;
  
  const teammates = match.teammates.length > 0 ? `With: ${match.teammates.join(', ')}` : "Solo";
  ctx.fillText(teammates, 40, y);
  y += 35;

  if (match.opponents && match.opponents.length > 0) {
      ctx.fillStyle = mdWarn || 'rgb(255, 170, 170)';
      ctx.fillText(`Vs: ${match.opponents.join(', ')}`, 40, y);
      ctx.fillStyle = mdOnSurfaceVariant || 'rgb(224, 230, 237)';
      y += 35;
  }

  const shortShip = match.ship.split(' (')[0]; 
  ctx.fillText(`Ship: ${shortShip} | Hero: ${match.hero}`, 40, y);
  y += 35;

  const modifiers = (match.reachModifiers || (match as any).hazards || []);
  const modText = modifiers.length > 0 ? modifiers.slice(0, 3).join(", ") + (modifiers.length > 3 ? "..." : "") : "No Modifiers";
  ctx.fillText(`Reach Mods: ${modText}`, 40, y);
  y += 35;

  // Kills display
  const kills = Object.entries(match.kills)
    .filter(([_, count]) => count > 0)
    .map(([ship, count]) => {
        const name = ship.split(' ')[0];
        return `${count} ${name}`;
    })
    .join(' | ');

  if (kills) {
    ctx.fillStyle = mdInfo || 'rgb(0, 212, 255)';
    ctx.fillText(`Kills: ${kills}`, 40, y);
  }

  // Date
  ctx.fillStyle = mdOutline || 'rgb(139, 155, 180)';
  ctx.font = "12px sans-serif";
  ctx.fillText(match.date, 540 - ctx.measureText(match.date).width, 320);

  // Download
  const img = canvas.toDataURL("image/jpeg");
  const link = document.createElement('a');
  link.href = img;
  link.setAttribute('download', `Mission_${match.id}.jpg`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const generateShareCode = (match: Match): string => {
    const subset = {
        m: match.mode === 'Artifact Brawl' ? 0 : 1,
        r: match.result === 'Win' ? 0 : (match.result === 'Loss' ? 1 : 2),
        s: match.ship,
        h: match.hero,
        t: match.teammates,
        o: match.opponents,
        d: match.damageTaken,
        tm: match.time,
        mod: match.reachModifiers,
        k: match.kills,
        n: match.notes
    };
    return btoa(JSON.stringify(subset));
};

export const parseShareCode = (code: string): Partial<Match> => {
    try {
        const subset = JSON.parse(atob(code));
        return {
            id: Date.now(),
            timestamp: Date.now(),
            date: new Date().toLocaleDateString(),
            mode: subset.m === 0 ? 'Artifact Brawl' : 'Fleet Battle',
            result: subset.r === 0 ? 'Win' : (subset.r === 1 ? 'Loss' : 'Draw'),
            ship: subset.s,
            hero: subset.h,
            teammates: subset.t || [],
            opponents: subset.o || [],
            damageTaken: subset.d || 0,
            time: subset.tm || '',
            reachModifiers: subset.mod || [],
            kills: subset.k || {},
            notes: subset.n || '',
            subType: 'Imported'
        };
    } catch (e) {
        throw new Error("Invalid share code");
    }
};
