const { recognizeBatchFromPath } = require('node-windows-ocr');
const imagePath = "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-24-29-653Z.png";

async function run() {
    try {
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0]?.Result;
        console.log("--- FINAL OCR RESULT ---");
        console.log("Lines Found:", result.Lines.length);
        console.log("Full Text Summary:");
        console.log(result.Text);
        console.log("--- END ---");
    } catch (e) {
        console.error("OCR Failed:", e);
    }
}
run();
