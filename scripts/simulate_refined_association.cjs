const { recognizeBatchFromPath } = require('node-windows-ocr');

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];

async function simulate(imagePath) {
    try {
        console.log(`\n=== SIMULATING: ${imagePath} ===`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const rawResults = [];
        result.Lines.forEach(line => {
            line.Words.forEach(word => {
                const upper = word.Text.toUpperCase();
                let type = 'NAME';
                if (SHIP_TYPES.includes(upper)) type = 'SHIP';
                rawResults.push({ text: word.Text, bbox: word.BoundingRect, type });
            });
        });

        const shipTokens = rawResults.filter(r => r.type === 'SHIP');
        const nameTokens = rawResults.filter(r => r.type === 'NAME');

        console.log("Associations:");
        nameTokens.forEach(token => {
            const bbox = token.bbox;
            const h = bbox.Height;
            const w = bbox.Width;
            const cx = bbox.X + w / 2;
            const cy = bbox.Y + h / 2;

            const nearbyShip = shipTokens.find(s => {
                const sCx = s.bbox.X + s.bbox.Width / 2;
                const sCy = s.bbox.Y + s.bbox.Height / 2;
                const yDist = Math.abs(sCy - cy);
                const xDist = Math.abs(sCx - cx);

                // Matches new logic in scanService.ts
                if (yDist < h * 4 && xDist < w * 4) return true;
                if (s.bbox.Y >= bbox.Y + h - 10 && s.bbox.Y < bbox.Y + h + h * 6 && xDist < w * 3) return true;
                return false;
            });

            if (nearbyShip || token.text.length > 3) {
                console.log(` - Name: "${token.text}" -> Ship/Status: ${nearbyShip ? nearbyShip.text : 'None Found'}`);
            }
        });

    } catch (e) {
        console.error("Simulation Failed:", e);
    }
}

async function run() {
    await simulate("C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png");
}
run();
