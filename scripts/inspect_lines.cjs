const { recognizeBatchFromPath } = require('node-windows-ocr');

async function inspect(imagePath) {
    try {
        console.log(`\n=== RAW LINE INSPECTION: ${imagePath.split('\\').pop()} ===`);
        const results = await recognizeBatchFromPath([imagePath]);
        const result = results[0].Result;

        const lines = result.Lines.map(l => ({
            text: l.Text,
            y: l.BoundingRect.Y,
            h: l.BoundingRect.Height
        })).sort((a, b) => a.y - b.y);

        lines.forEach(l => {
            console.log(`Y: ${Math.round(l.y)} | H: ${Math.round(l.h)} | Text: "${l.text}"`);
        });

    } catch (e) {
        console.error("Inspection Failed:", e);
    }
}

inspect("C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png");

