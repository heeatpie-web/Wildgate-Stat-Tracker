const fs = require('fs');
const path = require('path');

// Use the specific directory we found earlier
// Scan the parent Logs directory
const LOGS_DIR = "C:\\Users\\Alec Gougebas\\AppData\\Local\\Nebula\\Saved\\Logs";

async function batchDecode() {
    try {
        if (!fs.existsSync(LOGS_DIR)) {
            console.log("Directory not found:", LOGS_DIR);
            return;
        }

        const files = fs.readdirSync(LOGS_DIR);
        console.log(`Scanning ${LOGS_DIR}...`);

        let successCount = 0;

        for (const file of files) {
            // Target specific cache files or rotated verisons
            // Usually named 'AccelByteTelemetryCache' or similar
            if (!file.includes('AccelByteTelemetryCache')) {
                continue;
            }
            // Skip already decoded
            if (file.startsWith('decoded_')) continue;

            const filePath = path.join(LOGS_DIR, file);

            // Ensure it's a file
            try {
                if (!fs.statSync(filePath).isFile()) continue;
            } catch (e) { continue; }

            try {
                const buffer = fs.readFileSync(filePath);

                // Skip empty files
                if (buffer.length === 0) continue;

                // Layer 1 Decode (+1 shift)
                const layer1Buf = Buffer.allocUnsafe(buffer.length);
                for (let i = 0; i < buffer.length; i++) {
                    layer1Buf[i] = buffer[i] + 1;
                }

                let layer1Obj;
                try {
                    layer1Obj = JSON.parse(layer1Buf.toString('utf8'));
                } catch (e) {
                    console.log(`[Skipping] ${file} - Not a valid encoded file (Layer 1 parse failed)`);
                    continue;
                }

                let finalJson = layer1Obj;

                // Layer 2 Decode (if ArrayByte exists)
                const abArray = layer1Obj.ArrayByte || layer1Obj.arrayByte;
                if (abArray && Array.isArray(abArray)) {
                    const layer2Buf = Buffer.allocUnsafe(abArray.length);
                    for (let i = 0; i < abArray.length; i++) {
                        layer2Buf[i] = abArray[i] + 1;
                    }
                    try {
                        const l2 = JSON.parse(layer2Buf.toString('utf8'));
                        finalJson = l2;
                    } catch (e) {
                        // ignore, keep layer 1
                    }
                }

                // Save next to original
                const outputName = `decoded_${file}.json`;
                const outputPath = path.join(LOGS_DIR, outputName);
                fs.writeFileSync(outputPath, JSON.stringify(finalJson, null, 2));
                console.log(`[Success] Decoded ${file} -> ${outputName}`);
                successCount++;

            } catch (e) {
                console.error(`[Error] Failed to process ${file}:`, e.message);
            }
        }

        console.log(`\nBatch Complete. Successfully decoded ${successCount} files.`);

    } catch (e) {
        console.error("Script Error:", e);
    }
}

batchDecode();
