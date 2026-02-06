/**
 * @module scanService
 * Screen capture analysis service. Handles:
 * - Result screen scanning (Win/Loss/Draw detection, time, damage)
 * - Lobby/crew hub scanning (player names, team colors, ship types)
 * - Tactical map scanning (reach modifiers, enemy ships)
 * Uses OCR via Electron bridge + fuzzy string matching for correction.
 */
import { UI_REACH_MODIFIERS } from './constants';
import { findClosestMatch, normalizeOcrText, isOcrNoise, cleanPlayerName, cleanMissionName } from './stringUtils';
import Logger from './logger';
import { ocrProcessCapture } from './electronBridge';

export interface ScanResult {
    result?: 'Win' | 'Loss' | 'Draw';
    time?: string;
    damage?: number;
    modifiers?: string[];
    rawText: string;
}

export type TeamColor = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple' | 'Cyan' | 'Unknown';

export interface LobbyScanResult {
    name: string;
    teamColor: TeamColor;
    confidence: number;
    source: 'OCR' | 'Manual';
    shipType?: string;
    teamName?: string;
    isTag?: boolean;
}

const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
const SHIP_NAME_KEYWORDS = ['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'DODGE', 'BULLET'];

export interface ScanOptions {
    onProgress?: (status: string, percentage: number) => void;
    mergeWith?: LobbyScanResult[];  // Existing players to merge with
}

export interface SmartScanResult {
    mode: 'Lobby' | 'Tactical' | 'MatchStats' | 'Social' | 'Unknown';
    lobbyData?: { players: LobbyScanResult[], modifiers: string[] };
    matchData?: ScanResult;
}

// Custom Windows OCR Types
interface WindowsOcrWord {
    Text: string;
    BoundingRect: {
        X: number;
        Y: number;
        Width: number;
        Height: number;
    };
}

interface WindowsOcrLine {
    Text: string;
    Words: WindowsOcrWord[];
}

interface WindowsOcrResult {
    Text: string;
    Lines: WindowsOcrLine[];
    TextAngle?: number;
}

export interface MLDetection {
    classId: number;
    score: number;
    bbox: [number, number, number, number];
}

// ============================================================================
// TYPE GUARDS FOR OCR DATA (Phase 2.2)
// ============================================================================

interface PlayerObject {
    name: string;
    confidence?: number;
}

interface ModifierObject {
    name: string;
    confidence?: number;
}

/** Type guard to check if a value is a PlayerObject (has name property) */
function isPlayerObject(p: unknown): p is PlayerObject {
    return typeof p === 'object' && p !== null && 'name' in p && typeof (p as PlayerObject).name === 'string';
}

/** Type guard to check if a value is a ModifierObject (has name property) */
function isModifierObject(m: unknown): m is ModifierObject {
    return typeof m === 'object' && m !== null && 'name' in m && typeof (m as ModifierObject).name === 'string';
}

/** Safely extract player name from string or object */
function getPlayerName(player: string | PlayerObject | unknown): string {
    if (typeof player === 'string') return player;
    if (isPlayerObject(player)) return player.name;
    return '';
}

/** Safely extract player confidence from string or object */
function getPlayerConfidence(player: string | PlayerObject | unknown, defaultValue: number): number {
    if (typeof player === 'string') return defaultValue;
    if (isPlayerObject(player)) return player.confidence ?? defaultValue;
    return defaultValue;
}

/** Safely extract modifier name from string or object */
function getModifierName(modifier: string | ModifierObject | unknown): string {
    if (typeof modifier === 'string') return modifier;
    if (isModifierObject(modifier)) return modifier.name;
    return '';
}

export const runMLDetection = async (dataUrl: string): Promise<MLDetection[]> => {
    try {
        const win = window as any;
        const electron = win.require?.('electron');
        if (!electron) return [];

        // Main process needs a file or a path. We'll save as temp if it's a dataURL.
        let pathToScan = dataUrl;
        if (dataUrl.startsWith('data:')) {
            pathToScan = await electron.ipcRenderer.invoke('save-ocr-debug', {
                dataUrl: dataUrl,
                filename: 'ml_temp_scan.png'
            });
        }

        const res = await electron.ipcRenderer.invoke('ml-scan', pathToScan);
        return res.detections || [];
    } catch (e) {
        console.error("ML Detection failed", e);
        return [];
    }
};

export const captureScreen = async (): Promise<{ dataUrl: string, filename: string } | null> => {
    Logger.startTimer('capture', 'OCR', 'Screen Capture');
    try {
        const win = window as any;
        const electron = win.require?.('electron');
        const ipcRenderer = electron?.ipcRenderer;
        if (!ipcRenderer) throw new Error("IPC not found");

        // Use Main process for capture to avoid renderer permissions/version issues
        // Use Main process for capture and OCR
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        Logger.endTimer('capture');

        if (dataUrl) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `capture_${timestamp}.png`;
            // Keep debug save
            ipcRenderer.invoke('save-ocr-debug', { dataUrl, filename });
            return { dataUrl, filename };
        }
        throw new Error("Capture returned empty data");
    } catch (e) {
        Logger.error('OCR', 'Screen capture failed', e);
        Logger.endTimer('capture');
        throw e;
    }
};

// ============================================================================
// COLOR DETECTION
// ============================================================================

const getTeamColor = (r: number, g: number, b: number): TeamColor => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lum = (max + min) / 2;

    if (delta < 20) return 'Unknown';
    if (lum < 30) return 'Unknown';

    let hue = 0;
    if (delta === 0) hue = 0;
    else if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;

    if (hue >= 340 || hue < 15) return 'Red';
    if (hue >= 15 && hue < 45) return 'Orange';
    if (hue >= 45 && hue < 75) return 'Yellow';
    if (hue >= 75 && hue < 150) return 'Green';
    if (hue >= 150 && hue < 210) return 'Cyan';
    if (hue >= 210 && hue < 270) return 'Blue';
    if (hue >= 270 && hue < 340) return 'Purple';

    return 'Unknown';
};

const sampleRegion = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): TeamColor => {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > ctx.canvas.width) w = ctx.canvas.width - x;
    if (y + h > ctx.canvas.height) h = ctx.canvas.height - y;

    if (w <= 0 || h <= 0) return 'Unknown';

    try {
        const data = ctx.getImageData(x, y, w, h).data;
        let bestColor: TeamColor = 'Unknown';
        let maxSaturation = 0;

        // High density sampling to avoid missing thin font lines
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max - min;

            if (saturation > 35) { // Lowered threshold slightly
                const c = getTeamColor(r, g, b);
                if (c !== 'Unknown') {
                    if (saturation > maxSaturation) {
                        maxSaturation = saturation;
                        bestColor = c;
                    }
                }
            }
        }
        return bestColor;
    } catch (e) {
        return 'Unknown';
    }
};

// ============================================================================
// OCR UTILITIES
// ============================================================================

export interface OCRLine {
    text: string;
    words: any[];
    bbox: { x0: number, y0: number, x1: number, y1: number };
}

/**
 * Groups raw OCR words into lines based on vertical proximity.
 */
export const groupWordsIntoLines = (words: any[], threshold = 12): OCRLine[] => {
    if (!words || words.length === 0) return [];

    // Sort by Y coordinate
    const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const lines: OCRLine[] = [];

    sorted.forEach(word => {
        const midY = (word.bbox.y0 + word.bbox.y1) / 2;
        let foundLine = lines.find(line => {
            const lineMidY = (line.bbox.y0 + line.bbox.y1) / 2;
            return Math.abs(midY - lineMidY) < threshold;
        });

        if (foundLine) {
            foundLine.words.push(word);
            // Expand bbox
            foundLine.bbox.x0 = Math.min(foundLine.bbox.x0, word.bbox.x0);
            foundLine.bbox.y0 = Math.min(foundLine.bbox.y0, word.bbox.y0);
            foundLine.bbox.x1 = Math.max(foundLine.bbox.x1, word.bbox.x1);
            foundLine.bbox.y1 = Math.max(foundLine.bbox.y1, word.bbox.y1);
        } else {
            lines.push({
                text: '', // To be joined
                words: [word],
                bbox: { ...word.bbox }
            });
        }
    });

    // Join text and sort words horizontally
    lines.forEach(line => {
        line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        line.text = line.words.map(w => w.text).join(' ');
    });

    return lines;
};

// ============================================================================
// MODIFIER DETECTION
// ============================================================================

const detectModifiers = (text: string): string[] => {
    const upperText = text.toUpperCase();
    const found: string[] = [];
    UI_REACH_MODIFIERS.forEach(mod => {
        const cleanedMod = cleanMissionName(mod).toUpperCase();
        if (upperText.includes(cleanedMod)) {
            found.push(mod);
        } else if (mod.startsWith("Artifact: ")) {
            const suffix = mod.split(": ")[1].toUpperCase();
            // Use word boundaries for short suffixes to avoid "VOICE" matching "ICE"
            const regex = new RegExp(`\\b${suffix}\\b`, 'i');
            if (regex.test(text)) found.push(mod);
        }
    });
    return found;
};

export const cropImageDataUrl = async (dataUrl: string, bbox: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const [x0, y0, x1, y1] = bbox;
            const width = Math.max(1, x1 - x0);
            const height = Math.max(1, y1 - y0);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, x0, y0, width, height, 0, 0, width, height);
            }
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
    });
};

// ============================================================================
// IMAGE PREPROCESSING
// ============================================================================

export const preprocessImage = async (dataUrl: string, scale: number = 1, invert: boolean = false): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Simple Pass-Through if no scaling or filtering needed
        // Note: We almost always want scaling/contrast now
        if (scale === 1 && !invert) {
            resolve(dataUrl);
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const width = Math.floor(img.width * scale);
            const height = Math.floor(img.height * scale);

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(dataUrl);
                return;
            }

            // High Performance Canvas Filters
            // Boost contrast to help OCR on dark backgrounds
            const contrast = 1.3;
            // Removed grayscale per user feedback/issue
            ctx.filter = `contrast(${contrast})`;
            if (invert) ctx.filter += ' invert(1)';

            // Nearest Neighbor for UI text is usually sharper than Bilinear
            ctx.imageSmoothingEnabled = false;

            // Draw scaled
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            console.error("Image load failed in preprocessing", e);
            resolve(dataUrl); // Fallback to original
        };
        img.src = dataUrl;
    });
};

// ============================================================================
// OCR WRAPPERS
// ============================================================================

const mapWindowsOcrToTesseract = (winResult: WindowsOcrResult) => {
    const words: any[] = [];
    winResult.Lines?.forEach(line => {
        line.Words?.forEach(w => {
            words.push({
                text: w.Text,
                confidence: 90, // Native OCR doesn't provide per-word confidence in this wrapper
                bbox: {
                    x0: w.BoundingRect.X,
                    y0: w.BoundingRect.Y,
                    x1: w.BoundingRect.X + w.BoundingRect.Width,
                    y1: w.BoundingRect.Y + w.BoundingRect.Height
                }
            });
        });
    });
    return {
        text: winResult.Text,
        words: words,
        confidence: 90
    };
};

const runNativeOCR = async (imagePath: string): Promise<any> => {
    const win = window as any;
    const electron = win.require ? win.require('electron') : null;
    if (!electron) throw new Error("Electron not found");
    const result = await electron.ipcRenderer.invoke('ocr-scan', imagePath);

    // Normalize text and apply common fixes to the result object
    if (result) {
        result.Text = normalizeOcrText(result.Text || '');
        result.Lines?.forEach((line: any) => {
            line.Text = normalizeOcrText(line.Text || '');
        });
    }

    return mapWindowsOcrToTesseract(result);
};

// ============================================================================
// MATCH STATS OCR
// ============================================================================

export const processMatchScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<ScanResult> => {
    const { onProgress } = options;
    const win = window as any;
    const electron = win.require?.('electron');
    const ipc = electron?.ipcRenderer;
    if (!ipc) throw new Error("IPC not available");

    Logger.startTimer('matchOCR', 'OCR', 'Match Stats Processing');
    onProgress?.('Initializing OCR...', 10);

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `match_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: imageDataUrl, filename });

        onProgress?.('Analyzing match screen...', 30);
        const ret = await runNativeOCR(absPath);
        const text = ret.text;

        onProgress?.('Extracting match data...', 80);
        const result: ScanResult = { rawText: text, modifiers: [] };

        if (/VICTORY|WIN/i.test(text)) result.result = 'Win';
        else if (/DEFEAT|LOSS|LOSE/i.test(text)) result.result = 'Loss';
        else if (/DRAW|TIE/i.test(text)) result.result = 'Draw';

        const timeMatch = text.match(/\b([0-5]?\d):([0-5]\d)\b/);
        if (timeMatch) result.time = timeMatch[0];

        const dmgMatch = text.match(/Damage Taken\s*[:\-\|]?\s*(\d+)/i);
        if (dmgMatch) result.damage = parseInt(dmgMatch[1]);

        result.modifiers = detectModifiers(text);

        onProgress?.('Complete', 100);
        Logger.endTimer('matchOCR');
        return result;
    } catch (e) {
        Logger.error('OCR', 'Match screenshot processing failed', e);
        Logger.endTimer('matchOCR');
        return { rawText: '', modifiers: [] };
    }
};

// ============================================================================
// LOBBY SCAN
// ============================================================================

export const processLobbyScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[], modifiers: string[] }> => {
    const { onProgress, mergeWith } = options;
    Logger.startTimer('lobbyOCR', 'OCR', 'Lobby Scan');
    onProgress?.('Initializing Lobby Scan...', 0);

    const win = window as any;
    const electron = win.require?.('electron');
    const ipc = electron?.ipcRenderer;
    if (!ipc) throw new Error("IPC not available");

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // SAVE RAW INPUT
        ipc.invoke('save-ocr-debug', {
            dataUrl: imageDataUrl,
            filename: `lobby_input_raw_${timestamp}.png`
        });

        // 1. Load Original Image
        const imgOriginal = new Image();
        imgOriginal.src = imageDataUrl;
        await new Promise((resolve, reject) => {
            imgOriginal.onload = resolve;
            imgOriginal.onerror = reject;
        });

        const screenW = imgOriginal.width;
        const screenH = imgOriginal.height;

        onProgress?.('ML Region Localization...', 10);

        let activeImage = imageDataUrl;
        let cropOffset = { x: 0, y: 0 };
        let cropRegion: [number, number, number, number] = [0, 0, 0, 0];
        let mlSuccess = false;

        // 2. ML Detection with Fallback Priority
        try {
            const detections = await runMLDetection(imageDataUrl);
            const rosterBox = detections.find(d => (d.classId === 0 || d.classId === 7) && d.score > 0.35);

            // DEBUG: Force Fallback if user reported success with it (Ent:23)
            // We condition on rosterBox presence but prioritize the known-good Fallback for this debug session
            if (false && rosterBox) {
                onProgress?.('Focusing on detected roster (ML)...', 15);
                const padding = 30;
                const imgW = (detections[0] as any)?.sourceWidth || screenW;
                const imgH = (detections[0] as any)?.sourceHeight || screenH;

                const x0 = Math.max(0, rosterBox!.bbox[0] - padding);
                const y0 = Math.max(0, rosterBox!.bbox[1] - padding);
                const x1 = Math.min(imgW, rosterBox!.bbox[2] + padding);
                const y1 = Math.min(imgH, rosterBox!.bbox[3] + padding);

                cropRegion = [x0, y0, x1, y1];
                activeImage = await cropImageDataUrl(imageDataUrl, cropRegion);
                cropOffset = { x: x0, y: y0 };
                mlSuccess = true;
            } else {
                throw new Error("Force Fallback or No ML");
            }
        } catch (mlErr) {
            // Fallback: Safe Center Crop
            onProgress?.('Focusing on roster area (Fallback)...', 15);
            const safeBox: [number, number, number, number] = [
                Math.floor(screenW * 0.05),
                Math.floor(screenH * 0.10),
                Math.floor(screenW * 0.95),
                Math.floor(screenH * 0.95)
            ];

            cropRegion = safeBox;
            activeImage = await cropImageDataUrl(imageDataUrl, safeBox);
            cropOffset = { x: safeBox[0], y: safeBox[1] };
        }

        onProgress?.('Preprocessing image...', 20);
        const processedImage = await preprocessImage(activeImage, 2.0);
        const processingTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `lobby_region_scan_${processingTimestamp}.png`;
        ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename });

        onProgress?.('Scanning for players...', 30);
        // Save for Native OCR
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename: `ocr_input_${processingTimestamp}.png` });
        const ret = await runNativeOCR(absPath);
        const fullTextRaw = ret.text;
        const detectedModifiers = detectModifiers(fullTextRaw);

        // Color analysis setup
        const canvas = document.createElement('canvas');
        canvas.width = screenW; canvas.height = screenH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context failed");
        ctx.drawImage(imgOriginal, 0, 0);

        const rawLines = groupWordsIntoLines(ret.words || [], 20);

        type ScannedEntity = {
            id: number;
            text: string;
            cleanName: string;
            color: TeamColor;
            bbox: { x0: number, y0: number, x1: number, y1: number };
            center: { x: number, y: number };
            isTag: boolean;
            confidence: number;
        };

        const entities: ScannedEntity[] = rawLines.map((l, idx) => {
            // Map Coordinates
            // Local OCR (scaled 2x) -> Local Descaled -> Global (+ cropXY)
            const localX0 = l.bbox.x0 / 2.0;
            const localY0 = l.bbox.y0 / 2.0;
            const localX1 = l.bbox.x1 / 2.0;
            const localY1 = l.bbox.y1 / 2.0;

            const globalBox = {
                x0: localX0 + cropOffset.x,
                y0: localY0 + cropOffset.y,
                x1: localX1 + cropOffset.x,
                y1: localY1 + cropOffset.y
            };

            const w = globalBox.x1 - globalBox.x0;
            const h = globalBox.y1 - globalBox.y0;
            const color = sampleRegion(ctx, globalBox.x0, globalBox.y0, w, h);

            let cleanText = l.text.replace(/YOUR VOICE:?\s*ON/gi, '')
                .replace(/PARTY VOICE/gi, '')
                .replace(/[\]\[]+$/g, '');

            const nameCandidate = cleanText.replace(/[^\w\s\u00C0-\u00FF\u3000-\u30FF\u4E00-\u9FA5]/g, '').trim();

            return {
                id: idx,
                text: l.text,
                cleanName: nameCandidate.length > 0 ? nameCandidate : "Unknown Entity",
                color,
                bbox: globalBox,
                center: { x: (globalBox.x0 + globalBox.x1) / 2, y: (globalBox.y0 + globalBox.y1) / 2 },
                isTag: color !== 'Unknown',
                confidence: l.words[0].confidence
            };
        });

        const IGNORED = [
            'LEVEL', 'READY', 'LOBBY', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'PLAYER', 'SEARCH', 'VOTE', 'PING', 'REGION', 'SHIP', 'CREW', 'HUB', 'VOICE', 'MIC', 'MUTE', 'OPTIONS', 'BACK', 'XP', 'SC', 'MC',
            'HOP INTO THE SAME VOICE', 'PUSHTO TALK', 'TEAM VOICE', 'SWITCH VOICE', 'DISABLE VOICE', 'CHANNEL', 'TALK', 'OPEN MIC', 'HOLD TO TALK'
        ];

        const results: LobbyScanResult[] = [];

        // REGIONAL SPLIT
        const centerX = screenW / 2;
        const leftEntities = entities.filter(e => e.center.x < centerX);
        const rightEntities = entities.filter(e => e.center.x >= centerX);

        // Helper to check if text is ignored using word boundaries
        const isIgnored = (text: string) => {
            const up = text.toUpperCase();
            // Specific check for "CREW" headers first
            if (up.includes("CREW") && up.includes("'S")) return true;
            if (up.includes("VOICE") || up.includes("CHANNEL")) return true;

            return IGNORED.some(ig => {
                // Use word boundaries for everything to be safe.
                return new RegExp(`\\b${ig}\\b`).test(up);
            });
        };

        // 1. Process My Crew (Left)
        // Usually a simple list.
        leftEntities.forEach(e => {
            if (isIgnored(e.text)) return;

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

        // Process Clusters
        clusters.forEach(cluster => {
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
                return !isIgnored(l.text) && !up.includes("ENEMY CREW");
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
                const text = validLines[0].text.toUpperCase();
                if (SHIP_TYPES.some(st => text.includes(st)) || SHIP_NAME_KEYWORDS.some(k => text.includes(k))) {
                    return;
                } else {
                    playerName = validLines[0].cleanName;
                }
            }

            // Re-calc color from filtered lines to be safe
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

        // Debug Log
        // console.log("Lobby Scan Results:", results);

        Logger.endTimer('lobbyOCR');
        onProgress?.('Complete', 100);
        return { players: results, modifiers: detectedModifiers };

    } catch (e) {
        Logger.error('OCR', 'Lobby scan fatal error', e);
        return { players: [], modifiers: [] };
    }
};

// ============================================================================
// SOCIAL SCAN
// ============================================================================

export const processSocialScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[] }> => {
    const { onProgress } = options;
    const win = window as any;
    const electron = win.require?.('electron');
    const ipc = electron?.ipcRenderer;
    if (!ipc) throw new Error("IPC not available");

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `social_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: imageDataUrl, filename });

        const ret = await runNativeOCR(absPath);
        const players: LobbyScanResult[] = [];

        if (ret.words) {
            let inPartySection = false;
            ret.words.forEach((word: any) => {
                const upper = word.text.toUpperCase();
                if (upper === 'PARTY' || upper === 'MEMBERS') { inPartySection = true; return; }
                if (upper === 'WILDGATE' || upper === 'FRIENDS') { inPartySection = false; return; }
                if (inPartySection && word.text.length > 2) {
                    const cleaned = cleanPlayerName(word.text);
                    if (isOcrNoise(cleaned)) return;
                    if (/IN|LOBBY|JOIN|LEAVE|ONLINE|OFFLINE|VOICE|STATUS|INVITE/i.test(cleaned)) return;
                    players.push({ name: cleaned, teamColor: 'Green', confidence: word.confidence, source: 'OCR' });
                }
            });
        }
        return { players };
    } catch (e) {
        Logger.error('OCR', 'Social scan failed', e);
        return { players: [] };
    }
};

// ============================================================================
// TACTICAL SCAN
// ============================================================================

export const processTacticalScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[], modifiers: string[] }> => {
    const { onProgress, mergeWith } = options;
    const win = window as any;
    const electron = win.require?.('electron');
    const ipc = electron?.ipcRenderer;
    if (!ipc) throw new Error("IPC not available");

    try {
        const processedImage = await preprocessImage(imageDataUrl, 2.5, true);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tactical_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename });

        const ret = await runNativeOCR(absPath);
        const fullTextRaw = ret.text;
        const detectedModifiers = detectModifiers(fullTextRaw);

        const img = new Image();
        img.src = imageDataUrl;
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { players: mergeWith || [], modifiers: detectedModifiers };
        ctx.drawImage(img, 0, 0);

        const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'RESET', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'BACK', 'IFBICD20', 'MCP SEED', 'HEALTH / 100', 'TOGGLE CURSOR', 'TAB CLOSE', 'LOST BATTLESHIP', 'COM STATION', 'CREW HUB', 'TACTICAL', 'SHIPS', 'HAZARDS'];
        const HUD_PHRASES = [
            'VOICE CHANNEL', 'PUSHTO TALK', 'VOICE OPTIONS', 'HOP INTO THE SAME VOICE',
            'CHANGE VOICE OPTIONS', 'SHIELDS DOWN', 'PINGED A LOCATION', 'SPECIAL LOOT',
            'ARTIFACT SPECIAL', 'YOUR VOICE: ON', 'TACTICAL:', 'HAZARDS',
            'RNCP SEECI', 'IFBTCD20', 'YOUR VOICE: OFF', 'MCP SEED',
            'CREW HUB', 'HOLD TO TALK', 'OPEN MIC', 'VOICE SETTINGS',
            'HEALTH / 100', 'SHIELDS', 'SIZE'
        ];

        const NOISE_REGEX = /RNCP|SEECI|IFBTCD|MCP|SEED|IFB|[^a-zA-Z0-9\s\[\]]/i;

        // SCALE ADAPTATION:
        // Image is 2.5x larger. All pixel thresholds must be scaled x2.5.
        // Grouping: ~12px * 2.5 = 30px
        const lines = groupWordsIntoLines(ret.words || [], 30);
        const players: LobbyScanResult[] = [];

        const screenW = img.width;
        const screenH = img.height;

        // 1. Identify Regions
        const middleX0 = screenW * 0.4; // widened exclude zone
        const middleX1 = screenW * 1.6;
        const middleY0 = screenH * 0.4;
        const middleY1 = screenH * 1.6;

        // TOP-LEFT USER AREA (Ignore user's own ship info for noise reduction)
        const topLeftX = screenW * 0.6; // Scale down
        const topLeftY = screenH * 0.4;

        // 2. Classify & Filter Lines
        const nameLines: OCRLine[] = [];

        lines.forEach(line => {
            const upper = line.text.toUpperCase();
            // Strict length check for noise (unless it looks like a known tag)
            if (line.text.length < 3 && !/VS|TM/.test(upper)) return;

            if (IGNORED.includes(upper)) return;
            if (HUD_PHRASES.some(phrase => upper.includes(phrase))) return;
            if (NOISE_REGEX.test(upper) && upper.length < 5) return; // Strict noise filter for short junk

            // Region Exclusion: Ignore Map Center
            const cx = (line.bbox.x0 + line.bbox.x1) / 2;
            const cy = (line.bbox.y0 + line.bbox.y1) / 2;

            if (cx > middleX0 && cx < middleX1 && cy > middleY0 && cy < middleY1) {
                return;
            }

            // Region Exclusion: Ignore Top-Left User Info
            if (cx < topLeftX && cy < topLeftY) {
                return;
            }

            if (line.text.length > 2 && !/READY|LOBBY|MATCH/i.test(line.text)) {
                // If it doesn't look like a ship type (we rely on telemetry for that)
                const isShip = SHIP_TYPES.some(st => upper.includes(st)) || /MURDER|SPAGHURDER|MEANR|THAN|AVG/.test(upper);

                // Explicitly ignore Reach Modifiers (they often appear in the tactical list area)
                const isModifier = UI_REACH_MODIFIERS.some(mod => upper.includes(mod.toUpperCase())) ||
                    /ARTIFACT[:\s]|MODIFIER[:\s]/.test(upper);

                if (!isShip && !isModifier) {
                    nameLines.push(line);
                }
            }
        });

        // 2.5 Secondary Pass for Team Headers
        const teamHeaderLines = lines.filter(l => {
            const u = l.text.toUpperCase();
            return (u.includes('TEAM') || u.includes('SQUAD')) && !IGNORED.includes(u);
        });

        // 2. Associate & Sample

        // MIXED SORT: Combine Players and Headers to process Top-Down
        // This ensures typically "TEAM 1" appears before "Player A" in the list
        const allItems = [
            ...nameLines.map(l => ({ type: 'PLAYER', ...l })),
            ...teamHeaderLines.map(l => ({ type: 'HEADER', ...l }))
        ].sort((a, b) => a.bbox.y0 - b.bbox.y0);

        let currentTeamHeader: string | undefined = undefined;

        allItems.forEach(item => {
            if (item.type === 'HEADER') {
                currentTeamHeader = item.text;
                return;
            }

            // It's a PLAYER
            const nameLine = item as OCRLine;
            const bbox = nameLine.bbox;

            // SCALE CORRECTION: 2.0x
            const cx = (bbox.x0 + bbox.x1) / 2;
            const cy = (bbox.y0 + bbox.y1) / 2;

            // Sample color: Strictly Left of the name (Icon/Bar Position)
            // 25px left of start, centered vertically on text
            // sampling a 12x12 block
            // x0 is scaled. Original x0 = x0 / 2.
            // Using slightly wider search for color if exact point fails
            let color = sampleRegion(ctx, Math.floor(bbox.x0 / 2) - 25, cy - 6, 12, 12);

            if (color === 'Unknown') {
                color = sampleRegion(ctx, Math.floor(bbox.x0 / 2) - 40, cy - 6, 12, 12);
            }

            if (color !== 'Unknown' || currentTeamHeader) {
                players.push({
                    name: nameLine.text,
                    teamColor: color as TeamColor,
                    teamName: currentTeamHeader || 'Unknown',
                    confidence: nameLine.words[0]?.confidence || 1.0,
                    source: 'OCR'
                });
            }
        });

        return { players, modifiers: detectedModifiers };

    } catch (e) {
        Logger.error('OCR', 'Tactical scan failed', e);
        return { players: [], modifiers: [] };
    }
};

// ============================================================================
// NEW TESSERACT-BASED OCR (eng+chi_sim support)
// ============================================================================

/**
 * Process screenshot using new Tesseract OCR with Chinese support
 * This uses the redesigned region-based extraction with dynamic user anchor
 */
export const processWithTesseractOCR = async (
    imageDataUrl: string,
    activeUser: string | null,
    options: ScanOptions = {}
): Promise<SmartScanResult> => {
    const { onProgress } = options;

    try {
        onProgress?.('Running Tesseract OCR (eng+chi_sim)...', 20);

        // Extract base64 from data URL
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

        // Call our new OCR handler with activeUser anchor
        const ocrResponse = await ocrProcessCapture(base64Data, activeUser);

        if (!ocrResponse.success || !ocrResponse.data) {
            Logger.warn('OCR', 'Tesseract OCR failed, falling back to native');
            return { mode: 'Unknown' };
        }

        const ocrData = ocrResponse.data;
        onProgress?.('Processing OCR results...', 60);

        // Convert OCR result to SmartScanResult format
        if (ocrData.screenshotType === 'crew_hub') {
            const players: LobbyScanResult[] = [];

            // Add teammates (from your team) - using type-safe helpers
            (ocrData.teammates || []).forEach(t => {
                const name = getPlayerName(t);
                if (name && name.length > 2) {
                    players.push({
                        name,
                        teamColor: 'Cyan', // User's team color
                        teamName: ocrData.playerTeamName || 'My Crew',
                        confidence: getPlayerConfidence(t, 80),
                        source: 'OCR',
                        isTag: true,
                    });
                }
            });

            // Add opponents (from enemy teams) - using type-safe helpers
            (ocrData.opponentTeams || []).forEach(team => {
                const teamColor = mapTeamColor(team.color);
                (team.players || []).forEach(p => {
                    const name = getPlayerName(p);
                    if (name && name.length > 2) {
                        players.push({
                            name,
                            teamColor,
                            teamName: team.teamName || 'Enemy',
                            shipType: team.shipType,
                            confidence: getPlayerConfidence(p, 75),
                            source: 'OCR',
                            isTag: teamColor !== 'Unknown',
                        });
                    }
                });
            });

            // Extract modifiers - using type-safe helper
            const modifiers = (ocrData.reachModifiers || []).map(m => getModifierName(m)).filter(Boolean);

            onProgress?.('Complete', 100);
            return {
                mode: 'Lobby',
                lobbyData: { players, modifiers },
            };
        }

        if (ocrData.screenshotType === 'tactical_map') {
            const players: LobbyScanResult[] = [];

            // Add teammates from map screen - using type-safe helpers
            (ocrData.teammates || []).forEach(t => {
                const name = getPlayerName(t);
                if (name && name.length > 2) {
                    players.push({
                        name,
                        teamColor: 'Green',
                        teamName: ocrData.playerTeamName || 'My Crew',
                        confidence: getPlayerConfidence(t, 70),
                        source: 'OCR',
                    });
                }
            });

            // Add opponents from enemy ships info
            (ocrData.opponentTeams || []).forEach(team => {
                const teamColor = mapTeamColor(team.color);
                // Map screen doesn't have individual player names, just team info
                // Create placeholder for the team
                if (team.teamName && team.teamName !== 'Unknown Team') {
                    players.push({
                        name: `[${team.teamName}]`,
                        teamColor,
                        teamName: team.teamName,
                        shipType: team.shipType,
                        confidence: team.confidence || 70,
                        source: 'OCR',
                        isTag: true,
                    });
                }
            });

            // Extract modifiers/hazards - using type-safe helper
            const modifiers = [
                ...(ocrData.reachModifiers || []).map(m => getModifierName(m)).filter(Boolean),
                ...((ocrData as any).hazards || []),
            ];

            onProgress?.('Complete', 100);
            return {
                mode: 'Tactical',
                lobbyData: { players, modifiers },
            };
        }

        // Unknown screen type - extract what we can - using type-safe helper
        const modifiers = (ocrData.reachModifiers || []).map(m => getModifierName(m)).filter(Boolean);

        if (modifiers.length > 0) {
            return {
                mode: 'Unknown',
                lobbyData: { players: [], modifiers },
            };
        }

        return { mode: 'Unknown' };

    } catch (e) {
        Logger.error('OCR', 'Tesseract OCR processing failed', e);
        return { mode: 'Unknown' };
    }
};

/**
 * Map internal color names to TeamColor type
 */
const mapTeamColor = (color: string | undefined): TeamColor => {
    switch (color?.toLowerCase()) {
        case 'red': return 'Red';
        case 'orange': return 'Orange';
        case 'yellow': return 'Yellow';
        case 'yellowgreen': return 'Yellow'; // Map yellowGreen to Yellow
        case 'green': return 'Green';
        case 'cyan': return 'Cyan';
        case 'blue': return 'Blue';
        case 'purple': return 'Purple';
        default: return 'Unknown';
    }
};

// ============================================================================
// SMART ANALYSIS
// ============================================================================

export const smartAnalyzeScreen = async (
    imageDataUrl: string,
    options: ScanOptions = {},
    activeUser: string | null = null
): Promise<SmartScanResult> => {
    const { onProgress, mergeWith } = options;
    const win = window as any;
    const electron = win.require?.('electron');
    const ipc = electron?.ipcRenderer;
    if (!ipc) throw new Error("IPC not available");

    Logger.startTimer('smartOCR', 'OCR', 'Smart Hybrid Analysis');

    // =====================================================================
    // PRIMARY: Try new Tesseract OCR with Chinese support first
    // =====================================================================
    onProgress?.('Analyzing with Tesseract (eng+chi_sim)...', 10);

    try {
        const tesseractResult = await processWithTesseractOCR(imageDataUrl, activeUser, options);

        // If Tesseract found useful data, use it
        if (tesseractResult.mode !== 'Unknown' &&
            tesseractResult.lobbyData &&
            (tesseractResult.lobbyData.players.length > 0 || tesseractResult.lobbyData.modifiers.length > 0)) {

            Logger.info('OCR', `Tesseract OCR succeeded: ${tesseractResult.mode} mode, ${tesseractResult.lobbyData.players.length} players`);
            Logger.endTimer('smartOCR');
            return tesseractResult;
        }

        Logger.info('OCR', 'Tesseract found no data, falling back to ML + Native OCR');
    } catch (tesseractError) {
        Logger.warn('OCR', 'Tesseract OCR failed, falling back to ML + Native OCR', tesseractError);
    }

    // =====================================================================
    // FALLBACK: Original ML + Native OCR pipeline
    // =====================================================================
    onProgress?.('Fallback: Locating UI regions (ML)...', 30);

    try {
        const detections = await runMLDetection(imageDataUrl);
        const classNames = ['LobbyRoster', 'KillFeed', 'Timer', 'ReachModifiers', 'SelfStats', 'ShipType', 'ShipName', 'IngameRoster', 'ProspectorIcon'];

        detections.forEach(d => {
            console.log(`[SmartScan] ML Found ${classNames[d.classId] || d.classId} (${(d.score * 100).toFixed(1)}%)`);
        });

        const hasLobbyRoster = detections.some(d => d.classId === 0 && d.score > 0.35);
        const hasIngameRoster = detections.some(d => d.classId === 7 && d.score > 0.35);

        if (hasLobbyRoster || hasIngameRoster) {
            onProgress?.('Roster detected. Scanning...', 50);
            const data = await processLobbyScreenshot(imageDataUrl, options);
            return { mode: 'Lobby', lobbyData: data };
        }

        // Fallback Regional
        onProgress?.('Fallback: Regional scan...', 20);
        const img = new Image();
        img.src = imageDataUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });

        const fallbackRegions = [
            { name: 'Center', bbox: [0.25, 0.2, 0.75, 0.8] },
            { name: 'TopLeft', bbox: [0.0, 0.0, 0.4, 0.2] }
        ];

        let combinedText = "";
        for (const region of fallbackRegions) {
            const x = Math.floor(region.bbox[0] * img.width);
            const y = Math.floor(region.bbox[1] * img.height);
            const w = Math.floor((region.bbox[2] - region.bbox[0]) * img.width);
            const h = Math.floor((region.bbox[3] - region.bbox[1]) * img.height);

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(w * 2.0);
            canvas.height = Math.floor(h * 2.0);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.filter = 'contrast(1.4) grayscale(1)';
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
                const regionUrl = canvas.toDataURL('image/png');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: regionUrl, filename: `fallback_${region.name}_${timestamp}.png` });
                const ret = await runNativeOCR(absPath);
                combinedText += " " + (ret.text || "");
            }
        }

        const text = combinedText.toUpperCase();
        if (/DAMAGE TAKEN|VICTORY|DEFEAT|DRAW|TIE/i.test(text)) {
            return { mode: 'MatchStats', matchData: await processMatchScreenshot(imageDataUrl, options) };
        }
        if (text.includes("CREW HUB") || text.includes("SEARCHING") || text.includes("LOBBY") || text.includes("READY")) {
            const lobbyData = await processLobbyScreenshot(imageDataUrl, { ...options, mergeWith: [] });
            if (text.includes("CREW HUB")) {
                lobbyData.players.forEach(p => { if (p.teamColor === 'Unknown') p.teamColor = 'Cyan'; });
            }
            return { mode: 'Lobby', lobbyData };
        }
        if (text.includes("SOCIAL") || text.includes("PARTY") || text.includes("MEMBERS")) {
            const socialData = await processSocialScreenshot(imageDataUrl, options);
            if (socialData.players.length > 0) return { mode: 'Social', lobbyData: { players: socialData.players, modifiers: [] } };
        }

        if (text.length > 50) {
            const tacticalData = await processTacticalScreenshot(imageDataUrl, options);
            if (tacticalData.players.length > 0) return { mode: 'Tactical', lobbyData: tacticalData };
        }

        Logger.endTimer('smartOCR');
        return { mode: 'Unknown' };

    } catch (e) {
        Logger.error('OCR', 'Smart analysis failed', e);
        return { mode: 'Unknown' };
    }
};

export const terminateOCR = async () => {
    // No longer needed for native OCR
};
