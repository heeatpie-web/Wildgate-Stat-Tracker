const { recognizeBatchFromPath } = require('node-windows-ocr');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const imagePath = "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png";

async function run() {
    try {
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const img = await loadImage(imagePath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        console.log("=== COLOR SAMPLING TEST ===");

        result.Lines.forEach(line => {
            line.Words.forEach(word => {
                const text = word.Text;
                const bbox = word.BoundingRect;

                // Sample center of word
                const cx = Math.floor(bbox.X + bbox.Width / 2);
                const cy = Math.floor(bbox.Y + bbox.Height / 2);

                const pixel = ctx.getImageData(cx, cy, 1, 1).data;
                const r = pixel[0], g = pixel[1], b = pixel[2];

                console.log(`Word: "${text}" [${cx},${cy}] -> RGB(${r},${g},${b})`);
            });
        });
    } catch (e) {
        console.error("Sampling Failed:", e);
    }
}
run();

