/**
 * @module geminiService
 * Vertex AI Gemini structured extraction service for OCR refinement.
 */
const fs = require('fs');
let GoogleAuth = null;
try {
  ({ GoogleAuth } = require('google-auth-library'));
} catch {
  GoogleAuth = null;
}

class GeminiService {
  constructor() {
    this.isInitialized = false;
    this.auth = null;
    this.projectId = null;
    this.location = process.env.WILDGATE_VERTEX_LOCATION || 'us-central1';
    this.model = process.env.WILDGATE_GEMINI_MODEL || 'gemini-3.0-flash';
  }

  initialize(keyPath) {
    try {
      if (!GoogleAuth) {
        console.warn('[GeminiService] google-auth-library not available');
        this.isInitialized = false;
        return;
      }
      if (!keyPath || !fs.existsSync(keyPath)) {
        this.isInitialized = false;
        return;
      }
      const key = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
      this.projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || key.project_id || null;
      if (!this.projectId) {
        console.warn('[GeminiService] Missing project_id in key/env; Gemini disabled');
        this.isInitialized = false;
        return;
      }
      this.auth = new GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      this.isInitialized = true;
      console.log(`[GeminiService] Initialized (${this.model}, ${this.location})`);
    } catch (e) {
      console.error('[GeminiService] Init Error:', e.message);
      this.isInitialized = false;
    }
  }

  async extractStructured(imagePath, activeUser = null, hintText = '') {
    if (!this.isInitialized || !this.auth || !this.projectId) return null;
    if (!imagePath || !fs.existsSync(imagePath)) return null;

    try {
      const imageBytes = fs.readFileSync(imagePath).toString('base64');
      const client = await this.auth.getClient();
      const tokenRes = await client.getAccessToken();
      const token = tokenRes?.token || tokenRes;
      if (!token) throw new Error('Failed to obtain access token');

      const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;

      const prompt = [
        '# Task: Extract Wildgate Match Data',
        'You are analyzing a screenshot from the game "Wildgate" to extract structured match data.',
        '',
        '## Known Ship Types (exact names):',
        'Hunter (4 Player), Bastion (4 Player), Privateer (4 Player), Scout (3 Player), Outlaw (2 Player), Solo Outlaw',
        'Common OCR misreads: "BUNTER" = Hunter, "BAST1ON" = Bastion',
        '',
        '## Known Characters:',
        'Adrian, Venture, Kae, Sammo, Ion, Mophs, Sal, Charlie',
        '',
        '## Known Reach Modifiers/Artifacts:',
        'Ancient Vault, Cryon Reach, Dead Sensors, Deadworlds, Easy Loot, Epic Loot, Fast Gate, Few asteroids, Few Ships,',
        'Gloaming Expanse, Haunted Storm, Ice Storm, Lava Epics, Leech Swarms, Legion Patrols, Low altitude fog,',
        'Many asteroids, Rogue Turrets, Sandstorm, Artifact: Healing, Artifact: Ice, Artifact: Weapon',
        '',
        '## OCR Error Patterns to Watch For:',
        '- "0" (zero) vs "O" (letter O)',
        '- "1" (one) vs "I" (letter i) vs "l" (lowercase L)',
        '- "5" vs "S"',
        '- "8" vs "B"',
        '- Spaces in player names may be missing or extra',
        '',
        '## Output Schema (strict JSON only):',
        '{',
        '  "playerShip": {',
        '    "shipType": string|null,',
        '    "confidence": number (0-100)',
        '  },',
        '  "teammates": [',
        '    {',
        '      "name": string,',
        '      "shipType": string|null,',
        '      "confidence": number (0-100)',
        '    }',
        '  ],',
        '  "opponentTeams": [',
        '    {',
        '      "teamName": string,',
        '      "color": string|null,',
        '      "players": [',
        '        {',
        '          "name": string,',
        '          "shipType": string|null,',
        '          "confidence": number (0-100)',
        '        }',
        '      ]',
        '    }',
        '  ],',
        '  "reachModifiers": [string],',
        '  "artifactType": string|null,',
        '  "overallConfidence": number (0-100)',
        '}',
        '',
        '## Instructions:',
        '1. Carefully examine the screenshot for player cards, team groupings, and UI elements',
        '2. Extract player names EXACTLY as shown (preserve capitalization, spacing)',
        '3. Match ship types to the known list above (use null if unclear)',
        '4. Identify team colors from visual indicators (red, blue, green, yellow, etc.)',
        '5. Assign confidence scores based on text clarity and OCR quality',
        '6. If a field is unclear or missing, use null and lower the confidence',
        '7. Do NOT include markdown code fences in your response',
        '8. Return ONLY valid JSON',
        '',
        activeUser ? `## Active User: "${activeUser}"` : '',
        activeUser ? 'This is the current player - their ship is "playerShip", others on same team are "teammates"' : '',
        '',
        hintText ? '## OCR Hint Text (may contain errors):' : '',
        hintText ? String(hintText).slice(0, 5000) : '',
      ].filter(Boolean).join('\n');

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: imageBytes } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gemini API ${res.status}: ${txt.slice(0, 300)}`);
      }

      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!raw) return null;

      try {
        return JSON.parse(raw);
      } catch {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned);
      }
    } catch (e) {
      console.warn('[GeminiService] Extraction failed:', e.message);
      return null;
    }
  }
}

module.exports = new GeminiService();

