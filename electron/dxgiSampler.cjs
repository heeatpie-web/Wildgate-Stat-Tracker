/**
 * @module dxgiSampler
 * Samples a screen region using node-screenshots' DXGI-backed monitor capture.
 *
 * node-screenshots exposes raw image data as RGBA. In Electron we request a
 * copied output buffer via toRaw(true) to avoid napi-rs buffer lifetime issues.
 */

let _nodeScreenshots = null;

function getNodeScreenshots() {
  if (_nodeScreenshots) return _nodeScreenshots;
  _nodeScreenshots = require('node-screenshots');
  return _nodeScreenshots;
}

function createSampleSuccess(data) {
  return { success: true, data };
}

function createSampleError(error, fallbackMessage = 'DXGI sample failed') {
  const message = typeof error === 'string'
    ? error.trim()
    : error?.message;
  return {
    success: false,
    error: message || fallbackMessage,
  };
}

function normalizeRegionConfig(config) {
  const x = Number(config?.x);
  const y = Number(config?.y);
  const width = Number(config?.width);
  const height = Number(config?.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function normalizeRelativeBox(box) {
  const rawLeft = Number.isFinite(Number(box?.left)) ? Number(box.left) : Number(box?.x);
  const rawTop = Number.isFinite(Number(box?.top)) ? Number(box.top) : Number(box?.y);
  const rawWidth = Number(box?.width);
  const rawHeight = Number(box?.height);
  if (![rawLeft, rawTop, rawWidth, rawHeight].every(Number.isFinite)) return null;
  if (rawLeft < 0 || rawTop < 0 || rawWidth <= 0 || rawHeight <= 0) return null;
  if ((rawLeft + rawWidth) > 1 || (rawTop + rawHeight) > 1) return null;

  return {
    id: typeof box?.id === 'string' && box.id.trim() ? box.id.trim() : undefined,
    left: rawLeft,
    top: rawTop,
    width: rawWidth,
    height: rawHeight,
  };
}

function getPrimaryMonitor(monitors) {
  return monitors.find((monitor) => monitor.isPrimary()) || monitors[0] || null;
}

function resolveMonitorForRegion(regionConfig) {
  const { Monitor } = getNodeScreenshots();
  const monitors = Monitor.all();
  if (!monitors.length) return null;
  return Monitor.fromPoint(regionConfig.x, regionConfig.y) || getPrimaryMonitor(monitors);
}

function clampRegionToMonitor(regionConfig, monitor) {
  if (!monitor) return null;

  const monitorX = Math.round(Number(monitor.x()) || 0);
  const monitorY = Math.round(Number(monitor.y()) || 0);
  const monitorWidth = Math.max(0, Math.round(Number(monitor.width()) || 0));
  const monitorHeight = Math.max(0, Math.round(Number(monitor.height()) || 0));
  if (monitorWidth <= 0 || monitorHeight <= 0) return null;

  const monitorRight = monitorX + monitorWidth;
  const monitorBottom = monitorY + monitorHeight;
  const left = Math.min(Math.max(regionConfig.x, monitorX), monitorRight - 1);
  const top = Math.min(Math.max(regionConfig.y, monitorY), monitorBottom - 1);
  const width = Math.min(regionConfig.width, monitorRight - left);
  const height = Math.min(regionConfig.height, monitorBottom - top);
  if (width <= 0 || height <= 0) return null;

  return {
    x: left,
    y: top,
    width,
    height,
    localX: left - monitorX,
    localY: top - monitorY,
  };
}

/**
 * Sample the region via a single DXGI-backed monitor capture.
 * Returns averaged RGB values across all pixels in the region.
 *
 * @param {{ x: number, y: number, width: number, height: number }} config
 * @returns {Promise<{ success: true, data: { avgR: number, avgG: number, avgB: number } } | { success: false, error: string }>}
 */
async function sampleRegion(config) {
  try {
    const regionConfig = normalizeRegionConfig(config);
    if (!regionConfig) {
      return createSampleError('Invalid DXGI sample region configuration');
    }

    const targetMonitor = resolveMonitorForRegion(regionConfig);
    if (!targetMonitor) {
      return createSampleError('No monitor found for DXGI sample region');
    }

    const boundedRegion = clampRegionToMonitor(regionConfig, targetMonitor);
    if (!boundedRegion) {
      return createSampleError('DXGI sample region falls outside the target monitor');
    }

    const image = await targetMonitor.captureImage();
    const cropped = await image.crop(
      boundedRegion.localX,
      boundedRegion.localY,
      boundedRegion.width,
      boundedRegion.height
    );
    const raw = await cropped.toRaw(true);
    const pixelCount = boundedRegion.width * boundedRegion.height;
    if (!pixelCount || raw.length < (pixelCount * 4)) {
      return createSampleError('DXGI sample returned empty image data');
    }

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < raw.length; i += 4) {
      sumR += raw[i];
      sumG += raw[i + 1];
      sumB += raw[i + 2];
    }

    return createSampleSuccess({
      avgR: Math.round(sumR / pixelCount),
      avgG: Math.round(sumG / pixelCount),
      avgB: Math.round(sumB / pixelCount),
    });
  } catch (error) {
    return createSampleError(error);
  }
}

async function sampleBoxes(config = {}) {
  try {
    const regionConfig = normalizeRegionConfig(config);
    if (!regionConfig) {
      return createSampleError('Invalid DXGI sample region configuration');
    }

    const normalizedBoxes = Array.isArray(config?.boxes)
      ? config.boxes.map((box) => normalizeRelativeBox(box)).filter(Boolean)
      : [];
    if (!normalizedBoxes.length) {
      return createSampleError('No DXGI sample boxes configured');
    }

    const whiteMinChannel = Number.isFinite(Number(config?.whiteMinChannel))
      ? Math.max(0, Math.min(255, Math.round(Number(config.whiteMinChannel))))
      : 210;
    const whiteMaxDrift = Number.isFinite(Number(config?.whiteMaxDrift))
      ? Math.max(0, Math.min(255, Math.round(Number(config.whiteMaxDrift))))
      : 30;

    const targetMonitor = resolveMonitorForRegion(regionConfig);
    if (!targetMonitor) {
      return createSampleError('No monitor found for DXGI sample region');
    }

    const boundedRegion = clampRegionToMonitor(regionConfig, targetMonitor);
    if (!boundedRegion) {
      return createSampleError('DXGI sample region falls outside the target monitor');
    }

    const image = await targetMonitor.captureImage();
    const cropped = await image.crop(
      boundedRegion.localX,
      boundedRegion.localY,
      boundedRegion.width,
      boundedRegion.height
    );
    const raw = await cropped.toRaw(true);
    const channels = 4;
    const pixelCount = boundedRegion.width * boundedRegion.height;
    if (!pixelCount || raw.length < (pixelCount * channels)) {
      return createSampleError('DXGI sample returned empty image data');
    }

    const boxes = normalizedBoxes.map((box) => {
      const left = Math.max(0, Math.min(boundedRegion.width - 1, Math.floor(box.left * boundedRegion.width)));
      const top = Math.max(0, Math.min(boundedRegion.height - 1, Math.floor(box.top * boundedRegion.height)));
      const width = Math.max(1, Math.min(boundedRegion.width - left, Math.floor(box.width * boundedRegion.width)));
      const height = Math.max(1, Math.min(boundedRegion.height - top, Math.floor(box.height * boundedRegion.height)));

      let brightPixelCount = 0;
      let brightnessSum = 0;

      for (let y = top; y < (top + height); y += 1) {
        for (let x = left; x < (left + width); x += 1) {
          const offset = ((y * boundedRegion.width) + x) * channels;
          const r = raw[offset];
          const g = raw[offset + 1];
          const b = raw[offset + 2];
          const maxChannel = Math.max(r, g, b);
          const minChannel = Math.min(r, g, b);

          if (minChannel >= whiteMinChannel && (maxChannel - minChannel) <= whiteMaxDrift) {
            brightPixelCount += 1;
          }

          brightnessSum += (r + g + b) / 3;
        }
      }

      const boxPixelCount = Math.max(1, width * height);
      return {
        id: box.id,
        whiteRatio: brightPixelCount / boxPixelCount,
        avgBrightness: brightnessSum / boxPixelCount,
      };
    });

    return createSampleSuccess({ boxes });
  } catch (error) {
    return createSampleError(error);
  }
}

const __test__ = {
  clampRegionToMonitor,
  createSampleError,
  createSampleSuccess,
  normalizeRegionConfig,
  normalizeRelativeBox,
};

module.exports = { sampleRegion, sampleBoxes, __test__ };
