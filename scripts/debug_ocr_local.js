import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

const TARGET_FILE = "capture_2026-02-04T08-22-46-561Z.png";
const DEBUG_DIR = "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug";
const FULL_PATH = path.join(DEBUG_DIR, TARGET_FILE);

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW'];
const UI_REACH_MODIFIERS = [
    "Ancient Vault", "Cryon Reach", "Dead Sensors", "Deadworlds", "Easy Loot", "Epic Loot",
    "Fast Gate", "Few asteroids", "Few Ships", "Gloaming Expanse", "Haunted Storm",
    "Ice Storm", "Lava Epics", "Leech Swarms", "Legion Patrols", "Low altitude fog",
    "Many asteroids", "Rogue Turrets", "Sandstorm", "Artifact: Healing",
    "Artifact: Ice", "Artifact: Weapon"
];

const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'ZOOM', 'RESET'];

async function preprocessImage(imagePath) {
    const image = await Jimp.read(imagePath);
    // UPSCALE 2x
    image.resize(image.bitmap.width * 2, image.bitmap.height * 2);

    const data = image.bitmap.data;
    let min = 255; let max = 0;

    // Grayscale
    for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        data[i] = lum; data[i + 1] = lum; data[i + 2] = lum;
        if (lum < min) min = lum; if (lum > max) max = lum;
    }

    const range = max - min;
    const factor = range > 0 ? 255 / range : 0;

    for (let i = 0; i < data.length; i += 4) {
        let val = (data[i] - min) * factor;
        // INVERT
        val = 255 - val;
        // Hard Threshold
        val = val > 160 ? 255 : (val < 100 ? 0 : val);
        data[i] = val; data[i + 1] = val; data[i + 2] = val;
    }
    return await image.getBuffer("image/png");
}

function detectModifiers(text) {
    const upperText = text.toUpperCase();
    const found = [];
    UI_REACH_MODIFIERS.forEach(mod => {
        if (upperText.includes(mod.toUpperCase())) {
            found.push(mod);
        } else if (mod.startsWith("Artifact: ")) {
            const suffix = mod.split(": ")[1];
            if (upperText.includes(suffix.toUpperCase())) found.push(mod);
        }
    });
    return found;
}

async function runAnalysis() {
    if (!fs.existsSync(FULL_PATH)) { console.error("File not found!"); return; }
    console.log(`Analyzing: ${TARGET_FILE} with 2x Scale + Invert`);

    const worker = await createWorker('eng');

    try {
        const processedBuffer = await preprocessImage(FULL_PATH);
        const ret = await worker.recognize(processedBuffer);
        const fullText = ret.data.text;

        console.log("OCR Complete.\n");
        console.log("--- FOUND MODIFIERS ---");
        const modifiers = detectModifiers(fullText);
        modifiers.forEach(m => console.log(`- ${m}`));
        if (modifiers.length === 0) console.log("(None)");
        console.log("-----------------------");

        // Parse Players/Ships
        const page = ret.data;
        const rawResults = [];

        if (page && page.words) {
            for (let i = 0; i < page.words.length; i++) {
                const word = page.words[i];
                let text = word.text.trim();
                if (text.length < 2) continue;

                let upper = text.toUpperCase();

                // SOLO OUTLAW check
                if (upper === 'SOLO' && i + 1 < page.words.length) {
                    const nextWord = page.words[i + 1];
                    const nextUpper = nextWord.text.toUpperCase();
                    if (nextUpper === 'OUTLAW') {
                        text = "SOLO OUTLAW";
                        upper = "SOLO OUTLAW";
                        word.bbox.x1 = nextWord.bbox.x1;
                        word.bbox.y1 = Math.max(word.bbox.y1, nextWord.bbox.y1);
                        i++;
                    }
                }

                if (IGNORED.includes(upper)) continue;
                if (/^[^a-zA-Z0-9\[\]\*\-]+$/.test(text) && !text.includes('3')) continue; // Allow '3' for leetspeak

                let type = 'UNKNOWN';
                const isExactShip = SHIP_TYPES.includes(upper);
                const partial = SHIP_TYPES.find(st => st.length > 4 && upper.includes(st));

                if (isExactShip || partial) type = 'SHIP';
                else type = 'NAME';

                rawResults.push({
                    text: type === 'SHIP' ? (partial || upper) : text,
                    bbox: word.bbox,
                    type,
                    confidence: word.confidence
                });
            }
        }

        const shipTokens = rawResults.filter(r => r.type === 'SHIP');
        const nameTokens = rawResults.filter(r => r.type === 'NAME');

        console.log(`\nTokens: ${nameTokens.length} Names, ${shipTokens.length} Ships`);

        const players = [];
        nameTokens.forEach(token => {
            const { bbox } = token;
            const h = bbox.y1 - bbox.y0;
            const w = bbox.x1 - bbox.x0;
            const cx = (bbox.x0 + bbox.x1) / 2;
            const cy = (bbox.y0 + bbox.y1) / 2;

            const nearbyShip = shipTokens.find(s => {
                const sCy = (s.bbox.y0 + s.bbox.y1) / 2;
                const sCx = (s.bbox.x0 + s.bbox.x1) / 2;
                const yDist = Math.abs(sCy - cy);
                const xDist = Math.abs(sCx - cx);

                // Grouping Logic (scaled for 2x upscaling? No, bbox stays same? Tesseract returns bbox relative to image size.
                // Since image is 2x, bboxes are 2x larger.
                // Our logic uses relative h factors, so it SHOULD scale linearly.

                if (yDist < h * 2.0 && xDist < w * 6) return true; // Relaxed slightly
                if (s.bbox.y0 >= bbox.y1 - 5 && s.bbox.y0 < bbox.y1 + h * 5 && xDist < w * 3) return true;
                if (s.bbox.y1 <= bbox.y0 + 5 && s.bbox.y1 > bbox.y0 - h * 5 && xDist < w * 3) return true;
                return false;
            });

            // Filter likely junk names
            if (token.confidence > 50 && token.text.length > 3) {
                players.push({
                    name: token.text,
                    ship: nearbyShip ? nearbyShip.text : "Unknown",
                    conf: token.confidence.toFixed(0)
                });
            }
        });

        console.log("\n--- PARSED PLAYERS ---");
        players.forEach(p => console.log(`Name: ${p.name.padEnd(20)} | Ship: ${p.ship} (${p.conf}%)`));
        console.log("----------------------");

    } catch (e) {
        console.error(`Error:`, e.message);
    }
    await worker.terminate();
}

runAnalysis().catch(console.error);
