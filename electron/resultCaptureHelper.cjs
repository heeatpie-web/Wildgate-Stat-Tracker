'use strict';

const sharp = require('sharp');

function decodeImageBase64(imageBase64) {
  const normalized = String(imageBase64 || '')
    .trim()
    .replace(/^data:image\/\w+;base64,/, '');

  if (!normalized) return null;
  return Buffer.from(normalized, 'base64');
}

function normalizeCropRegion(region, meta = {}) {
  const source = region && typeof region === 'object' ? region : null;
  if (!source) return null;

  const imageWidth = Math.max(0, Math.round(Number(meta?.width) || 0));
  const imageHeight = Math.max(0, Math.round(Number(meta?.height) || 0));
  if (imageWidth <= 0 || imageHeight <= 0) return null;

  const rawX = Number.isFinite(Number(source.x)) ? Number(source.x) : Number(source.left);
  const rawY = Number.isFinite(Number(source.y)) ? Number(source.y) : Number(source.top);
  const rawWidth = Number(source.width);
  const rawHeight = Number(source.height);

  if (![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite)) {
    return null;
  }

  const shouldTreatAsNormalized = source.normalized === true
    || (
      rawX >= 0 && rawX <= 1 &&
      rawY >= 0 && rawY <= 1 &&
      rawWidth > 0 && rawWidth <= 1 &&
      rawHeight > 0 && rawHeight <= 1
    );

  const left = shouldTreatAsNormalized
    ? Math.round(rawX * imageWidth)
    : Math.round(rawX);
  const top = shouldTreatAsNormalized
    ? Math.round(rawY * imageHeight)
    : Math.round(rawY);
  const width = shouldTreatAsNormalized
    ? Math.round(rawWidth * imageWidth)
    : Math.round(rawWidth);
  const height = shouldTreatAsNormalized
    ? Math.round(rawHeight * imageHeight)
    : Math.round(rawHeight);

  if (width <= 0 || height <= 0) return null;

  const boundedLeft = Math.min(Math.max(0, left), Math.max(0, imageWidth - 1));
  const boundedTop = Math.min(Math.max(0, top), Math.max(0, imageHeight - 1));
  const boundedWidth = Math.min(width, imageWidth - boundedLeft);
  const boundedHeight = Math.min(height, imageHeight - boundedTop);
  if (boundedWidth <= 0 || boundedHeight <= 0) return null;

  return {
    left: boundedLeft,
    top: boundedTop,
    width: boundedWidth,
    height: boundedHeight,
  };
}

async function cropImageBuffer(imageBuffer, region) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('Image buffer is unavailable');
  }

  if (!region) {
    return Buffer.from(imageBuffer);
  }

  const image = sharp(imageBuffer, { failOn: 'none' });
  const meta = await image.metadata();
  const crop = normalizeCropRegion(region, meta);
  if (!crop) {
    throw new Error('Invalid crop region');
  }

  return image.extract(crop).png().toBuffer();
}

const __test__ = {
  decodeImageBase64,
  normalizeCropRegion,
};

module.exports = {
  cropImageBuffer,
  decodeImageBase64,
  normalizeCropRegion,
  __test__,
};
