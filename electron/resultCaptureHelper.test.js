import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const {
  cropImageBuffer,
  decodeImageBase64,
  normalizeCropRegion,
} = require('./resultCaptureHelper.cjs');

describe('resultCaptureHelper', () => {
  it('normalizes normalized crop regions against the source image size', () => {
    expect(normalizeCropRegion({
      left: 0.25,
      top: 0.5,
      width: 0.5,
      height: 0.25,
      normalized: true,
    }, {
      width: 1920,
      height: 1080,
    })).toEqual({
      left: 480,
      top: 540,
      width: 960,
      height: 270,
    });
  });

  it('decodes data-uri image base64 strings', () => {
    const buffer = decodeImageBase64('data:image/png;base64,SGVsbG8=');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8')).toBe('Hello');
  });

  it('crops an image buffer to the requested region', async () => {
    const raw = Buffer.alloc(4 * 4 * 3);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const index = ((y * 4) + x) * 3;
        raw[index] = x * 40;
        raw[index + 1] = y * 50;
        raw[index + 2] = x + y;
      }
    }

    const imageBuffer = await sharp(raw, {
      raw: {
        width: 4,
        height: 4,
        channels: 3,
      },
    }).png().toBuffer();

    const cropped = await cropImageBuffer(imageBuffer, {
      left: 0.5,
      top: 0.5,
      width: 0.5,
      height: 0.5,
      normalized: true,
    });

    const metadata = await sharp(cropped).metadata();
    expect(metadata.width).toBe(2);
    expect(metadata.height).toBe(2);

    const { data } = await sharp(cropped)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(Array.from(data.slice(0, 3))).toEqual([80, 100, 4]);
  });
});
