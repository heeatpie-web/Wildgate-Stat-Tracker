const { recognizeBatchFromPath } = require('node-windows-ocr');
const path = require('path');

const imagePath = "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png";

async function run() {
    try {
        console.log(`Analyzing: ${imagePath}`);
        const results = await recognizeBatchFromPath([imagePath]);
        console.log(JSON.stringify(results[0], null, 2));
    } catch (e) {
        console.error("OCR Failed:", e);
    }
}

run();
