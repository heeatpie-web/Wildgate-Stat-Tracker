const { recognizeBatchFromPath } = require('node-windows-ocr');

const images = [
    "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png",
    "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png"
];

async function run() {
    for (const imagePath of images) {
        try {
            console.log(`\n=== ANALYZING: ${imagePath} ===`);
            const results = await recognizeBatchFromPath([imagePath]);
            const result = results[0].Result;
            console.log("Full Text:");
            console.log(result.Text);
            console.log("Lines Found:", result.Lines.length);
        } catch (e) {
            console.error(`Failed on ${imagePath}:`, e);
        }
    }
}
run();

