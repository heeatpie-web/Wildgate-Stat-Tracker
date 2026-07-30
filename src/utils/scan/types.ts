/**
 * @module scan/types
 * Shared type definitions for the scan pipeline.
 */

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

export interface ScanOptions {
    onProgress?: (status: string, percentage: number) => void;
    mergeWith?: LobbyScanResult[];
    ocrMode?: 'local' | 'cloud' | 'both' | 'hybrid-plus';
    ocrCalibration?: OcrCalibration;
    ocrRegions?: OcrRegionSettings;
}

export interface OcrCalibration {
    sampleOffsetX: number;
    sampleOffsetY: number;
    sampleWidthAdjust: number;
    sampleHeightAdjust: number;
    saturationMin: number;
    luminanceMin: number;
}

export interface OcrRegionBounds {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface OcrRegionSettings {
    crewHub: {
        leftPanel: OcrRegionBounds;
        enemyPanel: OcrRegionBounds;
        teamHeader: OcrRegionBounds;
        enemyName: OcrRegionBounds;
    };
    mapScreen: {
        yourShip: OcrRegionBounds;
        enemyShips: OcrRegionBounds;
        enemyShips2: OcrRegionBounds;
        enemyShips3: OcrRegionBounds;
        enemyShips4: OcrRegionBounds;
        hazards: OcrRegionBounds;
        players: OcrRegionBounds;
    };
}

export interface SmartScanResult {
    mode: 'Lobby' | 'Tactical' | 'MatchStats' | 'Social' | 'Unknown';
    lobbyData?: { players: LobbyScanResult[], modifiers: string[] };
    matchData?: ScanResult;
    mapType?: string | null;
}

export interface OCRLine {
    text: string;
    words: any[];
    bbox: { x0: number, y0: number, x1: number, y1: number };
}

// Windows OCR interop types
export interface WindowsOcrWord {
    Text: string;
    BoundingRect: { X: number; Y: number; Width: number; Height: number };
}

export interface WindowsOcrLine {
    Text: string;
    Words: WindowsOcrWord[];
}

export interface WindowsOcrResult {
    Text: string;
    Lines: WindowsOcrLine[];
    TextAngle?: number;
}

// Type guard helpers for OCR data
interface PlayerObject { name: string; confidence?: number; }
interface ModifierObject { name: string; confidence?: number; }

export function isPlayerObject(p: unknown): p is PlayerObject {
    return typeof p === 'object' && p !== null && 'name' in p && typeof (p as PlayerObject).name === 'string';
}

export function isModifierObject(m: unknown): m is ModifierObject {
    return typeof m === 'object' && m !== null && 'name' in m && typeof (m as ModifierObject).name === 'string';
}

export function getPlayerName(player: string | PlayerObject | unknown): string {
    if (typeof player === 'string') return player;
    if (isPlayerObject(player)) return player.name;
    return '';
}

export function getPlayerConfidence(player: string | PlayerObject | unknown, defaultValue: number): number {
    if (typeof player === 'string') return defaultValue;
    if (isPlayerObject(player)) return player.confidence ?? defaultValue;
    return defaultValue;
}

export function getModifierName(modifier: string | ModifierObject | unknown): string {
    if (typeof modifier === 'string') return modifier;
    if (isModifierObject(modifier)) return modifier.name;
    return '';
}

export const SHIP_TYPES = ['HUNTER', 'BASTION', 'PRIVATEER', 'BATTLE SCOUT', 'SCOUT', 'OUTLAW', 'SOLO OUTLAW', 'SWER'];
export const SHIP_NAME_KEYWORDS = ['MURDER', 'SPAGHURDER', 'MEANR', 'THAN', 'AVG', 'DODGE', 'BULLET'];
