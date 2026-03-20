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

const __test__ = {
  clampRegionToMonitor,
  createSampleError,
  createSampleSuccess,
  normalizeRegionConfig,
};

module.exports = { sampleRegion, __test__ };
