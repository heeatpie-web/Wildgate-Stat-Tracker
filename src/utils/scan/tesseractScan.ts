import Logger from '../logger';
import { ocrProcessCapture } from '../electronBridge';
import type { LobbyScanResult, SmartScanResult, ScanOptions, TeamColor } from './types';
import { getPlayerName, getPlayerConfidence, getModifierName } from './types';
import { normalizeShipName } from '../../types';

/**
 * Map internal color names to TeamColor type
 */
export const mapTeamColor = (color: string | undefined): TeamColor => {
    switch (color?.toLowerCase()) {
        case 'red': return 'Red';
        case 'orange': return 'Orange';
        case 'yellow': return 'Yellow';
        case 'yellowgreen': return 'Yellow';
        case 'green': return 'Green';
        case 'cyan': return 'Cyan';
        case 'blue': return 'Blue';
        case 'purple': return 'Purple';
        default: return 'Unknown';
    }
};
export const isSpectatorColor = (color: string | undefined): boolean => {
    return color?.toLowerCase() === 'spectator';
};

const KNOWN_SHIPS = new Set(['hunter', 'bastion', 'privateer', 'scout', 'outlaw', 'solo outlaw']);

export const resolveTagShipMetadata = (
    rawLabel: string | null | undefined,
    explicitShipType?: string | null
): string => {
    const explicit = normalizeShipName(String(explicitShipType || ''));
    if (KNOWN_SHIPS.has(explicit.toLowerCase())) {
        return explicit;
    }
    const cleanedLabel = String(rawLabel || '')
        .replace(/^\[+|\]+$/g, '')
        .replace(/\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i, '')
        .trim();
    if (!cleanedLabel) return '';
    const normalized = normalizeShipName(cleanedLabel);
    if (KNOWN_SHIPS.has(normalized.toLowerCase())) {
        return normalized;
    }
    return '';
};

export const processWithTesseractOCR = async (
    imageDataUrl: string,
    activeUser: string | null,
    options: ScanOptions = {}
): Promise<SmartScanResult> => {
    const { onProgress } = options;

    try {
        onProgress?.('Running Tesseract OCR (eng+chi_sim)...', 20);

        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

        const ocrResponse = await ocrProcessCapture(
            base64Data,
            activeUser,
            null,
            'local',
            options.ocrRegions || null
        );

        if (!ocrResponse.success || !ocrResponse.data) {
            Logger.warn('OCR', 'Tesseract OCR failed, falling back to native');
            return { mode: 'Unknown' };
        }

        const ocrData = ocrResponse.data;
        onProgress?.('Processing OCR results...', 60);

        if (ocrData.screenshotType === 'crew_hub') {
            const players: LobbyScanResult[] = [];

            (ocrData.teammates || []).forEach(t => {
                const name = getPlayerName(t);
                if (name && name.length > 2) {
                    players.push({
                        name,
                        teamColor: 'Cyan',
                        teamName: ocrData.playerTeamName || 'My Crew',
                        confidence: getPlayerConfidence(t, 80),
                        source: 'OCR',
                        isTag: false,
                    });
                }
            });

            (ocrData.opponentTeams || []).forEach(team => {
                if (isSpectatorColor(team.color)) return;
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
                            isTag: false,
                        });
                    }
                });
            });

            const modifiers = (ocrData.reachModifiers || []).map(m => getModifierName(m)).filter(Boolean);

            onProgress?.('Complete', 100);
            return {
                mode: 'Lobby',
                lobbyData: { players, modifiers },
            };
        }

        if (ocrData.screenshotType === 'tactical_map') {
            const players: LobbyScanResult[] = [];

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

            (ocrData.opponentTeams || []).forEach(team => {
                const teamColor = mapTeamColor(team.color);
                if (team.teamName && team.teamName !== 'Unknown Team') {
                    players.push({
                        name: `[${team.teamName}]`,
                        teamColor,
                        teamName: team.teamName,
                        shipType: resolveTagShipMetadata(team.teamName, team.shipType) || team.shipType,
                        confidence: team.confidence || 70,
                        source: 'OCR',
                        isTag: true,
                    });
                }
            });

            const modifiers = [
                ...(ocrData.reachModifiers || []).map(m => getModifierName(m)).filter(Boolean),
                ...(ocrData.hazards || []),
            ];

            onProgress?.('Complete', 100);
            return {
                mode: 'Tactical',
                lobbyData: { players, modifiers },
            };
        }

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


