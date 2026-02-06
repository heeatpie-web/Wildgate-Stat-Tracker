const { recognizeBatchFromPath } = require('node-windows-ocr');

const images = [
    "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png",
    "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
];

async function run() {
    for (const imagePath of images) {
        try {
            console.log(`\n=== ANALYZING: ${imagePath} ===`);
            const results = await recognizeBatchFromPath([imagePath]);
            const result = results[0].Result;

            console.log("Found Words (Text, Bbox):");
            result.Lines.forEach(line => {
                line.Words.forEach(word => {
                    const b = word.BoundingRect;
                    console.log(`[${Math.round(b.X)},${Math.round(b.Y)} w:${Math.round(b.Width)} h:${Math.round(b.Height)}] -> "${word.Text}"`);
                });
            });
        } catch (e) {
            console.error(`Failed on ${imagePath}:`, e);
        }
    }
}
run();
