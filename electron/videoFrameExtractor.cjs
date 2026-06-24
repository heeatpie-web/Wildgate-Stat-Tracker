'use strict';

const { spawn } = require('child_process');
const path = require('path');

let _ffmpegPath = null;

function getFfmpegPath() {
  if (_ffmpegPath) return _ffmpegPath;
  try {
    // ffmpeg-static returns the binary path; in packaged apps it's in resources/
    _ffmpegPath = require('ffmpeg-static');
    if (_ffmpegPath && typeof _ffmpegPath === 'string') return _ffmpegPath;
  } catch (_) {}
  // Fallback: try system ffmpeg
  _ffmpegPath = 'ffmpeg';
  return _ffmpegPath;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function indexOfPngSignature(buf, startPos = 0) {
  for (let i = startPos; i <= buf.length - PNG_SIGNATURE.length; i++) {
    if (buf[i] === 0x89 && buf.slice(i, i + 8).equals(PNG_SIGNATURE)) return i;
  }
  return -1;
}

/**
 * Async generator that extracts PNG frames from a video file via ffmpeg stdout pipe.
 * Each yielded value: { frameIndex: number, timestampMs: number, pngBuffer: Buffer }
 *
 * @param {string} videoPath - Absolute path to video file
 * @param {{ fps?: number, startSecs?: number, endSecs?: number|null, signal?: { cancelled: boolean } }} opts
 */
async function* extractFrames(videoPath, {
  fps = 0.5,
  startSecs = 0,
  endSecs = null,
  signal = null,
} = {}) {
  const ffmpeg = getFfmpegPath();
  const args = [];

  if (startSecs > 0) {
    args.push('-ss', String(startSecs));
  }
  if (endSecs !== null) {
    args.push('-to', String(endSecs));
  }

  args.push(
    '-i', videoPath,
    '-vf', `fps=${fps}`,
    '-vcodec', 'png',
    '-f', 'image2pipe',
    'pipe:1',
  );

  const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'ignore'] });

  let remainder = Buffer.alloc(0);
  let frameIndex = 0;
  const frameIntervalMs = (1 / fps) * 1000;

  const chunks = [];
  let resolve = null;
  let done = false;
  let spawnError = null;

  proc.stdout.on('data', (chunk) => {
    chunks.push(chunk);
    if (resolve) { const r = resolve; resolve = null; r(); }
  });

  proc.stdout.on('end', () => {
    done = true;
    if (resolve) { const r = resolve; resolve = null; r(); }
  });

  proc.on('error', (err) => {
    spawnError = err;
    done = true;
    if (resolve) { const r = resolve; resolve = null; r(); }
  });

  const waitForData = () => new Promise((res) => { resolve = res; });

  try {
    while (!done || chunks.length > 0) {
      if (signal && signal.cancelled) {
        proc.kill('SIGKILL');
        return;
      }

      if (chunks.length === 0) {
        await waitForData();
        continue;
      }

      remainder = Buffer.concat([remainder, ...chunks.splice(0)]);

      // Demarcate PNG frames by detecting PNG magic byte signatures
      let startIdx = 0;
      while (true) {
        const sigStart = indexOfPngSignature(remainder, startIdx);
        if (sigStart === -1) {
          // No complete frame yet — keep leftover bytes
          remainder = remainder.slice(startIdx);
          break;
        }
        const nextSig = indexOfPngSignature(remainder, sigStart + PNG_SIGNATURE.length);
        if (nextSig === -1) {
          // Only one signature found — wait for more data
          remainder = remainder.slice(sigStart);
          break;
        }
        // Complete PNG: from sigStart to nextSig (exclusive)
        const pngBuffer = remainder.slice(sigStart, nextSig);
        const timestampMs = (startSecs * 1000) + (frameIndex * frameIntervalMs);

        yield { frameIndex, timestampMs, pngBuffer };
        frameIndex++;

        startIdx = nextSig;
      }
    }

    if (spawnError) throw spawnError;

    // Flush any remaining buffer as the last frame
    if (remainder.length > 0 && indexOfPngSignature(remainder) === 0) {
      if (!(signal && signal.cancelled)) {
        const timestampMs = (startSecs * 1000) + (frameIndex * frameIntervalMs);
        yield { frameIndex, timestampMs, pngBuffer: remainder };
      }
    }
  } finally {
    if (!proc.killed) {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }
  }
}

/**
 * Probe video duration in seconds using ffprobe (bundled with ffmpeg-static).
 * Returns null if probe fails.
 */
async function probeVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const ffmpeg = getFfmpegPath();
    const ffprobePath = ffmpeg.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let output = '';
    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output);
        const duration = parseFloat(parsed?.format?.duration);
        resolve(Number.isFinite(duration) ? duration : null);
      } catch (_) {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
    setTimeout(() => { try { proc.kill(); } catch (_) {} resolve(null); }, 10000);
  });
}

module.exports = { extractFrames, probeVideoDuration };
