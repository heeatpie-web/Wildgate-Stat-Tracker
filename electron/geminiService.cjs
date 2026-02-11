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
    this.model = process.env.WILDGATE_GEMINI_MODEL || 'gemini-1.5-flash';
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
        'You extract structured match data from a Wildgate screenshot.',
        'Return ONLY strict JSON with this schema:',
        '{"playerShip":{"shipType":string|null},"teammates":[string],"opponentTeams":[{"teamName":string,"shipType":string|null,"color":string|null,"players":[string]}],"reachModifiers":[string],"artifactType":string|null}',
        'Rules:',
        '- Keep names exactly as seen, no explanations.',
        '- If unknown, use null or empty arrays.',
        '- Do not include markdown fences.',
        activeUser ? `Active user is "${activeUser}".` : '',
        hintText ? `OCR hint text:\n${String(hintText).slice(0, 5000)}` : '',
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

