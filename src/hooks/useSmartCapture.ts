import { useEffect, useState, useCallback, useRef } from 'react';
import { captureGameWindow, ocrProcessCapture, saveScreenshot, isElectron } from '../utils/electronBridge';
import { rerunOCROnArtifact } from '../utils/artifactService';
import type { OCRExtractedData, ScreenshotType } from '../utils/ocr/ocrTypes';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from './useSoundEffects';
import { findClosestMatch, normalizeOcrName } from '../utils/stringUtils';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { smartAnalyzeScreen } from '../utils/scanService';

export interface SavedCapture {
  filePath: string;
  filename: string;
  timestamp: number;
  matchId?: string | number | null;
  ocrData?: OCRExtractedData;
  ocrProcessed: boolean;
}

export interface SmartCaptureState {
  isCapturing: boolean;
  isProcessing: boolean;
  error: string | null;
  pendingData: OCRExtractedData | null;
  capturedScreenshots: Array<{
    type: ScreenshotType;
    data: OCRExtractedData;
    timestamp: number;
  }>;
  queueDepth: number;
  savedCaptures: SavedCapture[];
  processingProgress: { current: number; total: number } | null;
  qualityHint: { level: 'good' | 'fair' | 'poor'; message: string } | null;
}

export interface SmartCaptureActions {
  capture: (activeUser?: string | null, matchId?: string | number | null) => Promise<void>;
  captureMultiple: (count: number, activeUser?: string | null, matchId?: string | number | null) => Promise<void>;
  captureOnly: (matchId?: string | number | null) => Promise<SavedCapture | null>;
  processStoredImage: (filePath: string, activeUser?: string | null) => Promise<void>;
  processAllStored: (activeUser?: string | null, matchId?: string | number | null) => Promise<void>;
  clearCaptures: () => void;
  clearError: () => void;
  dismissPendingData: () => void;
  getPendingData: (matchId?: string | number | null) => OCRExtractedData | null;
  getMergedData: () => OCRExtractedData | null;
  reanalyzeCaptures: () => void;
  resetCaptureSession: () => void;
}

/**
 * useSmartCapture - Hook for managing multi-screenshot capture sessions and OCR batching.
 * Synchronizes capture/processing state with the global visionStatus for the SystemPulse.
 */
export function useSmartCapture(): [SmartCaptureState, SmartCaptureActions] {
  const ocrMode = useAppStore(s => s.ocrMode);
  const captureMode = useAppStore(s => s.captureMode);
  const lockOcrTeams = useAppStore(s => s.lockOcrTeams);
  const pilotRegistry = useAppStore(s => s.pilotRegistry);
  const ocrCorrections = useAppStore(s => s.ocrCorrections);
  const { visionStatus, setVisionStatus, setToast } = useUIState();
  const { playSuccess, playError: playSoundError } = useSoundEffects();
  const {
    setTimeMin, setTimeSec, setDamageTaken,
    setSelectedReachModifiers,
    setSelectedTeammates, selectedTeammates,
    setSelectedOpponents, selectedOpponents,
    sessionTeams, setSessionTeams,
    setSessionShipTypes,
  } = useGameData();

  const [error, setError] = useState<string | null>(null);
  const isCapturing = visionStatus === 'capturing';
  const isProcessing = visionStatus === 'processing';

  const [pendingData, setPendingData] = useState<OCRExtractedData | null>(null);
  const pendingDataRef = useRef<OCRExtractedData | null>(null);
  const pendingDataByScopeRef = useRef<Record<string, OCRExtractedData>>({});
  const [capturedScreenshots, setCapturedScreenshots] = useState<
    Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>
  >([]);
  const [queueDepth, setQueueDepth] = useState(0);
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);
  const [qualityHint, setQualityHint] = useState<{ level: 'good' | 'fair' | 'poor'; message: string } | null>(null);

  // Avoid stale closures in delayed processing (auto-bundling).
  const savedCapturesRef = useRef<SavedCapture[]>([]);
  useEffect(() => {
    savedCapturesRef.current = savedCaptures;
  }, [savedCaptures]);
  useEffect(() => {
    pendingDataRef.current = pendingData;
  }, [pendingData]);

  const normalizeMatchScope = useCallback((matchId?: string | number | null): string | null => {
    if (matchId === null || matchId === undefined || matchId === '') return null;
    const normalized = String(matchId).trim();
    return normalized.length > 0 ? normalized : null;
  }, []);

  const captureQueueRef = useRef<Array<{ activeUser?: string | null }>>([]);
  const isProcessingQueueRef = useRef(false);
  const captureInFlightRef = useRef(false);
  const lastCaptureAtRef = useRef(0);

  // In "auto" mode, don't kick off OCR immediately for each keypress.
  // Instead, treat captures as a burst and OCR after a short quiet period.
  const AUTO_OCR_BUNDLE_DELAY_MS = 3750;
  const autoOcrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySmartScanResult = useCallback((res: any, activeUser?: string | null) => {
    if (!res) return;

    if (res.mode === 'MatchStats' && res.matchData) {
      const time = res.matchData.time;
      if (time && typeof time === 'string' && time.includes(':')) {
        const [mm, ss] = time.split(':');
        if (mm != null && ss != null) {
          setTimeMin(mm, 'ocr');
          setTimeSec(ss, 'ocr');
        }
      }
      if (res.matchData.damage !== undefined) {
        setDamageTaken(String(res.matchData.damage), 'ocr');
      }
      if (Array.isArray(res.matchData.modifiers) && res.matchData.modifiers.length > 0) {
        setSelectedReachModifiers(res.matchData.modifiers, 'ocr');
      }
      setToast?.({ message: 'Smart Capture applied match stats', type: 'success' });
      return;
    }

    if ((res.mode === 'Lobby' || res.mode === 'Tactical' || res.mode === 'Social') && res.lobbyData) {
      const players = Array.isArray(res.lobbyData.players) ? res.lobbyData.players : [];
      const modifiers = Array.isArray(res.lobbyData.modifiers) ? res.lobbyData.modifiers : [];

      const mergedTeams: Record<string, string[]> = { ...(sessionTeams || {}) };
      const nextTeammates = new Set<string>(selectedTeammates || []);
      const nextOpponents = new Set<string>(selectedOpponents || []);
      const shipTypesByColor: Record<string, string> = {};

      const canonicalName = (rawName: string): string => {
        const normalized = normalizeOcrName(rawName || '');
        if (!normalized || normalized.length < 2) return '';

        const direct = ocrCorrections?.[rawName] || ocrCorrections?.[normalized];
        if (direct && direct.count >= 2) return normalizeOcrName(direct.correctedTo);

        const exactKnown = (pilotRegistry || []).find(p => normalizeOcrName(p).toLowerCase() === normalized.toLowerCase());
        if (exactKnown) return exactKnown;

        const threshold = normalized.length > 8 ? 2 : 1;
        const closest = findClosestMatch(normalized, pilotRegistry || [], threshold);
        if (closest) return closest;

        return normalized;
      };

      const inferFriendlyColor = (): string | null => {
        const colored = players.filter((p: any) => p?.teamColor && p.teamColor !== 'Unknown' && !p?.isTag);
        if (colored.length === 0) return null;

        const active = activeUser ? normalizeOcrName(activeUser).toLowerCase() : '';
        if (active) {
          for (const p of colored as any[]) {
            const n = canonicalName((p?.name || '').trim());
            if (!n) continue;
            if (normalizeOcrName(n).toLowerCase() === active) return p.teamColor;
          }

          const nameToColor = new Map<string, string>();
          const candidateNames: string[] = [];
          for (const p of colored as any[]) {
            const n = canonicalName((p?.name || '').trim());
            if (!n) continue;
            const key = normalizeOcrName(n).toLowerCase();
            candidateNames.push(key);
            if (!nameToColor.has(key)) nameToColor.set(key, p.teamColor);
          }
          const closest = findClosestMatch(active, candidateNames, active.length > 8 ? 2 : 1);
          if (closest && nameToColor.has(closest)) return nameToColor.get(closest)!;
        }

        // Fallback: Cyan (common "friendly" in the UI), else the largest color bucket.
        if (colored.some((p: any) => p.teamColor === 'Cyan')) return 'Cyan';

        const counts = new Map<string, number>();
        for (const p of colored as any[]) {
          counts.set(p.teamColor, (counts.get(p.teamColor) || 0) + 1);
        }
        let best: string | null = null;
        let bestCount = 0;
        counts.forEach((c, k) => {
          if (c > bestCount) {
            bestCount = c;
            best = k;
          }
        });
        return best;
      };

      const friendlyColor = inferFriendlyColor();

      for (const p of players) {
        const rawName = (p?.name || '').trim();
        if (!rawName || rawName.length < 2) continue;
        if ((p as any)?.isTag) continue; // skip non-player tags

        const name = canonicalName(rawName);
        if (!name) continue;
        const color = (p?.teamColor || 'Unknown') as string;
        const teamKey = color && color !== 'Unknown' ? color : 'Unknown';
        let effectiveTeamKey = teamKey;
        if (!mergedTeams[effectiveTeamKey]) {
          // If the user asked to lock team mapping and we already have a map, avoid exploding new keys.
          if (lockOcrTeams && Object.keys(mergedTeams).length > 0 && effectiveTeamKey !== 'Unknown') {
            effectiveTeamKey = 'Unknown';
            if (!mergedTeams.Unknown) mergedTeams.Unknown = [];
            if (!mergedTeams.Unknown.includes(name)) mergedTeams.Unknown.push(name);
          } else {
            mergedTeams[effectiveTeamKey] = [];
          }
        }
        if (!mergedTeams[effectiveTeamKey]) mergedTeams[effectiveTeamKey] = [];
        if (!mergedTeams[effectiveTeamKey].includes(name)) mergedTeams[effectiveTeamKey].push(name);

        // Friendly team assignment: anchor on Active User when possible; fallback to Cyan.
        if (friendlyColor && color === friendlyColor) nextTeammates.add(name);
        else if (!friendlyColor && color === 'Cyan') nextTeammates.add(name);
        else if (color !== 'Unknown') nextOpponents.add(name);

        const shipType = (p as any)?.shipType;
        if (shipType && typeof shipType === 'string' && shipType.trim()) {
          if (!shipTypesByColor[effectiveTeamKey]) shipTypesByColor[effectiveTeamKey] = shipType.trim();
        }
      }

      setSessionTeams(mergedTeams);
      setSelectedTeammates(Array.from(nextTeammates));
      setSelectedOpponents(Array.from(nextOpponents));
      if (Object.keys(shipTypesByColor).length > 0) {
        setSessionShipTypes(shipTypesByColor, 'ocr');
      }

      if (modifiers.length > 0) {
        setSelectedReachModifiers(modifiers, 'ocr');
      }

      setToast?.({ message: `Smart Capture applied ${res.mode} roster`, type: 'success' });
    }
  }, [
    sessionTeams,
    selectedTeammates, selectedOpponents,
    setSessionTeams, setSelectedTeammates, setSelectedOpponents,
    setSelectedReachModifiers,
    setTimeMin, setTimeSec, setDamageTaken,
    setSessionShipTypes,
    ocrCorrections, pilotRegistry, lockOcrTeams,
    setToast
  ]);

  const assessCaptureQuality = useCallback((base64: string) => {
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes < 280_000) {
      return { level: 'poor' as const, message: 'Low detail capture detected. Recapture for best OCR results.' };
    }
    if (approxBytes < 450_000) {
      return { level: 'fair' as const, message: 'Capture quality is fair. OCR may need manual review.' };
    }
    return { level: 'good' as const, message: 'Capture quality looks good.' };
  }, []);

  const refineQualityFromOcr = useCallback((
    baseHint: { level: 'good' | 'fair' | 'poor'; message: string } | null,
    data: OCRExtractedData | null | undefined
  ) => {
    if (!data) return baseHint;

    const teamCount = data.teammates?.length || 0;
    const oppCount = data.opponentTeams?.reduce((sum, t) => sum + (t.players?.length || 0), 0) || 0;
    const modCount = data.reachModifiers?.length || 0;
    const confidence = data.overallConfidence || 0;
    const source = data.ocrSource || 'local';

    if (confidence < 62 || (teamCount + oppCount + modCount) === 0) {
      return {
        level: 'poor' as const,
        message: `OCR confidence is low (${Math.round(confidence)}%, ${source}). Consider recapturing this screen.`,
      };
    }
    if (confidence < 78 || (teamCount + oppCount) < 3) {
      return {
        level: 'fair' as const,
        message: `OCR looks partial (${Math.round(confidence)}%, ${source}). Review before applying.`,
      };
    }
    if (baseHint?.level === 'fair') {
      return {
        level: 'good' as const,
        message: `OCR recovered well (${Math.round(confidence)}%, ${source}). Safe to apply with quick review.`,
      };
    }
    return {
      level: 'good' as const,
      message: `OCR quality is strong (${Math.round(confidence)}%, ${source}).`,
    };
  }, []);

  const resolveCanonicalName = useCallback((rawName: string): string => {
    const normalized = normalizeOcrName(rawName || '');
    if (!normalized || normalized.length < 2) return '';

    const direct = ocrCorrections?.[rawName] || ocrCorrections?.[normalized];
    if (direct && direct.count >= 2) return normalizeOcrName(direct.correctedTo);

    const exactKnown = (pilotRegistry || []).find(p => normalizeOcrName(p).toLowerCase() === normalized.toLowerCase());
    if (exactKnown) return exactKnown;

    const threshold = normalized.length > 8 ? 2 : 1;
    const closest = findClosestMatch(normalized, pilotRegistry || [], threshold);
    if (closest) return closest;

    return normalized;
  }, [pilotRegistry, ocrCorrections]);

  const normalizeTeamName = useCallback((teamName: string): string => {
    const cleaned = normalizeOcrName(teamName || '');
    if (!cleaned) return '';
    if (/^(team|enemy|unknown)\b/i.test(cleaned)) return '';
    return cleaned;
  }, []);

  const canonicalizeOcrData = useCallback((
    data: OCRExtractedData,
    previousData: OCRExtractedData[]
  ): OCRExtractedData => {
    const normalizedTeammates = Array.from(
      new Map(
        (data.teammates || [])
          .map(t => ({
            ...t,
            name: resolveCanonicalName(t.name),
          }))
          .filter(t => t.name && t.name.length > 2)
          .map(t => [normalizeOcrName(t.name).toLowerCase(), t])
      ).values()
    );

    const currentTeams = (data.opponentTeams || []).map(team => ({
      ...team,
      teamName: normalizeTeamName(team.teamName || ''),
      players: Array.from(
        new Map(
          (team.players || [])
            .map(p => ({ ...p, name: resolveCanonicalName(p.name) }))
            .filter(p => p.name && p.name.length > 2)
            .map(p => [normalizeOcrName(p.name).toLowerCase(), p])
        ).values()
      ),
    }));

    const historyTeams = previousData.flatMap(d => d.opponentTeams || []);
    const reconciledTeams = currentTeams.map(team => {
      let bestHistory: (typeof historyTeams)[number] | null = null;
      let bestScore = 0;

      for (const hist of historyTeams) {
        if (!hist) continue;
        const colorBoost = team.color !== 'unknown' && hist.color === team.color ? 0.25 : 0;
        const teamNameMatch = team.teamName && hist.teamName &&
          normalizeOcrName(team.teamName).toLowerCase() === normalizeOcrName(hist.teamName).toLowerCase() ? 0.35 : 0;
        const teamNamesNear = team.teamName && hist.teamName &&
          (normalizeOcrName(team.teamName).toLowerCase().includes(normalizeOcrName(hist.teamName).toLowerCase()) ||
            normalizeOcrName(hist.teamName).toLowerCase().includes(normalizeOcrName(team.teamName).toLowerCase())) ? 0.2 : 0;

        const currPlayers = new Set((team.players || []).map(p => normalizeOcrName(p.name).toLowerCase()));
        const histPlayers = new Set((hist.players || []).map(p => normalizeOcrName(p.name).toLowerCase()));
        let overlap = 0;
        currPlayers.forEach(p => { if (histPlayers.has(p)) overlap += 1; });
        const playerScore = currPlayers.size > 0 ? overlap / currPlayers.size : 0;

        const score = colorBoost + teamNameMatch + teamNamesNear + playerScore;
        if (score > bestScore) {
          bestScore = score;
          bestHistory = hist;
        }
      }

      if (bestHistory && bestScore >= 0.55) {
        return {
          ...team,
          teamName: lockOcrTeams
            ? normalizeTeamName(bestHistory.teamName || team.teamName || '')
            : (team.teamName || normalizeTeamName(bestHistory.teamName || '')),
          color: lockOcrTeams
            ? bestHistory.color
            : (team.color === 'unknown' ? bestHistory.color : team.color),
          shipType: team.shipType || (bestHistory as any).shipType,
        };
      }
      return team;
    });

    const byPlayer = new Map<string, { teamIndex: number; score: number }>();
    reconciledTeams.forEach((team, teamIndex) => {
      team.players.forEach(player => {
        const key = normalizeOcrName(player.name).toLowerCase();
        const score = (player.confidence || 0) + (team.confidence || 0) * 0.2;
        const current = byPlayer.get(key);
        if (!current || score > current.score) {
          byPlayer.set(key, { teamIndex, score });
        }
      });
    });

    const finalTeams = reconciledTeams
      .map((team, idx) => ({
        ...team,
        players: team.players.filter(p => byPlayer.get(normalizeOcrName(p.name).toLowerCase())?.teamIndex === idx),
      }))
      .filter(team => team.players.length > 0 || !!team.teamName)
      .map((team, idx) => ({
        ...team,
        teamName: team.teamName || `Team ${idx + 1}`,
      }));

    return {
      ...data,
      teammates: normalizedTeammates,
      opponentTeams: finalTeams,
    };
  }, [resolveCanonicalName, normalizeTeamName, lockOcrTeams]);

  const buildMergedData = useCallback((screenshots: Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>): OCRExtractedData | null => {
    if (screenshots.length === 0) return null;

    let merged: Partial<OCRExtractedData> = {
      playerShip: undefined,
      reachModifiers: [],
      teammates: [],
      opponentTeams: [],
    };

    for (const capture of screenshots) {
      merged = mergeOCRData(merged, {
        playerShip: capture.data.playerShip,
        reachModifiers: capture.data.reachModifiers,
        teammates: capture.data.teammates,
        opponentTeams: capture.data.opponentTeams,
      });
    }

    const hasCrewHub = screenshots.some(c => c.type === 'crew_hub');
    const hasTacticalMap = screenshots.some(c => c.type === 'tactical_map');

    let screenshotType: ScreenshotType = 'unknown';
    if (hasCrewHub) screenshotType = 'crew_hub';
    else if (hasTacticalMap) screenshotType = 'tactical_map';

    const overallConfidence = calculateOverallConfidence(merged);

    return {
      screenshotType,
      playerShip: merged.playerShip,
      playerTeamName: undefined,
      reachModifiers: merged.reachModifiers || [],
      enemyShips: [],
      teammates: merged.teammates || [],
      opponentTeams: merged.opponentTeams || [],
      overallConfidence,
      captureTimestamp: Date.now(),
      imagePreview: screenshots[screenshots.length - 1]?.data.imagePreview,
    };
  }, []);

  const mergeIntoPending = useCallback((extractedData: OCRExtractedData, matchId?: string | number | null) => {
    let normalizedData = extractedData;
    setCapturedScreenshots(prev => {
      normalizedData = canonicalizeOcrData(extractedData, prev.map(p => p.data));
      return [...prev, { type: normalizedData.screenshotType, data: normalizedData, timestamp: Date.now() }];
    });

    const scope = normalizeMatchScope(matchId) || 'unscoped';
    const previous = pendingDataByScopeRef.current[scope];
    if (!previous) {
      const created = {
        screenshotType: normalizedData.screenshotType,
        playerShip: normalizedData.playerShip,
        playerTeamName: undefined,
        reachModifiers: normalizedData.reachModifiers || [],
        enemyShips: [],
        teammates: normalizedData.teammates || [],
        opponentTeams: normalizedData.opponentTeams || [],
        overallConfidence: normalizedData.overallConfidence || 0,
        captureTimestamp: Date.now(),
        imagePreview: normalizedData.imagePreview,
      };
      pendingDataByScopeRef.current[scope] = created;
      setPendingData(created);
      return;
    }

    const merged = mergeOCRData(previous, {
      playerShip: normalizedData.playerShip,
      reachModifiers: normalizedData.reachModifiers,
      teammates: normalizedData.teammates,
      opponentTeams: normalizedData.opponentTeams,
    });
    const screenshotType = normalizedData.screenshotType !== 'unknown'
      ? normalizedData.screenshotType : previous.screenshotType;
    const updated = {
      ...previous,
      screenshotType,
      playerShip: merged.playerShip || previous.playerShip,
      reachModifiers: merged.reachModifiers || previous.reachModifiers,
      teammates: merged.teammates || previous.teammates,
      opponentTeams: merged.opponentTeams || previous.opponentTeams,
      overallConfidence: calculateOverallConfidence(merged),
      captureTimestamp: Date.now(),
      imagePreview: normalizedData.imagePreview || previous.imagePreview,
    };
    pendingDataByScopeRef.current[scope] = updated;
    setPendingData(updated);
  }, [canonicalizeOcrData, normalizeMatchScope]);

  const processSingleCapture = useCallback(async (activeUser?: string | null) => {
    const captureResult = await captureGameWindow();

    if (!captureResult.success || !captureResult.imageBase64) {
      throw new Error(captureResult.error || 'Failed to capture game window');
    }

    // Auto-detect the screen type first. If it's MatchStats/Lobby/Tactical/Social, apply immediately.
    // If Unknown, fall back to the OCR pipeline and queue the result for Review & Apply.
    try {
      const dataUrl = `data:image/png;base64,${captureResult.imageBase64}`;
      const smart = await smartAnalyzeScreen(dataUrl, {}, activeUser || null);
      if (smart && smart.mode && smart.mode !== 'Unknown') {
        applySmartScanResult(smart, activeUser || null);
        return null;
      }
    } catch (e) {
      // ignore smart-analyze failures and fall back to OCR
    }

    const baseHint = assessCaptureQuality(captureResult.imageBase64);
    setQualityHint(baseHint);

    const saved = await saveScreenshot(captureResult.imageBase64);
    if (saved.success && saved.filePath) {
      setSavedCaptures(prev => [...prev, {
        filePath: saved.filePath!,
        filename: saved.filename || 'capture.png',
        timestamp: Date.now(),
        matchId: null,
        ocrProcessed: false,
      }]);
    }

    const effectiveOcrMode = ocrMode === 'hybrid-plus' ? 'both' : ocrMode;
    const ocrResult = await ocrProcessCapture(
      captureResult.imageBase64,
      activeUser,
      null,
      effectiveOcrMode
    );

    if (!ocrResult.success || !ocrResult.data) {
      throw new Error(ocrResult.error || 'Failed to process image');
    }

    setQualityHint(refineQualityFromOcr(baseHint, ocrResult.data));

    if (saved.success && saved.filePath) {
      setSavedCaptures(prev => prev.map(c =>
        c.filePath === saved.filePath ? { ...c, ocrProcessed: true, ocrData: ocrResult.data } : c
      ));
    }

    return ocrResult.data;
  }, [applySmartScanResult, assessCaptureQuality, ocrMode, refineQualityFromOcr]);

  const captureOnly = useCallback(async (matchId?: string | number | null): Promise<SavedCapture | null> => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return null;
    }
    if (captureInFlightRef.current) {
      return null;
    }

    captureInFlightRef.current = true;
    setError(null);
    setVisionStatus('capturing');

    try {
      const captureResult = await captureGameWindow();
      if (!captureResult.success || !captureResult.imageBase64) {
        throw new Error(captureResult.error || 'Failed to capture game window');
      }
      setQualityHint(assessCaptureQuality(captureResult.imageBase64));

      const resolvedMatchId = normalizeMatchScope(matchId);
      const saved = await saveScreenshot(captureResult.imageBase64, resolvedMatchId);
      if (!saved.success || !saved.filePath) {
        throw new Error(saved.error || 'Failed to save screenshot');
      }

      const entry: SavedCapture = {
        filePath: saved.filePath,
        filename: saved.filename || 'capture.png',
        timestamp: Date.now(),
        matchId: resolvedMatchId,
        ocrProcessed: false,
      };

      setSavedCaptures(prev => [...prev, entry]);
      playSuccess();
      return entry;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Capture failed';
      setError(errorMessage);
      playSoundError();
      return null;
    } finally {
      setVisionStatus('idle');
      captureInFlightRef.current = false;
    }
  }, [playSuccess, playSoundError, setVisionStatus, assessCaptureQuality, normalizeMatchScope]);

  const processStoredImage = useCallback(async (filePath: string, activeUser?: string | null) => {
    setVisionStatus('processing');
    setError(null);

    try {
      const result = await rerunOCROnArtifact(filePath, activeUser || '', ocrMode);
      if (!result?.success || !result?.data) {
        throw new Error(result?.error || 'OCR processing failed');
      }
      setQualityHint(refineQualityFromOcr(null, result.data));

      setSavedCaptures(prev => prev.map(c =>
        c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: result.data } : c
      ));

      const scopeMatchId = savedCapturesRef.current.find(c => c.filePath === filePath)?.matchId ?? null;
      mergeIntoPending(result.data, scopeMatchId);
      playSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMessage);
      playSoundError();
    } finally {
      setVisionStatus('idle');
    }
  }, [ocrMode, mergeIntoPending, playSuccess, playSoundError, setVisionStatus, refineQualityFromOcr]);

  const processAllStored = useCallback(async (activeUser?: string | null, matchId?: string | number | null) => {
    const scope = normalizeMatchScope(matchId);
    const unprocessed = savedCapturesRef.current.filter(c => {
      if (c.ocrProcessed) return false;
      if (!scope) return true;
      return normalizeMatchScope(c.matchId) === scope;
    });
    if (unprocessed.length === 0) return;

    if (scope) {
      delete pendingDataByScopeRef.current[scope];
      setPendingData(null);
      setCapturedScreenshots([]);
    }

    setVisionStatus('processing');
    setError(null);
    setProcessingProgress({ current: 0, total: unprocessed.length });

    try {
      const concurrency = 2;
      const results: Array<{ filePath: string; result: any }> = [];
      const queue = [...unprocessed];
      let completed = 0;

      const runNext = async () => {
        const next = queue.shift();
        if (!next) return;
        const result = await rerunOCROnArtifact(next.filePath, activeUser || '', ocrMode);
        completed += 1;
        setProcessingProgress({ current: completed, total: unprocessed.length });
        results.push({ filePath: next.filePath, result });
        await runNext();
      };

      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => runNext());
      await Promise.allSettled(workers);

      for (const outcome of results) {
        if (outcome.result?.success && outcome.result.data) {
          const { filePath, result } = outcome;
          const outcomeMatchId = savedCapturesRef.current.find(c => c.filePath === filePath)?.matchId ?? null;
          setSavedCaptures(prev => prev.map(c =>
            c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: result.data } : c
          ));
          mergeIntoPending(result.data, scope || outcomeMatchId);
          setQualityHint(refineQualityFromOcr(null, result.data));
        }
      }

      const successCount = results.filter(s => s.result?.success).length;
      if (successCount > 0) playSuccess();
      if (successCount < unprocessed.length) {
        setError(`${unprocessed.length - successCount} of ${unprocessed.length} images failed OCR`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Batch processing failed';
      setError(errorMessage);
      playSoundError();
    } finally {
      setVisionStatus('idle');
      setProcessingProgress(null);
    }
  }, [ocrMode, mergeIntoPending, playSuccess, playSoundError, setVisionStatus, refineQualityFromOcr, normalizeMatchScope]);

  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (captureQueueRef.current.length > 0) {
      const item = captureQueueRef.current.shift()!;
      setQueueDepth(captureQueueRef.current.length);

      try {
        setVisionStatus('capturing');
        const extractedData = await processSingleCapture(item.activeUser);
        setVisionStatus('processing');

        if (extractedData) {
          mergeIntoPending(extractedData);
        }
        playSuccess();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Capture failed';
        setError(errorMessage);
        playSoundError();
        console.error('Smart Capture queue error:', err);
      } finally {
        setVisionStatus('idle');
      }
    }

    setQueueDepth(0);
    isProcessingQueueRef.current = false;
  }, [processSingleCapture, mergeIntoPending, playSuccess, playSoundError, setVisionStatus]);

  const scheduleAutoOcr = useCallback((activeUser?: string | null, matchId?: string | number | null) => {
    if (autoOcrTimerRef.current) clearTimeout(autoOcrTimerRef.current);
    autoOcrTimerRef.current = setTimeout(() => {
      processAllStored(activeUser || null, matchId ?? null);
    }, AUTO_OCR_BUNDLE_DELAY_MS);
  }, [processAllStored]);

  const capture = useCallback(async (activeUser?: string | null, matchId?: string | number | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }
    const now = Date.now();
    if (captureInFlightRef.current) return;
    if (now - lastCaptureAtRef.current < 650) return;
    lastCaptureAtRef.current = now;

    setError(null);

    // Always save the screenshot first so capture never blocks on OCR.
    // "deferred" never OCRs automatically; "auto" OCRs after a short bundling delay.
    const resolvedMatchId = normalizeMatchScope(matchId);
    const entry = await captureOnly(resolvedMatchId);
    if (entry && captureMode === 'auto') {
      scheduleAutoOcr(activeUser || null, resolvedMatchId);
    }
  }, [captureOnly, captureMode, scheduleAutoOcr, normalizeMatchScope]);

  const captureMultiple = useCallback(async (count: number = 2, activeUser?: string | null, matchId?: string | number | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }
    if (captureInFlightRef.current) return;

    setError(null);

    // Capture burst first (fast). If auto, OCR after the burst settles.
    const resolvedMatchId = normalizeMatchScope(matchId);
    for (let i = 0; i < count; i++) {
      await captureOnly(resolvedMatchId);
    }
    if (captureMode === 'auto') {
      scheduleAutoOcr(activeUser || null, resolvedMatchId);
    }
  }, [captureOnly, captureMode, scheduleAutoOcr, normalizeMatchScope]);

  const clearCaptures = useCallback(() => {
    setCapturedScreenshots([]);
    setPendingData(null);
    pendingDataByScopeRef.current = {};
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const dismissPendingData = useCallback(() => {
    setPendingData(null);
    pendingDataByScopeRef.current = {};
  }, []);

  const getMergedData = useCallback((): OCRExtractedData | null => {
    return buildMergedData(capturedScreenshots);
  }, [capturedScreenshots, buildMergedData]);

  const getPendingData = useCallback((matchId?: string | number | null): OCRExtractedData | null => {
    const scope = normalizeMatchScope(matchId);
    if (scope) return pendingDataByScopeRef.current[scope] || null;
    return pendingDataRef.current;
  }, [normalizeMatchScope]);

  const reanalyzeCaptures = useCallback(() => {
    const mergedResult = buildMergedData(capturedScreenshots);
    if (mergedResult) {
      pendingDataByScopeRef.current.unscoped = mergedResult;
      setPendingData(mergedResult);
    }
  }, [capturedScreenshots, buildMergedData]);

  const resetCaptureSession = useCallback(() => {
    setCapturedScreenshots([]);
    setSavedCaptures([]);
    setPendingData(null);
    pendingDataByScopeRef.current = {};
    setError(null);
    captureQueueRef.current = [];
    setQueueDepth(0);
    isProcessingQueueRef.current = false;
    if (autoOcrTimerRef.current) {
      clearTimeout(autoOcrTimerRef.current);
      autoOcrTimerRef.current = null;
    }
  }, []);

  const state: SmartCaptureState = {
    isCapturing,
    isProcessing,
    error,
    pendingData,
    capturedScreenshots,
    queueDepth,
    savedCaptures,
    processingProgress,
    qualityHint,
  };

  const actions: SmartCaptureActions = {
    capture,
    captureMultiple,
    captureOnly,
    processStoredImage,
    processAllStored,
    clearCaptures,
    clearError,
    dismissPendingData,
    getPendingData,
    getMergedData,
    reanalyzeCaptures,
    resetCaptureSession,
  };

  return [state, actions];
}
