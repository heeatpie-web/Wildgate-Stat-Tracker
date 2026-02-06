const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'ZOOM', 'RESET', 'MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'CHANGE', 'VOICE', 'OPTIONS', 'SEED:'];

async function simulate(imagePath) {
    try {
        console.log(`\n=== ROSTER TEST: ${imagePath} ===`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const validTokens = [];
        result.Lines.forEach(line => {
            line.Words.forEach(word => {
                const upper = word.Text.toUpperCase();
                if (IGNORED.includes(upper)) return;
                if (SHIP_TYPES.includes(upper)) return;
                if (word.Text.length < 3) return;
                validTokens.push(word.Text);
            });
        });

        console.log("Potential Player Names Identified:");
        validTokens.forEach(t => console.log(` - ${t}`));

    } catch (e) {
        console.error("Simulation Failed:", e);
    }
}

async function run() {
    console.log("Cros-checking all Tactical screenshots for Name recognition...");
    const images = [
        "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png",
        "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
    ];
    for (const img of images) await simulate(img);
}
run();
