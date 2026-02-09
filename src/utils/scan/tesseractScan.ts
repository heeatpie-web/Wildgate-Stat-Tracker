/**
 * @module scan/tesseractScan
 * Tesseract-based OCR with Chinese character support (eng+chi_sim).
 * Uses region-based extraction with dynamic user anchor detection.
 */
import Logger from '../logger';
import { ocrProcessCapture } from '../electronBridge';
import type { LobbyScanResult, SmartScanResult, ScanOptions, TeamColor } from './types';
import { getPlayerName, getPlayerConfidence, getModifierName } from './types';

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

/** Check if a team color from OCR indicates spectators (dark/black badges) */
export const isSpectatorColor = (color: string | undefined): boolean => {
    return color?.toLowerCase() === 'spectator';
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

        const ocrResponse = await ocrProcessCapture(base64Data, activeUser, null, options.ocrMode || 'both');

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
                        isTag: true,
                    });
                }
            });

            (ocrData.opponentTeams || []).forEach(team => {
                // Skip spectator teams (dark/black badge = not opponents)
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
                            isTag: teamColor !== 'Unknown',
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
                        shipType: team.shipType,
                        confidence: team.confidence || 70,
                        source: 'OCR',
                        isTag: true,
                    });
                }
            });

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
