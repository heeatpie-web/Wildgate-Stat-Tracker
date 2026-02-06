
// Mock Entity Logic
const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const SHIP_NAME_KEYWORDS = ['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'DODGE', 'BULLET'];
const IGNORED = [
    'LEVEL', 'READY', 'LOBBY', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'PLAYER', 'SEARCH', 'VOTE', 'PING', 'REGION', 'SHIP', 'CREW', 'HUB', 'VOICE', 'MIC', 'MUTE', 'OPTIONS', 'BACK', 'XP', 'SC', 'MC',
    'HOP INTO THE SAME VOICE', 'PUSHTO TALK', 'TEAM VOICE', 'SWITCH VOICE', 'DISABLE VOICE', 'CHANNEL', 'TALK', 'OPEN MIC', 'HOLD TO TALK'
];

// Helper to check if text is ignored using word boundaries
const isIgnored = (text) => {
    const up = text.toUpperCase();
    if (up.includes("CREW") && up.includes("'S")) return true;
    if (up.includes("VOICE") || up.includes("CHANNEL")) return true;

    return IGNORED.some(ig => {
        return new RegExp(`\\b${ig}\\b`).test(up);
    });
};

const processSimulation = (entities) => {
    const screenW = 1920;
    const results = [];

    // REGIONAL SPLIT
    const centerX = screenW / 2;
    const leftEntities = entities.filter(e => e.center.x < centerX);
    const rightEntities = entities.filter(e => e.center.x >= centerX);

    console.log(`[Split] Left: ${leftEntities.length} entities, Right: ${rightEntities.length} entities`);

    // 1. Process My Crew (Left)
    leftEntities.forEach(e => {
        if (isIgnored(e.text)) return;

        results.push({
            name: e.cleanName,
            teamColor: 'Green',
            teamName: 'My Crew',
            confidence: e.confidence,
            source: 'OCR',
            isTag: true
        });
    });

    // 2. Process Enemy Crews (Right)
    const CLUSTER_THRESHOLD_Y = 30;
    const clusters = [];

    // Cluster Entities
    const sortedRight = [...rightEntities].sort((a, b) => a.bbox.y0 - b.bbox.y0);

    sortedRight.forEach(e => {
        const y = (e.bbox.y0 + e.bbox.y1) / 2;
        const existing = clusters.find(c => Math.abs(c.centerY - y) < CLUSTER_THRESHOLD_Y);
        if (existing) {
            existing.lines.push(e);
        } else {
            clusters.push({ lines: [e], centerY: y });
        }
    });

    console.log(`[Clusters] Found ${clusters.length} potential cards on right side.`);

    // Process Clusters
    clusters.forEach((cluster, idx) => {
        const lines = cluster.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);
        if (lines.length === 0) return;

        // Find Metadata
        const metadataLine = lines.find(l => l.color !== 'Unknown');
        const teamColor = metadataLine ? metadataLine.color : 'Unknown';

        let playerName = "Unknown";
        let teamName = "Unknown Ship";
        let shipType = undefined;

        const validLines = lines.filter(l => {
            const up = l.text.toUpperCase();
            return !isIgnored(l.text) && !up.includes("ENEMY CREW");
        });

        if (validLines.length === 0) return;

        // Debug Cluster Content
        // console.log(`[Cluster ${idx}] Lines: ${validLines.map(l => l.text).join(' | ')}`);

        if (validLines.length >= 2) {
            playerName = validLines[0].cleanName;
            teamName = validLines[1].cleanName;

            if (validLines.length > 2) {
                const classLine = validLines.find(l => SHIP_TYPES.some(st => l.text.toUpperCase().includes(st)));
                if (classLine) shipType = classLine.cleanName;
            } else {
                if (SHIP_TYPES.some(st => validLines[1].text.toUpperCase().includes(st))) {
                    shipType = validLines[1].cleanName;
                }
            }
        } else {
            const text = validLines[0].text.toUpperCase();
            // Filter standalone headers/ships on right side if they have no player
            if (SHIP_TYPES.some(st => text.includes(st)) || SHIP_NAME_KEYWORDS.some(k => text.includes(k))) {
                // console.log(`  [Cluster ${idx}] Skipped ship-only line: ${text}`);
                return;
            } else if (text.includes("ENEMY CREWS")) {
                return;
            } else {
                playerName = validLines[0].cleanName;
            }
        }

        // Re-calc color
        const validMeta = validLines.find(l => l.color !== 'Unknown');
        const finalColor = validMeta ? validMeta.color : teamColor;

        if (playerName !== "Unknown" && playerName.length > 2) {
            results.push({
                name: playerName,
                teamColor: finalColor,
                teamName: teamName,
                shipType: shipType,
                confidence: validLines[0].confidence,
                source: 'OCR',
                isTag: finalColor !== 'Unknown'
            });
        }
    });

    return results;

};

// FULL ROSTER MOCK DATA
const mockEntities = [
    // --- LEFT SIDE (My Crew) ---
    // Header (Noise)
    { text: "DODGE THE BULLET's Crew", cleanName: "DODGE THE BULLET's Crew", color: 'Cyan', center: { x: 400, y: 150 }, bbox: { y0: 140, y1: 160 } },

    // Player 1
    { text: "AlixThus", cleanName: "AlixThus", color: 'Unknown', confidence: 95, center: { x: 400, y: 300 }, bbox: { y0: 290, y1: 310 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 320 }, bbox: { y0: 315, y1: 335 } },

    // Player 2
    { text: "c0mbat_Barbi3", cleanName: "c0mbat_Barbi3", color: 'Unknown', confidence: 95, center: { x: 400, y: 400 }, bbox: { y0: 390, y1: 410 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 420 }, bbox: { y0: 415, y1: 435 } },

    // Player 3
    { text: "ScareQro", cleanName: "ScareQro", color: 'Unknown', confidence: 95, center: { x: 400, y: 500 }, bbox: { y0: 490, y1: 510 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 520 }, bbox: { y0: 515, y1: 535 } },

    // Player 4
    { text: "oSa1ad", cleanName: "oSa1ad", color: 'Unknown', confidence: 95, center: { x: 400, y: 600 }, bbox: { y0: 590, y1: 610 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 620 }, bbox: { y0: 615, y1: 635 } },


    // --- RIGHT SIDE (Enemy Crews) ---
    // Header
    { text: "Enemy Crews", cleanName: "Enemy Crews", color: 'Unknown', confidence: 99, center: { x: 1400, y: 200 }, bbox: { y0: 190, y1: 210 } },

    // RED TEAM (MURDER SPAGHURDER)
    // 1
    { text: "NigthmareGMC", cleanName: "NigthmareGMC", color: 'Unknown', confidence: 95, center: { x: 1400, y: 240 }, bbox: { y0: 230, y1: 250 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 265 }, bbox: { y0: 255, y1: 275 } },
    // 2
    { text: "SHTER", cleanName: "SHTER", color: 'Unknown', confidence: 95, center: { x: 1400, y: 300 }, bbox: { y0: 290, y1: 310 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 325 }, bbox: { y0: 315, y1: 335 } },
    // 3
    { text: "JACR1907", cleanName: "JACR1907", color: 'Unknown', confidence: 95, center: { x: 1400, y: 360 }, bbox: { y0: 350, y1: 370 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 385 }, bbox: { y0: 375, y1: 395 } },
    // 4
    { text: "gaowang134", cleanName: "gaowang134", color: 'Unknown', confidence: 95, center: { x: 1400, y: 420 }, bbox: { y0: 410, y1: 430 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 445 }, bbox: { y0: 435, y1: 455 } },

    // ORANGE TEAM (MEANR THAN AVG)
    // 5
    { text: "littleleaves", cleanName: "littleleaves", color: 'Unknown', confidence: 95, center: { x: 1400, y: 500 }, bbox: { y0: 490, y1: 510 } },
    { text: "MEANR THAN AVG", cleanName: "MEANR THAN AVG", color: 'Orange', confidence: 95, center: { x: 1400, y: 525 }, bbox: { y0: 515, y1: 535 } },
    // 6 (Chinese chars mock)
    // NOTE: cleanName for Chinese might be empty if filter regex is strict!
    // src/utils/stringUtils cleanPlayerName often filters weird chars?
    // Let's assume the mock just has the text.
    { text: "HaoGuoZhi", cleanName: "HaoGuoZhi", color: 'Unknown', confidence: 90, center: { x: 1400, y: 560 }, bbox: { y0: 550, y1: 570 } },
    { text: "MEANR THAN AVG", cleanName: "MEANR THAN AVG", color: 'Orange', confidence: 95, center: { x: 1400, y: 585 }, bbox: { y0: 575, y1: 595 } },
    // 7
    { text: "PermanentWinner", cleanName: "PermanentWinner", color: 'Unknown', confidence: 95, center: { x: 1400, y: 620 }, bbox: { y0: 610, y1: 630 } },
    { text: "MEANR THAN AVG", cleanName: "MEANR THAN AVG", color: 'Orange', confidence: 95, center: { x: 1400, y: 645 }, bbox: { y0: 635, y1: 655 } },
    // 8
    { text: "MYNWINER", cleanName: "MYNWINER", color: 'Unknown', confidence: 95, center: { x: 1400, y: 680 }, bbox: { y0: 670, y1: 690 } },
    { text: "MEANR THAN AVG", cleanName: "MEANR THAN AVG", color: 'Orange', confidence: 95, center: { x: 1400, y: 705 }, bbox: { y0: 695, y1: 715 } },

];

const finalResults = processSimulation(mockEntities);
import fs from 'fs';

const output = [];
output.push(`Total Players Extracted: ${finalResults.length}`);
const leftSide = finalResults.filter(r => r.teamName === 'My Crew');
const rightSide = finalResults.filter(r => r.teamName !== 'My Crew');

output.push(`\nMy Crew (${leftSide.length}):`);
leftSide.forEach(p => output.push(` - ${p.name}`));

output.push(`\nEnemy Crew (${rightSide.length}):`);
rightSide.forEach(p => output.push(` - ${p.name} [${p.teamName.replace(/\n/g, '')}] (${p.teamColor})`));

fs.writeFileSync('ocr_debug_results.txt', output.join('\n'), 'utf8');
console.log("Results written to ocr_debug_results.txt");


