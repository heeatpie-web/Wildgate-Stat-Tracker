import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { captureGameWindow, ocrProcessCapture, saveScreenshot, isElectron } from '../utils/electronBridge';
import type { OCRProcessRuntimeOptions } from '../utils/electronBridge';
import { rerunOCROnArtifact, type RerunOcrResult } from '../utils/artifactService';
import type { OCRExtractedData, ScreenshotType } from '../utils/ocr/ocrTypes';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';
import { useAppStore } from '../store/useAppStore';
import { useSoundEffects } from './useSoundEffects';
import {
  combinedNameSimilarityScore,
  findClosestMatch,
  getAdaptiveNameSimilarityThreshold,
  normalizeOcrName,
} from '../utils/stringUtils';
import {
  buildAliasVariantMap,
  dedupeNamedByCanonical,
  resolveOcrName,
  resolveWithSocialContext,
} from '../utils/ocrNameResolver';
import { capTeammatePlayers } from '../utils/teamLimits';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { smartAnalyzeScreen } from '../utils/scanService';
import type { LobbyScanResult, SmartScanResult } from '../utils/scanService';
import Logger from '../utils/logger';
import { runtimeConfig } from '../config/runtimeConfig';
import { resolveTagShipMetadata } from '../utils/scan/tesseractScan';

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
  processingStatus: { phase: 'prepare' | 'analyzing' | 'merging' | 'completed' | 'error'; message: string } | null;
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
  reanalyzeCaptures: (matchId?: string | number | null) => void;
  resetCaptureSession: () => void;
}

export const resolveLobbyTagShipType = (entry: LobbyScanResult): string => (
  resolveTagShipMetadata(entry?.name, entry?.shipType || entry?.teamName || '')
);

interface TemporalNameEvidence {
  displayName: string;
  count: number;
  weightedScore: number;
  maxConfidence: number;
}

interface ScopeNameEvidence {
  teammates: Record<string, TemporalNameEvidence>;
  opponents: Record<string, TemporalNameEvidence>;
}

/**
 * useSmartCapture - Hook for managing multi-screenshot capture sessions and OCR batching.
 * Synchronizes capture/processing state with the global visionStatus for the SystemPulse.
 */
export function useSmartCapture(): [SmartCaptureState, SmartCaptureActions] {
  const ocrMode = useAppStore(s => s.ocrMode);
  const ocrRegions = useAppStore(s => s.ocrRegions);
  const captureMode = useAppStore(s => s.captureMode);
  const performanceMode = useAppStore(s => s.performanceMode);
  const lockOcrTeams = useAppStore(s => s.lockOcrTeams);
  const ocrEnhancedNameRecoveryEnabled = useAppStore(s => s.ocrEnhancedNameRecoveryEnabled);
  const ocrNameRerouteThreshold = useAppStore(s => s.ocrNameRerouteThreshold);
  const pilotRegistry = useAppStore(s => s.pilotRegistry);
  const ocrCorrections = useAppStore(s => s.ocrCorrections);
  const ocrAliasModel = useAppStore(s => s.ocrAliasModel);
  const playerProfiles = useAppStore(s => s.playerProfiles);
  const { visionStatus, setVisionStatus, setToast } = useUIState();
  const { playSuccess, playError: playSoundError } = useSoundEffects();
  const {
    setTimeMin, setTimeSec, setDamageTaken,
    setSelectedReachModifiers,
    setSelectedTeammates, selectedTeammates,
    setSelectedOpponents, selectedOpponents,
    sessionTeams, setSessionTeams,
    setSessionShipTypes,
    pendingReviews, addPendingReview,
  } = useGameData();

  const [error, setError] = useState<string | null>(null);
  const isCapturing = visionStatus === 'capturing';
  const isProcessing = visionStatus === 'processing';
  const [processingStatus, setProcessingStatus] = useState<{
    phase: 'prepare' | 'analyzing' | 'merging' | 'completed' | 'error';
    message: string;
  } | null>(null);

  const [pendingData, setPendingData] = useState<OCRExtractedData | null>(null);
  const pendingDataRef = useRef<OCRExtractedData | null>(null);
  const pendingDataByScopeRef = useRef<Record<string, OCRExtractedData>>({});
  const [capturedScreenshots, setCapturedScreenshots] = useState<
    Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>
  >([]);
  const capturedScreenshotsRef = useRef<Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>>([]);
  const [queueDepth, setQueueDepth] = useState(0);
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);
  const [qualityHint, setQualityHint] = useState<{ level: 'good' | 'fair' | 'poor'; message: string } | null>(null);
  const aliasVariantMap = useMemo(() => buildAliasVariantMap(ocrAliasModel), [ocrAliasModel]);
  const nameEvidenceByScopeRef = useRef<Record<string, ScopeNameEvidence>>({});

  // Avoid stale closures in delayed processing (auto-bundling).
  const savedCapturesRef = useRef<SavedCapture[]>([]);
  useEffect(() => {
    savedCapturesRef.current = savedCaptures;
  }, [savedCaptures]);
  useEffect(() => {
    capturedScreenshotsRef.current = capturedScreenshots;
  }, [capturedScreenshots]);
  useEffect(() => {
    pendingDataRef.current = pendingData;
  }, [pendingData]);

  // Clear auto-OCR timer on unmount to prevent state updates after unmount.
  useEffect(() => {
    return () => {
      if (autoOcrTimerRef.current) {
        clearTimeout(autoOcrTimerRef.current);
        autoOcrTimerRef.current = null;
      }
    };
  }, []);

  const normalizeMatchScope = useCallback((matchId?: string | number | null): string | null => {
    if (matchId === null || matchId === undefined || matchId === '') return null;
    const normalized = String(matchId).trim();
    return normalized.length > 0 ? normalized : null;
  }, []);

  const getFileLabel = useCallback((filePath: string): string => {
    const normalized = String(filePath || '').trim();
    if (!normalized) return 'image';
    const parts = normalized.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || normalized;
  }, []);

  const ocrRuntimeOptions = useMemo<OCRProcessRuntimeOptions>(() => ({
    routingProfile: ocrEnhancedNameRecoveryEnabled ? 'names-only' : 'default',
    fontProfile: ocrEnhancedNameRecoveryEnabled ? 'ealing-black-italic' : 'default',
    nameRerouteThreshold: ocrNameRerouteThreshold,
    maxReroutePasses: ocrEnhancedNameRecoveryEnabled ? 1 : 0,
  }), [
    ocrEnhancedNameRecoveryEnabled,
    ocrNameRerouteThreshold,
  ]);

  const createEmptyScopeEvidence = useCallback((): ScopeNameEvidence => ({
    teammates: {},
    opponents: {},
  }), []);

  const updateTemporalEvidence = useCallback((
    bucket: Record<string, TemporalNameEvidence>,
    rawName: string,
    confidence: number
  ) => {
    const normalized = normalizeOcrName(rawName || '');
    const key = normalized.toLowerCase();
    if (!key || normalized.length < 2) return;
    const previous = bucket[key];
    const prevWeighted = previous ? previous.weightedScore * 0.75 : 0;
    const weight = Math.max(0.4, Math.min(1.0, Number(confidence || 0) / 100));
    bucket[key] = {
      displayName: normalized,
      count: (previous?.count || 0) + 1,
      weightedScore: prevWeighted + weight,
      maxConfidence: Math.max(previous?.maxConfidence || 0, Number(confidence || 0)),
    };
  }, []);

  const isStableTemporalName = useCallback((evidence: TemporalNameEvidence | undefined): boolean => {
    if (!evidence) return false;
    return evidence.count >= 2 || evidence.weightedScore >= 1.35 || evidence.maxConfidence >= 88;
  }, []);

  const captureQueueRef = useRef<Array<{ activeUser?: string | null }>>([]);
  const isProcessingQueueRef = useRef(false);
  const captureInFlightRef = useRef(false);
  const lastCaptureAtRef = useRef(0);

  // In "auto" mode, don't kick off OCR immediately for each keypress.
  // Instead, treat captures as a burst and OCR after a short quiet period.
  const autoOcrBundleDelayMs = runtimeConfig.smartCapture.autoOcrBundleDelayMs;
  const autoOcrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to processAllStored so scheduleAutoOcr's timer always
  // calls the latest version even after ocrMode/ocrRegions change.
  const processAllStoredRef = useRef<typeof processAllStored | null>(null);

  const applySmartScanResult = useCallback((res: SmartScanResult | null | undefined, activeUser?: string | null) => {
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
      const players: LobbyScanResult[] = Array.isArray(res.lobbyData.players) ? res.lobbyData.players : [];
      const modifiers = Array.isArray(res.lobbyData.modifiers) ? res.lobbyData.modifiers : [];

      const mergedTeams: Record<string, string[]> = { ...(sessionTeams || {}) };
      const nextTeammates = new Set<string>(selectedTeammates || []);
      const nextOpponents = new Set<string>(selectedOpponents || []);
      const shipTypesByColor: Record<string, string> = {};

      const canonicalName = (rawName: string): string => {
        const candidates = Array.from(new Set([
          ...(pilotRegistry || []),
          ...Object.values(mergedTeams).flatMap(names => names || []),
        ]));
        return resolveOcrName({
          rawName,
          candidates,
          ocrCorrections,
          aliasModel: ocrAliasModel,
          aliasVariantMap,
          variantMinScore: 55,
          shortThreshold: 1,
          longThreshold: 2,
        });
      };
      const SMARTSCAN_REJECT_CONFIDENCE = 55;
      const SMARTSCAN_REVIEW_CONFIDENCE = 75;
      const pendingPlayerReviewKeys = new Set(
        (pendingReviews || [])
          .filter((review) => review.type === 'player_name')
          .map((review) => normalizeOcrName(review.value).toLowerCase())
          .filter(Boolean)
      );
      const queueSmartScanReview = (rawName: string, confidence: number, context: string) => {
        const cleaned = normalizeOcrName(rawName || '');
        const key = cleaned.toLowerCase();
        if (!cleaned || cleaned.length < 2 || pendingPlayerReviewKeys.has(key)) return;
        addPendingReview({
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'player_name',
          value: cleaned,
          originalConfidence: Math.round(confidence || 0),
          context,
          source: 'ocr',
        });
        pendingPlayerReviewKeys.add(key);
      };

      const inferFriendlyColor = (): string | null => {
        const colored = players.filter((p) => p?.teamColor && p.teamColor !== 'Unknown' && !p?.isTag);
        if (colored.length === 0) return null;

        const active = activeUser ? normalizeOcrName(activeUser).toLowerCase() : '';
        if (active) {
          for (const p of colored) {
            const n = canonicalName((p?.name || '').trim());
            if (!n) continue;
            if (normalizeOcrName(n).toLowerCase() === active) return p.teamColor;
          }

          const nameToColor = new Map<string, string>();
          const candidateNames: string[] = [];
          for (const p of colored) {
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
        if (colored.some((p) => p.teamColor === 'Cyan')) return 'Cyan';

        const counts = new Map<string, number>();
        for (const p of colored) {
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

        const color = (p?.teamColor || 'Unknown') as string;
        const teamKey = color && color !== 'Unknown' ? color : 'Unknown';
        const normalizedRawName = normalizeOcrName(rawName);
        const normalizedTeamName = normalizeOcrName(String(p?.teamName || ''));
        const tagShipType = resolveLobbyTagShipType(p);
        const looksLikeBracketTag = /^\[.+\]$/.test(rawName);
        const looksLikeTeamBanner = Boolean(
          normalizedTeamName
          && normalizedRawName
          && normalizedTeamName.toLowerCase() === normalizedRawName.toLowerCase()
        );
        const looksLikeColoredMetadata = color !== 'Unknown' && (
          p?.isTag
          || looksLikeBracketTag
          || looksLikeTeamBanner
        );
        if (looksLikeColoredMetadata) {
          if (tagShipType) {
            if (!shipTypesByColor[teamKey]) shipTypesByColor[teamKey] = tagShipType;
          } else if (p?.shipType) {
            const normalizedShip = normalizeOcrName(String(p.shipType || ''));
            if (normalizedShip && !shipTypesByColor[teamKey]) {
              shipTypesByColor[teamKey] = normalizedShip;
            }
          }
          continue;
        }

        const confidence = Number(p?.confidence || 0);
        if (confidence < SMARTSCAN_REJECT_CONFIDENCE) {
          queueSmartScanReview(rawName, confidence, `${res.mode}: rejected (low confidence)`);
          continue;
        }

        const name = canonicalName(rawName);
        if (!name) continue;
        if (confidence < SMARTSCAN_REVIEW_CONFIDENCE) {
          queueSmartScanReview(rawName, confidence, `${res.mode}: review (low confidence)`);
          continue;
        }
        const rawNormalized = normalizeOcrName(rawName);
        const resolvedNormalized = normalizeOcrName(name);
        const changed = rawNormalized.toLowerCase() !== resolvedNormalized.toLowerCase();
        const score = combinedNameSimilarityScore(rawNormalized, resolvedNormalized);
        const minSimilarity = getAdaptiveNameSimilarityThreshold(
          Math.max(rawNormalized.length, resolvedNormalized.length)
        );
        if (changed && score < minSimilarity) {
          queueSmartScanReview(rawName, confidence, `${res.mode}: review (ambiguous resolution ${Math.round(score)}% < ${minSimilarity}%)`);
          continue;
        }
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

        const shipType = p?.shipType;
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
    pendingReviews, addPendingReview,
    ocrCorrections, ocrAliasModel, aliasVariantMap, pilotRegistry, lockOcrTeams,
    setToast
  ]);

  const assessCaptureQuality = useCallback((base64: string) => {
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes < 280_000) {
      return { level: 'poor' as const, message: 'Low detail capture detected. Review OCR output carefully before applying.' };
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
        message: `OCR confidence is low (${Math.round(confidence)}%, ${source}). Review results and optionally rerun OCR for this screen.`,
      };
    }
    if (confidence < 78 || (teamCount + oppCount) < 3) {
      return {
        level: 'fair' as const,
        message: `OCR looks partial (${Math.round(confidence)}%, ${source}). Review before applying.`,
      };
    }
    if (data.isPartialCapture) {
      return {
        level: 'fair' as const,
        message: `Roster looks incomplete — scroll and capture again to see all players.`,
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
    return resolveOcrName({
      rawName,
      candidates: pilotRegistry || [],
      ocrCorrections,
      aliasModel: ocrAliasModel,
      aliasVariantMap,
      variantMinScore: 55,
      shortThreshold: 1,
      longThreshold: 2,
    });
  }, [pilotRegistry, ocrCorrections, ocrAliasModel, aliasVariantMap]);

  const normalizeTeamName = useCallback((teamName: string): string => {
    const cleaned = normalizeOcrName(teamName || '');
    if (!cleaned) return '';
    if (/^(team|enemy|unknown)\b/i.test(cleaned)) return '';
    return cleaned;
  }, []);

  const applyTemporalFusion = useCallback((
    scope: string,
    data: OCRExtractedData
  ): OCRExtractedData => {
    if (!ocrEnhancedNameRecoveryEnabled) return data;
    const scopedEvidence = nameEvidenceByScopeRef.current[scope] || createEmptyScopeEvidence();
    nameEvidenceByScopeRef.current[scope] = scopedEvidence;

    (data.teammates || []).forEach((teammate) => {
      updateTemporalEvidence(scopedEvidence.teammates, teammate.name, Number(teammate.confidence || 0));
    });
    (data.opponentTeams || []).forEach((team) => {
      (team.players || []).forEach((player) => {
        updateTemporalEvidence(scopedEvidence.opponents, player.name, Number(player.confidence || 0));
      });
    });

    const teammateMap = new Map<string, (typeof data.teammates)[number]>();
    (data.teammates || []).forEach((teammate) => {
      const name = normalizeOcrName(teammate.name || '');
      const key = name.toLowerCase();
      if (!key) return;
      const evidence = scopedEvidence.teammates[key];
      const boostedConfidence = isStableTemporalName(evidence)
        ? Math.max(Number(teammate.confidence || 0), Math.max(88, Number(evidence?.maxConfidence || 0)))
        : Number(teammate.confidence || 0);
      const candidate = { ...teammate, name: evidence?.displayName || name, confidence: boostedConfidence };
      const prev = teammateMap.get(key);
      if (!prev || Number(candidate.confidence || 0) > Number(prev.confidence || 0)) {
        teammateMap.set(key, candidate);
      }
    });
    const fusedTeammates = capTeammatePlayers(Array.from(teammateMap.values()), data.playerShip?.shipType);

    const fusedOpponentTeams = (data.opponentTeams || []).map((team) => {
      const playerMap = new Map<string, typeof team.players[number]>();
      (team.players || []).forEach((player) => {
        const name = normalizeOcrName(player.name || '');
        const key = name.toLowerCase();
        if (!key) return;
        const evidence = scopedEvidence.opponents[key];
        const boostedConfidence = isStableTemporalName(evidence)
          ? Math.max(Number(player.confidence || 0), Math.max(88, Number(evidence?.maxConfidence || 0)))
          : Number(player.confidence || 0);
        const candidate = { ...player, name: evidence?.displayName || name, confidence: boostedConfidence };
        const prev = playerMap.get(key);
        if (!prev || Number(candidate.confidence || 0) > Number(prev.confidence || 0)) {
          playerMap.set(key, candidate);
        }
      });
      return {
        ...team,
        players: Array.from(playerMap.values()),
      };
    });

    return {
      ...data,
      teammates: fusedTeammates,
      opponentTeams: fusedOpponentTeams,
    };
  }, [
    createEmptyScopeEvidence,
    isStableTemporalName,
    ocrEnhancedNameRecoveryEnabled,
    updateTemporalEvidence,
  ]);

  const canonicalizeOcrData = useCallback((
    data: OCRExtractedData,
    previousData: OCRExtractedData[]
  ): OCRExtractedData => {
    const registrySet = new Set((pilotRegistry || []).map((name) => normalizeOcrName(name).toLowerCase()));
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
    const resolvedTeammateAnchors = normalizedTeammates
      .filter((teammate) => registrySet.has(normalizeOcrName(teammate.name).toLowerCase()))
      .map((teammate) => teammate.name);
    const contextualTeammates = normalizedTeammates.map((teammate) => {
      const normalizedName = normalizeOcrName(teammate.name).toLowerCase();
      if (registrySet.has(normalizedName)) return teammate;
      const contextual = resolveWithSocialContext(
        teammate.name,
        pilotRegistry || [],
        resolvedTeammateAnchors,
        playerProfiles,
        { minAnchors: 2, minPlayedWith: 1 }
      );
      if (!contextual) return teammate;
      return {
        ...teammate,
        name: contextual,
        confidence: Math.max(teammate.confidence || 0, 72),
      };
    });
    const finalTeammates = capTeammatePlayers(
      dedupeNamedByCanonical(contextualTeammates),
      data.playerShip?.shipType
    );
    const contextualAnchors = finalTeammates
      .filter((teammate) => registrySet.has(normalizeOcrName(teammate.name).toLowerCase()))
      .map((teammate) => teammate.name);

    const currentTeams = (data.opponentTeams || []).map((team) => {
      const passOnePlayers = (team.players || [])
        .map((player) => ({
          ...player,
          name: resolveCanonicalName(player.name),
        }))
        .filter((player) => player.name && player.name.length > 2);

      const teamResolvedAnchors = passOnePlayers
        .filter((player) => registrySet.has(normalizeOcrName(player.name).toLowerCase()))
        .map((player) => player.name);

      const passTwoPlayers = passOnePlayers.map((player) => {
        const normalizedPlayer = normalizeOcrName(player.name).toLowerCase();
        if (registrySet.has(normalizedPlayer)) return player;
        const contextual = resolveWithSocialContext(
          player.name,
          pilotRegistry || [],
          teamResolvedAnchors,
          playerProfiles,
          { minAnchors: 2, minPlayedWith: 1 }
        );
        if (!contextual) return player;
        return {
          ...player,
          name: contextual,
          confidence: Math.max(player.confidence || 0, 70),
        };
      });

      return {
        ...team,
        teamName: normalizeTeamName(team.teamName || ''),
        players: dedupeNamedByCanonical(passTwoPlayers),
      };
    });

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
          shipType: team.shipType || bestHistory.shipType,
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
      teammates: finalTeammates,
      opponentTeams: finalTeams,
    };
  }, [
    resolveCanonicalName,
    normalizeTeamName,
    lockOcrTeams,
    pilotRegistry,
    playerProfiles,
  ]);

  const buildMergedData = useCallback((screenshots: Array<{ type: ScreenshotType; data: OCRExtractedData; timestamp: number }>): OCRExtractedData | null => {
    if (screenshots.length === 0) return null;

    let merged: Partial<OCRExtractedData> = {
      playerShip: undefined,
      reachModifiers: [],
      teammates: [],
      opponentTeams: [],
      enemyShips: [],
    };

    for (const capture of screenshots) {
      merged = mergeOCRData(merged, {
        playerShip: capture.data.playerShip,
        playerTeamName: capture.data.playerTeamName,
        reachModifiers: capture.data.reachModifiers,
        teammates: capture.data.teammates,
        opponentTeams: capture.data.opponentTeams,
        enemyShips: capture.data.enemyShips,
      });
    }

    const hasCrewHub = screenshots.some(c => c.type === 'crew_hub');
    const hasTacticalMap = screenshots.some(c => c.type === 'tactical_map');

    let screenshotType: ScreenshotType = 'unknown';
    if (hasCrewHub) screenshotType = 'crew_hub';
    else if (hasTacticalMap) screenshotType = 'tactical_map';

    const overallConfidence = calculateOverallConfidence(merged);
    const mergedTeammates = capTeammatePlayers(merged.teammates || [], merged.playerShip?.shipType);

    return {
      screenshotType,
      playerShip: merged.playerShip,
      playerTeamName: merged.playerTeamName,
      reachModifiers: merged.reachModifiers || [],
      enemyShips: merged.enemyShips || [],
      teammates: mergedTeammates,
      opponentTeams: merged.opponentTeams || [],
      overallConfidence,
      captureTimestamp: Date.now(),
      imagePreview: screenshots[screenshots.length - 1]?.data.imagePreview,
    };
  }, []);

  const mergeIntoPending = useCallback((extractedData: OCRExtractedData, matchId?: string | number | null) => {
    const scope = normalizeMatchScope(matchId) || 'unscoped';
    const canonicalized = canonicalizeOcrData(
      extractedData,
      capturedScreenshotsRef.current.map((screenshot) => screenshot.data)
    );
    const normalizedData = applyTemporalFusion(scope, canonicalized);
    const nextScreenshots = [
      ...capturedScreenshotsRef.current,
      { type: normalizedData.screenshotType, data: normalizedData, timestamp: Date.now() },
    ];
    capturedScreenshotsRef.current = nextScreenshots;
    setCapturedScreenshots(nextScreenshots);

    const previous = pendingDataByScopeRef.current[scope];
    if (!previous) {
      const cappedTeammates = capTeammatePlayers(
        normalizedData.teammates || [],
        normalizedData.playerShip?.shipType
      );
      const created = {
        screenshotType: normalizedData.screenshotType,
        playerShip: normalizedData.playerShip,
        playerTeamName: normalizedData.playerTeamName,
        reachModifiers: normalizedData.reachModifiers || [],
        enemyShips: normalizedData.enemyShips || [],
        teammates: cappedTeammates,
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
      playerTeamName: normalizedData.playerTeamName,
      reachModifiers: normalizedData.reachModifiers,
      teammates: normalizedData.teammates,
      opponentTeams: normalizedData.opponentTeams,
      enemyShips: normalizedData.enemyShips,
    });
    const screenshotType = normalizedData.screenshotType !== 'unknown'
      ? normalizedData.screenshotType : previous.screenshotType;
    const shipForTeammateCap = merged.playerShip?.shipType || previous.playerShip?.shipType || normalizedData.playerShip?.shipType;
    const cappedMergedTeammates = capTeammatePlayers(
      (merged.teammates || previous.teammates) || [],
      shipForTeammateCap
    );
    const updated = {
      ...previous,
      screenshotType,
      playerShip: merged.playerShip || previous.playerShip,
      playerTeamName: merged.playerTeamName || previous.playerTeamName || normalizedData.playerTeamName,
      reachModifiers: merged.reachModifiers || previous.reachModifiers,
      teammates: cappedMergedTeammates,
      opponentTeams: merged.opponentTeams || previous.opponentTeams,
      enemyShips: merged.enemyShips || previous.enemyShips || normalizedData.enemyShips || [],
      overallConfidence: calculateOverallConfidence(merged),
      captureTimestamp: Date.now(),
      imagePreview: normalizedData.imagePreview || previous.imagePreview,
    };
    pendingDataByScopeRef.current[scope] = updated;
    setPendingData(updated);
  }, [applyTemporalFusion, canonicalizeOcrData, normalizeMatchScope]);

  const processSingleCapture = useCallback(async (activeUser?: string | null) => {
    const captureResult = await captureGameWindow();

    if (!captureResult.success || !captureResult.imageBase64) {
      throw new Error(captureResult.error || 'Failed to capture game window');
    }

    // Auto-detect the screen type first. If it's MatchStats/Lobby/Tactical/Social, apply immediately.
    // If Unknown, fall back to the OCR pipeline and queue the result for Review & Apply.
    try {
      const dataUrl = `data:image/png;base64,${captureResult.imageBase64}`;
      const smart = await smartAnalyzeScreen(
        dataUrl,
        { ocrMode, ocrRegions },
        activeUser || null
      );
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
      setSavedCaptures(prev => {
        const next = [...prev, {
          filePath: saved.filePath!,
          filename: saved.filename || 'capture.png',
          timestamp: Date.now(),
          matchId: null,
          ocrProcessed: false,
        }];
        savedCapturesRef.current = next;
        return next;
      });
    }

    const ocrResult = await ocrProcessCapture(
      captureResult.imageBase64,
      activeUser,
      null,
      'local',
      ocrRegions,
      ocrRuntimeOptions
    );

    if (!ocrResult.success || !ocrResult.data) {
      throw new Error(ocrResult.error || 'Failed to process image');
    }

    setQualityHint(refineQualityFromOcr(baseHint, ocrResult.data));

    if (saved.success && saved.filePath) {
      setSavedCaptures(prev => {
        const next = prev.map(c =>
          c.filePath === saved.filePath ? { ...c, ocrProcessed: true, ocrData: ocrResult.data } : c
        );
        savedCapturesRef.current = next;
        return next;
      });
    }

    return ocrResult.data;
  }, [applySmartScanResult, assessCaptureQuality, ocrMode, ocrRegions, ocrRuntimeOptions, refineQualityFromOcr]);

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

      setSavedCaptures(prev => {
        const next = [...prev, entry];
        savedCapturesRef.current = next;
        return next;
      });
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
    setProcessingStatus({ phase: 'prepare', message: 'Preparing OCR run...' });

    try {
      const fileLabel = getFileLabel(filePath);
      setProcessingStatus({ phase: 'analyzing', message: `Analyzing ${fileLabel} (1/1)...` });
      const result = await rerunOCROnArtifact(filePath, activeUser || '', ocrMode, ocrRegions, ocrRuntimeOptions);
      if (!result?.success || !result?.data) {
        throw new Error(result?.error || 'OCR processing failed');
      }
      setQualityHint(refineQualityFromOcr(null, result.data));

      setSavedCaptures(prev => {
        const next = prev.map(c =>
          c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: result.data } : c
        );
        savedCapturesRef.current = next;
        return next;
      });

      const scopeMatchId = savedCapturesRef.current.find(c => c.filePath === filePath)?.matchId ?? null;
      setProcessingStatus({ phase: 'merging', message: 'Merging OCR results...' });
      mergeIntoPending(result.data, scopeMatchId);
      setProcessingStatus({ phase: 'completed', message: `Completed OCR for ${fileLabel}.` });
      playSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMessage);
      setProcessingStatus({ phase: 'error', message: `OCR failed: ${errorMessage}` });
      playSoundError();
    } finally {
      setVisionStatus('idle');
    }
  }, [ocrMode, ocrRegions, ocrRuntimeOptions, mergeIntoPending, playSuccess, playSoundError, setVisionStatus, refineQualityFromOcr, getFileLabel]);

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
      capturedScreenshotsRef.current = [];
      setCapturedScreenshots([]);
    }

    setVisionStatus('processing');
    setError(null);
    setProcessingProgress({ current: 0, total: unprocessed.length });
    setProcessingStatus({ phase: 'prepare', message: `Preparing OCR queue (${unprocessed.length} files)...` });

    try {
      const concurrency = 1;
      const interJobDelayMs = performanceMode ? 250 : 120;
      const yieldEvery = performanceMode ? 2 : 4;
      const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const results: Array<{ filePath: string; result: RerunOcrResult }> = [];
      const queue = [...unprocessed];
      let completed = 0;

      const runNext = async () => {
        let processedByWorker = 0;
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          setProcessingStatus({
            phase: 'analyzing',
            message: `Analyzing ${getFileLabel(next.filePath)} (${completed + 1}/${unprocessed.length})...`,
          });
          const result = await rerunOCROnArtifact(next.filePath, activeUser || '', ocrMode, ocrRegions, ocrRuntimeOptions);
          completed += 1;
          processedByWorker += 1;
          setProcessingProgress({ current: completed, total: unprocessed.length });
          results.push({ filePath: next.filePath, result });

          if (queue.length > 0 && interJobDelayMs > 0) {
            await delay(interJobDelayMs);
          }
          if (processedByWorker % yieldEvery === 0) {
            await delay(0);
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => runNext());
      await Promise.allSettled(workers);
      setProcessingStatus({ phase: 'merging', message: 'Merging OCR queue results...' });

      for (const outcome of results) {
        if (outcome.result?.success && outcome.result.data) {
          const { filePath, result } = outcome;
          const processedData = result.data;
          if (!processedData) continue;
          const outcomeMatchId = savedCapturesRef.current.find(c => c.filePath === filePath)?.matchId ?? null;
          setSavedCaptures(prev => {
            const next = prev.map(c =>
              c.filePath === filePath ? { ...c, ocrProcessed: true, ocrData: processedData } : c
            );
            savedCapturesRef.current = next;
            return next;
          });
          mergeIntoPending(processedData, scope || outcomeMatchId);
          setQualityHint(refineQualityFromOcr(null, processedData));
        }
      }

      const successCount = results.filter(s => s.result?.success).length;
      if (successCount > 0) playSuccess();
      if (successCount < unprocessed.length) {
        setError(`${unprocessed.length - successCount} of ${unprocessed.length} images failed OCR`);
        setProcessingStatus({
          phase: 'error',
          message: `Completed with ${unprocessed.length - successCount} OCR failures.`,
        });
      } else {
        setProcessingStatus({ phase: 'completed', message: `Completed OCR for ${successCount} files.` });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Batch processing failed';
      setError(errorMessage);
      setProcessingStatus({ phase: 'error', message: `OCR failed: ${errorMessage}` });
      playSoundError();
    } finally {
      setVisionStatus('idle');
      setProcessingProgress(null);
    }
  }, [
    ocrMode,
    ocrRegions,
    ocrRuntimeOptions,
    performanceMode,
    mergeIntoPending,
    playSuccess,
    playSoundError,
    setVisionStatus,
    refineQualityFromOcr,
    normalizeMatchScope,
    getFileLabel,
  ]);

  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    const totalQueued = captureQueueRef.current.length;
    let processedQueued = 0;
    setProcessingStatus({ phase: 'prepare', message: `Preparing queued OCR (${totalQueued} captures)...` });

    while (captureQueueRef.current.length > 0) {
      const item = captureQueueRef.current.shift()!;
      setQueueDepth(captureQueueRef.current.length);

      try {
        setVisionStatus('capturing');
        setProcessingStatus({
          phase: 'analyzing',
          message: `Analyzing queued capture ${processedQueued + 1}/${totalQueued}...`,
        });
        const extractedData = await processSingleCapture(item.activeUser);
        setVisionStatus('processing');

        if (extractedData) {
          setProcessingStatus({ phase: 'merging', message: 'Merging queued OCR result...' });
          mergeIntoPending(extractedData);
        }
        processedQueued += 1;
        playSuccess();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Capture failed';
        setError(errorMessage);
        setProcessingStatus({ phase: 'error', message: `Queued OCR failed: ${errorMessage}` });
        playSoundError();
        Logger.error('SmartCapture', 'Queue capture failed', err);
      } finally {
        setVisionStatus('idle');
      }
    }

    setQueueDepth(0);
    setProcessingStatus({ phase: 'completed', message: `Completed queued OCR for ${processedQueued}/${totalQueued} captures.` });
    isProcessingQueueRef.current = false;
  }, [processSingleCapture, mergeIntoPending, playSuccess, playSoundError, setVisionStatus]);

  // Keep ref in sync so timers always call the latest processAllStored.
  processAllStoredRef.current = processAllStored;

  const scheduleAutoOcr = useCallback((activeUser?: string | null, matchId?: string | number | null) => {
    if (autoOcrTimerRef.current) clearTimeout(autoOcrTimerRef.current);
    autoOcrTimerRef.current = setTimeout(() => {
      processAllStoredRef.current?.(activeUser || null, matchId ?? null);
    }, autoOcrBundleDelayMs);
  }, [autoOcrBundleDelayMs]);

  const capture = useCallback(async (activeUser?: string | null, matchId?: string | number | null) => {
    if (!isElectron()) {
      setError('Smart Capture is only available in the desktop app');
      return;
    }
    const now = Date.now();
    if (captureInFlightRef.current) return;
    if (now - lastCaptureAtRef.current < runtimeConfig.smartCapture.captureThrottleMs) return;
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
    capturedScreenshotsRef.current = [];
    setCapturedScreenshots([]);
    setPendingData(null);
    pendingDataByScopeRef.current = {};
    nameEvidenceByScopeRef.current = {};
    setError(null);
    setProcessingStatus(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const dismissPendingData = useCallback(() => {
    setPendingData(null);
    pendingDataByScopeRef.current = {};
    nameEvidenceByScopeRef.current = {};
  }, []);

  const getMergedData = useCallback((): OCRExtractedData | null => {
    return buildMergedData(capturedScreenshots);
  }, [capturedScreenshots, buildMergedData]);

  const getPendingData = useCallback((matchId?: string | number | null): OCRExtractedData | null => {
    const scope = normalizeMatchScope(matchId);
    if (scope) return pendingDataByScopeRef.current[scope] || null;
    return pendingDataRef.current;
  }, [normalizeMatchScope]);

  const reanalyzeCaptures = useCallback((matchId?: string | number | null) => {
    const scope = normalizeMatchScope(matchId);
    const scopedSavedCaptures = scope
      ? savedCaptures.filter((capture) => normalizeMatchScope(capture.matchId) === scope)
      : savedCaptures;
    const scopedOcrData = scopedSavedCaptures
      .map((capture) => capture.ocrData)
      .filter((data): data is OCRExtractedData => Boolean(data));
    const synthesizedScreenshots = scopedOcrData.map((data, index) => ({
      type: data.screenshotType,
      data,
      timestamp: Number(data.captureTimestamp || Date.now() + index),
    }));
    const mergedResult = synthesizedScreenshots.length > 0
      ? buildMergedData(synthesizedScreenshots)
      : buildMergedData(capturedScreenshots);
    if (mergedResult) {
      if (scope) {
        pendingDataByScopeRef.current[scope] = mergedResult;
      } else {
        pendingDataByScopeRef.current.unscoped = mergedResult;
      }
      setPendingData(mergedResult);
    }
  }, [buildMergedData, capturedScreenshots, normalizeMatchScope, savedCaptures]);

  const resetCaptureSession = useCallback(() => {
    capturedScreenshotsRef.current = [];
    setCapturedScreenshots([]);
    savedCapturesRef.current = [];
    setSavedCaptures([]);
    setPendingData(null);
    pendingDataByScopeRef.current = {};
    nameEvidenceByScopeRef.current = {};
    setError(null);
    setProcessingStatus(null);
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
    processingStatus,
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
