'use strict';

const { captureGameWindowBuffer } = require('./ocrHandler.cjs');
const { paddleOcrBuffer } = require('./paddleOcrHandler.cjs');
const { detectScreenTypeFromLines } = require('./screenDetector.cjs');
const sharp = require('sharp');

const POLL_INTERVAL_MS = 3_000;
const COOLDOWN_MS = 45_000;
const CONFIDENCE_THRESHOLD = 60;

let _timer = null;
let _pollInFlight = false;
let _cooldownUntil = 0;
let _opts = null;

async function pollOnce() {
  if (_pollInFlight) return;
  if (Date.now() < _cooldownUntil) return;
  _pollInFlight = true;
  try {
    const rawBuffer = await captureGameWindowBuffer();
    const meta = await sharp(rawBuffer).metadata();
    const cropHeight = Math.round((meta.height || 1080) * 0.40);
    const cropWidth = meta.width || 1920;
    const croppedBuffer = await sharp(rawBuffer)
      .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
    const ocrLines = await paddleOcrBuffer(croppedBuffer, { performanceMode: true });
    const { type, confidence } = detectScreenTypeFromLines(ocrLines, cropWidth, cropHeight);
    if (type === 'mapScreen' && confidence >= CONFIDENCE_THRESHOLD) {
      _cooldownUntil = Date.now() + COOLDOWN_MS;
      _opts?.onDetected({ confidence, detectedAt: Date.now() });
    }
  } catch (err) {
    _opts?.onError?.(err);
  } finally {
    _pollInFlight = false;
  }
}

function startTacticalMapMonitor(opts) {
  stopTacticalMapMonitor();
  _opts = opts || {};
  _cooldownUntil = 0;
  _timer = setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
  void pollOnce();
}

function stopTacticalMapMonitor() {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _pollInFlight = false;
  _cooldownUntil = 0;
  _opts = null;
}

function isTacticalMapMonitorRunning() {
  return _timer !== null;
}

module.exports = { startTacticalMapMonitor, stopTacticalMapMonitor, isTacticalMapMonitorRunning };
