import * as OcrLib from 'node-windows-ocr';
import path from 'path';

// Log exports to see API
console.log("Library Exports:", OcrLib);

const imagePath = path.resolve("C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-46-561Z.png");

async function run() {
    try {
        console.log("Testing on:", imagePath);
        if (OcrLib.recognizeBatchFromPath) {
            console.log("Calling recognizeBatchFromPath...");
            // API likely takes an array of strings? or single string?
            // Trying array as "Batch" implies multiple
            const result = await OcrLib.recognizeBatchFromPath([imagePath]);
            console.log("Result:", JSON.stringify(result, null, 2));
        } else {
            console.log("Function recognizeBatchFromPath not found.");
        }
    } catch (e) {
        console.error("OCR Failed:", e);
    }
}

run();

