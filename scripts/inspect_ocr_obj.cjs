const { recognizeBatchFromPath } = require('node-windows-ocr');
const imagePath = "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png";

async function run() {
    try {
        const results = await recognizeBatchFromPath([imagePath]);
        const first = results[0];
        console.log("Keys:", Object.keys(first));
        console.log("Full Object:", JSON.stringify(first, null, 2));
    } catch (e) {
        console.error("OCR Failed:", e);
    }
}
run();
