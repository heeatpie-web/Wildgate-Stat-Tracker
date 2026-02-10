const { recognizeBatchFromPath } = require('node-windows-ocr');
const imagePath = "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png";

async function run() {
    try {
        const results = await recognizeBatchFromPath([imagePath]);
        console.log("--- OCR TEXT START ---");
        console.log(results[0].Text);
        console.log("--- OCR TEXT END ---");
    } catch (e) {
        console.error("OCR Failed:", e);
    }
}
run();

