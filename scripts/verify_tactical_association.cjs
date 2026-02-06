const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'RESET', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'SEED:'];

async function simulate(imagePath) {
    try {
        console.log(`\n=== ASSOCIATION TEST: ${imagePath.split('\\').pop()} ===`);
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

        const shipTokens = rawResults.filter(r => r.type === 'SHIP');
        const nameTokens = rawResults.filter(r => r.type === 'NAME');

        nameTokens.forEach(token => {
            const bbox = token.bbox;
            const h = bbox.Height;
            const w = bbox.Width;
            const cx = bbox.X + w / 2;
            const cy = bbox.Y + h / 2;

            // 1. Check standard ships
            let nearbyShip = shipTokens.find(s => {
                const sCx = s.bbox.X + s.bbox.Width / 2;
                const sCy = s.bbox.Y + s.bbox.Height / 2;
                const yDist = Math.abs(sCy - cy);
                const xDist = Math.abs(sCx - cx);
                return yDist < h * 4 && xDist < w * 4;
            });

            // 2. Check custom ship names (text below)
            let finalShip = nearbyShip ? nearbyShip.text : undefined;
            if (!finalShip) {
                const custom = nameTokens.find(n => {
                    if (n === token) return false;
                    const nCy = n.bbox.Y + n.bbox.Height / 2;
                    const nCx = n.bbox.X + n.bbox.Width / 2;
                    const yDist = nCy - cy;
                    const xDist = Math.abs(nCx - cx);
                    return yDist > h * 0.5 && yDist < h * 2.5 && xDist < w * 4;
                });
                if (custom) finalShip = custom.text;
            }

            // Cleanup
            let cleanedName = token.text;
            if (cleanedName.toUpperCase().includes('JACR')) cleanedName = cleanedName.replace(/JACR/gi, 'JACK');
            if (cleanedName.toUpperCase().includes('MYNWINER')) cleanedName = cleanedName.replace(/MYNWINER/gi, 'MYWINER');

            if (finalShip || cleanedName.length > 5) {
                console.log(` - Player: "${cleanedName}" -> Ship: "${finalShip || 'Unknown'}"`);
            }
        });

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
