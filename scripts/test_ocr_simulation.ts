
// Mock Stuff
interface LobbyScanResult {
    name: string;
    teamColor: string;
    teamName: string;
    shipType?: string;
    confidence: number;
    source: 'OCR' | 'Manual';
    isTag: boolean;
}

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const SHIP_NAME_KEYWORDS = ['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'DODGE', 'BULLET'];
const IGNORED = [
    'LEVEL', 'READY', 'LOBBY', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'PLAYER', 'SEARCH', 'VOTE', 'PING', 'REGION', 'SHIP', 'CREW', 'HUB', 'VOICE', 'MIC', 'MUTE', 'OPTIONS', 'BACK', 'XP', 'SC', 'MC',
    'HOP INTO THE SAME VOICE', 'PUSHTO TALK', 'TEAM VOICE', 'SWITCH VOICE', 'DISABLE VOICE', 'CHANNEL', 'TALK', 'OPEN MIC', 'HOLD TO TALK'
];

type TeamColor = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple' | 'Cyan' | 'Unknown';

const processSimulation = (entities: any[]) => {
    const screenW = 1920;
    const results: LobbyScanResult[] = [];

    // REGIONAL SPLIT
    const centerX = screenW / 2;
    const leftEntities = entities.filter(e => e.center.x < centerX);
    const rightEntities = entities.filter(e => e.center.x >= centerX);

    console.log(`[Split] Left: ${leftEntities.length}, Right: ${rightEntities.length}`);

    // 1. Process My Crew (Left)
    // Usually a simple list.
    leftEntities.forEach(e => {
        const upper = e.text.toUpperCase();
        // Ignore purely structural text if possible, but for now grab names.
        // Filter noise
        if (e.text.toUpperCase().includes("CREW") && e.text.toUpperCase().includes("'S")) return; // "DODGE THE BULLET'S CREW"
        if (IGNORED.some(ig => upper.includes(ig))) return;
        if (upper.includes("VOICE") || upper.includes("CHANNEL")) return;

        results.push({
            name: e.cleanName,
            teamColor: 'Green', // User's team is usually Green/Cyan in UI
            teamName: 'My Crew',
            confidence: e.confidence,
            source: 'OCR',
            isTag: true
        });
    });

    // 2. Process Enemy Crews (Right)
    // Groups lines that are vertically close to each other into a "Card"
    const CLUSTER_THRESHOLD_Y = 30; // Tighter for Enemy Cards
    const clusters: { lines: any[], centerY: number }[] = [];

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

        // Pre-filter noise lines from the cluster (e.g. if noise got clustered in)
        const validLines = lines.filter(l => {
            const up = l.text.toUpperCase();
            return !IGNORED.some(ig => up.includes(ig)) && !up.includes("ENEMY CREW");
        });

        if (validLines.length === 0) return;

        if (validLines.length >= 2) {
            playerName = validLines[0].cleanName;
            teamName = validLines[1].cleanName;

            // Detection for Ship Type in second line
            if (validLines.length > 2) {
                const classLine = validLines.find(l => SHIP_TYPES.some(st => l.text.toUpperCase().includes(st)));
                if (classLine) shipType = classLine.cleanName;
            } else {
                if (SHIP_TYPES.some(st => validLines[1].text.toUpperCase().includes(st))) {
                    shipType = validLines[1].cleanName;
                }
            }
        } else {
            // Single line on right side? 
            // Could be a header "Enemy Crews" -> Ignore
            if (lines[0].text.toUpperCase().includes("ENEMY CREW")) return;

            // If it's just a ship name (colored), ignore? Or add as empty player?
            // Ideally we want Players.
            const text = lines[0].text.toUpperCase();
            if (SHIP_TYPES.some(st => text.includes(st)) || SHIP_NAME_KEYWORDS.some(k => text.includes(k))) {
                // It's a ship, no player
                console.log(`  [Cluster ${idx}] Skipped ship-only line: ${text}`);
                return;
            } else {
                playerName = lines[0].cleanName;
            }
        }

        if (playerName !== "Unknown" && playerName.length > 2) {
            console.log(`  [Cluster ${idx}] Matched Player: ${playerName} | Team: ${teamName} (${teamColor})`);
            results.push({
                name: playerName,
                teamColor: teamColor as any,
                teamName: teamName,
                shipType: shipType,
                confidence: 90,
                source: 'OCR',
                isTag: teamColor !== 'Unknown'
            });
        }
    });

    return results;

};

// ============================================================================
// DATA MOCK
// ============================================================================

// Mocking entities from Screenshot
// 1920x1080 resolution assumption
// Left Names: AlixThus, c0mbat_Barbi3, ScareQro, oSa1ad
// Right Names: NigthmareGMC, SHTER, JACR1907, gaowang134, etc.
// Ship Names: MURDER SPAGHURDER (Red), MEANR THAN AVG (Orange)

const mockEntities = [
    // LEFT SIDE
    { text: "AlixThus", cleanName: "AlixThus", color: 'Unknown', confidence: 95, center: { x: 400, y: 300 }, bbox: { y0: 290, y1: 310 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 320 }, bbox: { y0: 315, y1: 335 } }, // NOISE

    { text: "c0mbat_Barbi3", cleanName: "c0mbat_Barbi3", color: 'Unknown', confidence: 95, center: { x: 400, y: 400 }, bbox: { y0: 390, y1: 410 } },
    { text: "PARTY VOICE", cleanName: "PARTY VOICE", color: 'Green', confidence: 90, center: { x: 400, y: 420 }, bbox: { y0: 415, y1: 435 } },

    // RIGHT SIDE
    { text: "Enemy Crews", cleanName: "Enemy Crews", color: 'Unknown', confidence: 99, center: { x: 1400, y: 200 }, bbox: { y0: 190, y1: 210 } },

    // Card 1
    { text: "NigthmareGMC", cleanName: "NigthmareGMC", color: 'Unknown', confidence: 95, center: { x: 1400, y: 240 }, bbox: { y0: 230, y1: 250 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 265 }, bbox: { y0: 255, y1: 275 } }, // Gap 25px

    // Card 2
    { text: "SHTER", cleanName: "SHTER", color: 'Unknown', confidence: 95, center: { x: 1400, y: 300 }, bbox: { y0: 290, y1: 310 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 325 }, bbox: { y0: 315, y1: 335 } },

    // Card with noise?
    { text: "gaowang134", cleanName: "gaowang134", color: 'Unknown', confidence: 95, center: { x: 1400, y: 500 }, bbox: { y0: 490, y1: 510 } },
    { text: "MURDER SPAGHURDER", cleanName: "MURDER SPAGHURDER", color: 'Red', confidence: 95, center: { x: 1400, y: 525 }, bbox: { y0: 515, y1: 535 } },

    // Orange Team (MEANR THAN AVG)
    { text: "littleleaves", cleanName: "littleleaves", color: 'Unknown', confidence: 95, center: { x: 1400, y: 600 }, bbox: { y0: 590, y1: 610 } },
    { text: "MEANR THAN AVG", cleanName: "MEANR THAN AVG", color: 'Orange', confidence: 95, center: { x: 1400, y: 625 }, bbox: { y0: 615, y1: 635 } },
];

console.log("Running Simulation...");
const finalResults = processSimulation(mockEntities);
console.log("\nFinal Extracted Roster:");
console.log(JSON.stringify(finalResults, null, 2));
