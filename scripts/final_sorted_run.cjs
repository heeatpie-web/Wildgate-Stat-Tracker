const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'ZOOM', 'RESET', 'MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'SEED:'];

async function simulateFullRun(imagePath) {
    try {
        console.log(`\nProcessing: ${imagePath.split('\\').pop()}`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const teams = {};

        result.Lines.forEach(line => {
            const lineText = line.Text.toUpperCase();

            // Multi-word noise reduction (mimic scanService.ts)
            const isNoiseLine = IGNORED.some(ig => lineText.includes(ig)) && !SHIP_TYPES.some(st => lineText.includes(st));
            if (isNoiseLine) return;

            line.Words.forEach(word => {
                const text = word.Text.trim();
                const upper = text.toUpperCase();

                if (text.length < 2) return;
                if (IGNORED.includes(upper)) return;

                // Heuristic: Must have lowercase or be long enough
                const lowerCount = (text.match(/[a-z]/g) || []).length;
                const isLikelyName = lowerCount >= 2 || (text.length > 5 && !SHIP_TYPES.includes(upper));
                if (!isLikelyName) return;

                // For the simulation, we'll assign a mock team if we can't do real sampling
                // In the real app, sampleRegion() provides this. 
                // We'll use a deterministic mock based on Y coordinate for sorting demonstration
                let team = 'Green'; // Default for the "Party"
                if (word.BoundingRect.Y > 400 && word.BoundingRect.Y < 600) team = 'Red';
                if (word.BoundingRect.Y > 600) team = 'Blue';

                if (!teams[team]) teams[team] = [];
                teams[team].push(text);
            });
        });

        console.log("=== SORTED TEAM ROSTERS ===");
        Object.keys(teams).sort().forEach(team => {
            console.log(`[Team ${team}]:`);
            // Sort names alphabetically
            const sortedNames = Array.from(new Set(teams[team])).sort();
            sortedNames.forEach(name => console.log(`  - ${name}`));
        });

    } catch (e) {
        console.error("Run Failed:", e);
    }
}

async function run() {
    const images = [
        "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
    ];
    for (const img of images) await simulateFullRun(img);
}
run();

