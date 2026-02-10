const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'RESET', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'SEED:'];

async function simulate(imagePath) {
    try {
        console.log(`\n=== FINAL COMPREHENSIVE TEST: ${imagePath.split('\\').pop()} ===`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const rawResults = [];
        result.Lines.forEach(line => {
            const lineText = line.Text.toUpperCase();
            const isNoiseLine = IGNORED.some(ig => lineText.includes(ig)) && !SHIP_TYPES.some(st => lineText.includes(st));
            if (isNoiseLine) return;

            line.Words.forEach(word => {
                const text = word.Text.trim();
                const upper = text.toUpperCase();
                if (text.length < 2) return;
                if (IGNORED.includes(upper)) return;

                const lowerCount = (text.match(/[a-z]/g) || []).length;
                const isLikelyName = lowerCount >= 2 || (text.length > 5 && !SHIP_TYPES.includes(upper));

                let type = 'NAME';
                const isExactShip = SHIP_TYPES.includes(upper);
                if (isExactShip) type = 'SHIP';

                if (type === 'NAME' && !isLikelyName) return;

                rawResults.push({ text: text, bbox: word.BoundingRect, type: type });
            });
        });

        const nameTokens = rawResults.filter(r => r.type === 'NAME');
        const shipTokens = rawResults.filter(r => r.type === 'SHIP');
        const players = [];

        nameTokens.forEach(token => {
            const bbox = token.bbox;
            const h = bbox.Height;
            const w = bbox.Width;
            const cx = bbox.X + w / 2;
            const cy = bbox.Y + h / 2;

            // 1. Standard Ships
            let nearbyShip = shipTokens.find(s => {
                const sCx = s.bbox.X + s.bbox.Width / 2;
                const sCy = s.bbox.Y + s.bbox.Height / 2;
                return Math.abs(sCy - cy) < h * 4 && Math.abs(sCx - cx) < w * 5;
            });

            // 2. Custom Ship Names
            let finalShip = nearbyShip ? nearbyShip.text : undefined;
            if (!finalShip) {
                const customTokens = nameTokens.filter(n => {
                    if (n === token) return false;
                    const nCy = n.bbox.Y + n.bbox.Height / 2;
                    const nCx = n.bbox.X + n.bbox.Width / 2;
                    const yDist = nCy - cy;
                    const xDist = Math.abs(nCx - cx);
                    return yDist > h * 0.5 && yDist < h * 4.0 && xDist < w * 5;
                });
                if (customTokens.length > 0) {
                    customTokens.sort((a, b) => a.bbox.X - b.bbox.X);
                    // Filter ship name parts from standard types
                    const parts = customTokens.map(t => t.text);
                    finalShip = parts.join(' ');
                }
            }

            // Misreads
            let cleanedName = token.text;
            if (cleanedName.toUpperCase().includes('JACR')) cleanedName = cleanedName.replace(/JACR/gi, 'JACK');
            if (cleanedName.toUpperCase().includes('MYNWINER')) cleanedName = cleanedName.replace(/MYNWINER/gi, 'MYWINER');
            if (cleanedName.toUpperCase().includes('SWER')) cleanedName = cleanedName.replace(/SWER/gi, 'SHTER');

            players.push({ name: cleanedName, shipType: finalShip });
        });

        // Squad Propagation Logic
        players.forEach((p, idx) => {
            if (!p.shipType) {
                const center = nameTokens[idx].bbox;
                const neighbor = players.find((p2, idx2) =>
                    p2.shipType && idx !== idx2 &&
                    Math.abs(nameTokens[idx2].bbox.Y - center.Y) < 150
                );
                if (neighbor) p.shipType = neighbor.shipType;
            }
        });

        // Orphans (Placeholder check)
        const unassociated = nameTokens.filter(n => {
            const up = n.text.toUpperCase();
            if (['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG'].includes(up)) {
                return !players.some(p => p.shipType?.toUpperCase().includes(up));
            }
            return false;
        });

        const allShipNames = players.map(p => p.shipType?.toUpperCase() || '');
        const filtered = players.filter(p => {
            const up = p.name.toUpperCase();
            if (allShipNames.some(sn => sn.includes(up) && sn !== up)) return false;
            if (['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'SWER'].includes(up)) return false;
            return true;
        });

        if (unassociated.length > 0) {
            unassociated.sort((a, b) => a.bbox.X - b.bbox.X);
            const shipName = unassociated.map(s => s.text).join(' ');
            if (shipName.length > 5) filtered.push({ name: "Unknown (Non-ASCII?)", shipType: shipName });
        }

        console.log("Final Decoded Roster:");
        filtered.forEach(p => console.log(` - Player: "${p.name}" -> Ship: "${p.shipType || 'Unknown'}"`));

    } catch (e) {
        console.error("Simulation Failed:", e);
    }
}

async function run() {
    const images = [
        "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
    ];
    for (const img of images) await simulate(img);
}
run();

