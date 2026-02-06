const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'ZOOM', 'RESET', 'MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'SEED:'];

async function simulate(imagePath) {
    try {
        console.log(`\n=== ROSTER TEST: ${imagePath} ===`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const names = [];
        result.Lines.forEach(line => {
            line.Words.forEach(word => {
                const text = word.Text.trim();
                const upper = text.toUpperCase();

                if (text.length < 2) return;
                if (IGNORED.includes(upper)) return;
                if (SHIP_TYPES.includes(upper)) return;

                // Mimic the new heuristic in scanService.ts
                const lowerCount = (text.match(/[a-z]/g) || []).length;
                const isLikelyName = lowerCount >= 2 || (text.length > 5 && !IGNORED.includes(upper));

                if (isLikelyName) names.push(text);
            });
        });

        console.log("Confirmed Player Names:");
        names.forEach(t => console.log(` - ${t}`));

    } catch (e) {
        console.error("Simulation Failed:", e);
    }
}

async function run() {
    const images = [
        "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png",
        "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
    ];
    for (const img of images) await simulate(img);
}
run();
