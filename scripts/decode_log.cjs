const fs = require('fs');
const path = 'C:\\Users\\<USERNAME>\\AppData\\Local\\Nebula\\Saved\\Logs\\AccelByteTelemetryCache';

try {
    const buffer = fs.readFileSync(path);
    let layer1 = '';
    for (let i = 0; i < buffer.length; i++) {
        layer1 += String.fromCharCode(buffer[i] + 1);
    }

    console.log("Layer 1 Start:", layer1.slice(0, 200));

    const match = layer1.match(/"ArrayByte"\s*:\s*\[(.*?)\]/s);
    if (match) {
        console.log("ArrayByte found!");
        const bytesStr = match[1];
        const bytes = bytesStr.split(',').map(n => parseInt(n.trim()));

        let layer2 = '';
        for (const b of bytes) {
            layer2 += String.fromCharCode(b + 1);
        }
        console.log("Layer 2 Decoded:", layer2);

        const idRegex = /"accountId":"([a-f0-9]{32})"/g;
        let m;
        const ids = new Set();
        while ((m = idRegex.exec(layer2)) !== null) {
            ids.add(m[1]);
        }
        console.log("Found IDs in Layer 2:", [...ids]);
    } else {
        console.log("ArrayByte NOT found via regex.");
    }

} catch (e) {
    console.error(e);
}

