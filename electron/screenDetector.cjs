/**
 * Screen Type Detector for OCR
 *
 * Detects whether a screenshot is:
 * - Crew Hub: Shows party members and enemy crews
 * - Map Screen (Tactical Map): Shows ship types, hazards, and mission info
 */

/**
 * Screen type enum
 */
const SCREEN_TYPES = {
  CREW_HUB: 'crewHub',
  MAP_SCREEN: 'mapScreen',
  UNKNOWN: 'unknown',
};

/**
 * Indicator keywords and their weights for screen detection
 */
const CREW_HUB_INDICATORS = [
  { pattern: /CREW\s*HUB/i, weight: 10 },
  { pattern: /Enemy\s*Crews?/i, weight: 8 },
  { pattern: /'s\s*Crew/i, weight: 7 },
  { pattern: /PARTY/i, weight: 5 },
  { pattern: /VOICE\s*CHANNEL/i, weight: 4 },
  { pattern: /PUSH\s*TO\s*TALK/i, weight: 4 },
  { pattern: /Switch\s*Voice/i, weight: 3 },
  { pattern: /VOICE\s*OPTIONS/i, weight: 3 },
  { pattern: /MUTE\s*VOICE/i, weight: 3 },
  { pattern: /HOP\s*INTO/i, weight: 3 },
  { pattern: /MAP\s*SEED/i, weight: 2 },
];

const MAP_SCREEN_INDICATORS = [
  { pattern: /YOUR\s*SHIP/i, weight: 10 },
  { pattern: /ENEMY\s*SHIPS?/i, weight: 10 },
  { pattern: /KNOWN\s*HAZARDS/i, weight: 9 },
  { pattern: /TACTICAL\s*MAP/i, weight: 8 },
  { pattern: /FEATURES/i, weight: 3 },
  { pattern: /ANCIENT\s*VAULT/i, weight: 5 },
  { pattern: /HEALING\s*ARTIFACT/i, weight: 5 },
  { pattern: /LAVA\s*EPICS/i, weight: 5 },
  { pattern: /LEGION\s*PATROLS/i, weight: 5 },
  { pattern: /LOW\s*ALTITUDE/i, weight: 5 },
  { pattern: /FEW\s*SHIPS/i, weight: 4 },
  { pattern: /ICE\s*STORM/i, weight: 4 },
  { pattern: /SANDSTORM/i, weight: 4 },
];

/**
 * Detect screen type from OCR text
 * @param {string} text - Raw OCR text
 * @returns {{ type: string, confidence: number, scores: { crewHub: number, mapScreen: number } }}
 */
function detectScreenType(text) {
  if (!text || typeof text !== 'string') {
    return {
      type: SCREEN_TYPES.UNKNOWN,
      confidence: 0,
      scores: { crewHub: 0, mapScreen: 0 },
    };
  }

  const normalizedText = text.toUpperCase();

  // Calculate scores for each screen type
  let crewHubScore = 0;
  let mapScreenScore = 0;

  for (const indicator of CREW_HUB_INDICATORS) {
    if (indicator.pattern.test(normalizedText)) {
      crewHubScore += indicator.weight;
    }
  }

  for (const indicator of MAP_SCREEN_INDICATORS) {
    if (indicator.pattern.test(normalizedText)) {
      mapScreenScore += indicator.weight;
    }
  }

  // Determine screen type based on scores
  let type = SCREEN_TYPES.UNKNOWN;
  let confidence = 0;

  const totalScore = crewHubScore + mapScreenScore;

  if (totalScore === 0) {
    // No indicators found
    confidence = 0;
  } else if (crewHubScore > mapScreenScore) {
    type = SCREEN_TYPES.CREW_HUB;
    confidence = Math.min(100, Math.round((crewHubScore / (crewHubScore + mapScreenScore + 1)) * 100));
  } else if (mapScreenScore > crewHubScore) {
    type = SCREEN_TYPES.MAP_SCREEN;
    confidence = Math.min(100, Math.round((mapScreenScore / (crewHubScore + mapScreenScore + 1)) * 100));
  } else {
    // Tie - default to Crew Hub (more common capture)
    type = SCREEN_TYPES.CREW_HUB;
    confidence = 50;
  }

  // Boost confidence if strong indicators present
  if (crewHubScore >= 15 && type === SCREEN_TYPES.CREW_HUB) {
    confidence = Math.min(100, confidence + 20);
  }
  if (mapScreenScore >= 15 && type === SCREEN_TYPES.MAP_SCREEN) {
    confidence = Math.min(100, confidence + 20);
  }

  console.log(`[ScreenDetector] Scores - CrewHub: ${crewHubScore}, MapScreen: ${mapScreenScore}, Type: ${type}, Confidence: ${confidence}%`);

  return {
    type,
    confidence,
    scores: { crewHub: crewHubScore, mapScreen: mapScreenScore },
  };
}

/**
 * Quick check for specific screen type
 * @param {string} text - OCR text
 * @param {string} expectedType - Expected screen type
 * @returns {boolean}
 */
function isScreenType(text, expectedType) {
  const result = detectScreenType(text);
  return result.type === expectedType && result.confidence >= 50;
}

/**
 * Detect screen type from OCR lines with bounding boxes
 * More reliable when we have spatial information
 * @param {Array} ocrLines - Array of { text, bbox } objects
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {{ type: string, confidence: number }}
 */
function detectScreenTypeFromLines(ocrLines, imageWidth, imageHeight) {
  if (!ocrLines || ocrLines.length === 0) {
    return { type: SCREEN_TYPES.UNKNOWN, confidence: 0 };
  }

  // Combine all text for keyword matching
  const allText = ocrLines.map(l => l.text || '').join(' ');
  const baseResult = detectScreenType(allText);

  // Additional spatial validation
  let spatialBonus = 0;

  // Check for "ENEMY SHIPS" in top-right (indicates Map Screen)
  const topRightLines = ocrLines.filter(l => {
    if (!l.bbox) return false;
    const centerX = (l.bbox.x0 + l.bbox.x1) / 2;
    const centerY = (l.bbox.y0 + l.bbox.y1) / 2;
    return centerX > imageWidth * 0.6 && centerY < imageHeight * 0.3;
  });

  for (const line of topRightLines) {
    if (/ENEMY\s*SHIPS?/i.test(line.text)) {
      if (baseResult.type === SCREEN_TYPES.MAP_SCREEN) {
        spatialBonus += 15;
      }
    }
  }

  // Check for "Enemy Crews" in right side (indicates Crew Hub)
  const rightLines = ocrLines.filter(l => {
    if (!l.bbox) return false;
    const centerX = (l.bbox.x0 + l.bbox.x1) / 2;
    return centerX > imageWidth * 0.5;
  });

  for (const line of rightLines) {
    if (/Enemy\s*Crews?/i.test(line.text)) {
      if (baseResult.type === SCREEN_TYPES.CREW_HUB) {
        spatialBonus += 15;
      }
    }
  }

  // Check for "YOUR SHIP" in top-left (indicates Map Screen)
  const topLeftLines = ocrLines.filter(l => {
    if (!l.bbox) return false;
    const centerX = (l.bbox.x0 + l.bbox.x1) / 2;
    const centerY = (l.bbox.y0 + l.bbox.y1) / 2;
    return centerX < imageWidth * 0.3 && centerY < imageHeight * 0.3;
  });

  for (const line of topLeftLines) {
    if (/YOUR\s*SHIP/i.test(line.text)) {
      if (baseResult.type === SCREEN_TYPES.MAP_SCREEN) {
        spatialBonus += 15;
      }
    }
  }

  return {
    type: baseResult.type,
    confidence: Math.min(100, baseResult.confidence + spatialBonus),
    scores: baseResult.scores,
  };
}

/**
 * Get all keywords found in text (for debugging)
 * @param {string} text - OCR text
 * @returns {{ crewHub: string[], mapScreen: string[] }}
 */
function getFoundIndicators(text) {
  const found = { crewHub: [], mapScreen: [] };

  if (!text) return found;

  for (const indicator of CREW_HUB_INDICATORS) {
    const match = text.match(indicator.pattern);
    if (match) {
      found.crewHub.push(match[0]);
    }
  }

  for (const indicator of MAP_SCREEN_INDICATORS) {
    const match = text.match(indicator.pattern);
    if (match) {
      found.mapScreen.push(match[0]);
    }
  }

  return found;
}

module.exports = {
  SCREEN_TYPES,
  detectScreenType,
  detectScreenTypeFromLines,
  isScreenType,
  getFoundIndicators,
};
