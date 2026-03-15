import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bundleMatchArtifacts,
  getMatchArtifactsStructured,
  getArtifactsForMatch,
  removeAllMatchArtifacts,
  removeMatchArtifact,
  addMatchArtifact,
  reassignMatchArtifact,
  rerunOCROnArtifact,
} from '../artifactService';
import { getElectronAPI } from '../electronAPI';

vi.mock('../electronAPI', () => ({
  getElectronAPI: vi.fn(),
}));

const mockInvoke = vi.fn();
const mockApi = { invoke: mockInvoke };

describe('artifactService', () => {
  beforeEach(() => {
    vi.mocked(getElectronAPI).mockReturnValue(mockApi as any);
    mockInvoke.mockReset();
  });

  describe('bundleMatchArtifacts', () => {
    it('returns [] when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      const result = await bundleMatchArtifacts(1, 1000, 2000);
      expect(result).toEqual([]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('invokes bundle-artifacts with matchId, startTime, endTime and returns result', async () => {
      mockInvoke.mockResolvedValue(['/path/a.png', '/path/b.png']);
      const result = await bundleMatchArtifacts(42, 1000, 3000);
      expect(mockInvoke).toHaveBeenCalledWith('bundle-artifacts', { matchId: 42, startTime: 1000, endTime: 3000 });
      expect(result).toEqual(['/path/a.png', '/path/b.png']);
    });

    it('returns [] when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'));
      const result = await bundleMatchArtifacts(1, 0, 1000);
      expect(result).toEqual([]);
    });

    it('returns [] when invoke returns null/undefined', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const result = await bundleMatchArtifacts(1, 0, 1000);
      expect(result).toEqual([]);
    });
  });

  describe('getMatchArtifactsStructured', () => {
    it('returns empty structure when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      const result = await getMatchArtifactsStructured(1);
      expect(result).toEqual({ images: [], imageFiles: [], telemetry: [], missingImages: [], resolvedFromDisk: false });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('invokes get-match-artifacts with structured payload and returns object format', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          images: ['/a.png'],
          imageFiles: [{ artifactId: 'tok_1', filename: 'a.png', path: '/a.png' }],
          telemetry: [{ event: 'test' }],
        },
      });
      const result = await getMatchArtifactsStructured(5);
      expect(mockInvoke).toHaveBeenCalledWith('get-match-artifacts', { matchId: 5, fallbackImages: [] });
      expect(result).toEqual({
        images: ['\\a.png'],
        imageFiles: [{ artifactId: 'tok_1', filename: 'a.png', path: '/a.png' }],
        telemetry: [[{ event: 'test' }]],
        missingImages: [],
        resolvedFromDisk: true,
      });
    });

    it('returns only disk-backed images and reports missing fallback references', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          images: ['C:\\\\new\\\\match_artifacts\\\\12\\\\shot_1.png'],
          imageFiles: [{ artifactId: 'tok_1', filename: 'shot_1.png', path: 'C:\\\\new\\\\match_artifacts\\\\12\\\\shot_1.png' }],
          telemetry: [],
        },
      });
      const result = await getMatchArtifactsStructured(12, [
        'D:\\\\old\\\\match_artifacts\\\\12\\\\shot_1.png',
        'D:\\\\old\\\\match_artifacts\\\\12\\\\shot_2.png',
      ]);
      expect(result.images).toEqual(['C:\\new\\match_artifacts\\12\\shot_1.png']);
      expect(result.imageFiles[0]?.path).toBe('C:\\\\new\\\\match_artifacts\\\\12\\\\shot_1.png');
      expect(result.missingImages).toEqual(['D:\\old\\match_artifacts\\12\\shot_1.png', 'D:\\old\\match_artifacts\\12\\shot_2.png']);
      expect(result.resolvedFromDisk).toBe(true);
    });

    it('retains valid fallback images returned from merged match folders with artifact tokens', async () => {
      const mergedFallback = 'D:\\\\merged\\\\match_artifacts\\\\77\\\\shot_2.png';
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          images: [mergedFallback],
          imageFiles: [{ artifactId: 'tok_fallback', filename: 'shot_2.png', path: mergedFallback }],
          telemetry: [],
        },
      });
      const result = await getMatchArtifactsStructured(12, [mergedFallback]);

      expect(result.images).toEqual(['D:\\merged\\match_artifacts\\77\\shot_2.png']);
      expect(result.imageFiles).toEqual([{
        artifactId: 'tok_fallback',
        filename: 'shot_2.png',
        path: mergedFallback,
      }]);
      expect(result.missingImages).toEqual([]);
      expect(result.resolvedFromDisk).toBe(true);
    });

    it('handles legacy array result (backward compatibility)', async () => {
      mockInvoke.mockResolvedValue(['/img1.png', '/img2.png']);
      const result = await getMatchArtifactsStructured(1);
      expect(result).toEqual({ images: ['\\img1.png', '\\img2.png'], imageFiles: [], telemetry: [], missingImages: [], resolvedFromDisk: false });
    });

    it('returns empty structure when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'));
      const result = await getMatchArtifactsStructured(1);
      expect(result).toEqual({ images: [], imageFiles: [], telemetry: [], missingImages: [], resolvedFromDisk: false });
    });
  });

  describe('getArtifactsForMatch', () => {
    it('returns images from getMatchArtifactsStructured', async () => {
      mockInvoke.mockResolvedValue({ images: ['/a.png'], imageFiles: [], telemetry: [] });
      const result = await getArtifactsForMatch(1);
      expect(result).toEqual(['\\a.png']);
    });
  });

  describe('removeMatchArtifact', () => {
    it('returns error when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      const result = await removeMatchArtifact(1, 'file.png');
      expect(result).toEqual({ success: false, error: 'Electron API not available' });
    });

    it('invokes remove-match-artifact and returns result', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: { removed: 'capture_123.png' } });
      const result = await removeMatchArtifact(2, 'artifact-token-1');
      expect(mockInvoke).toHaveBeenCalledWith('remove-match-artifact', { matchId: 2, artifactId: 'artifact-token-1' });
      expect(result).toEqual({ success: true });
    });

    it('maps structured IPC failures to error result', async () => {
      mockInvoke.mockResolvedValue({ success: false, code: 'INVALID_INPUT', message: 'Invalid or expired artifactId' });
      const result = await removeMatchArtifact(2, 'forged-token');
      expect(result).toEqual({ success: false, code: 'INVALID_INPUT', error: 'Invalid or expired artifactId' });
    });
  });

  describe('removeAllMatchArtifacts', () => {
    it('prefers the bulk removal IPC when available', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          removedPaths: [
            'C:\\new\\match_artifacts\\12\\shot_1.png',
            'D:\\old\\match_artifacts\\77\\shot_2.png',
          ],
          failedPaths: [],
        },
      });

      const result = await removeAllMatchArtifacts(12, ['D:\\old\\match_artifacts\\77\\shot_2.png']);

      expect(result).toEqual({
        removedPaths: [
          'C:\\new\\match_artifacts\\12\\shot_1.png',
          'D:\\old\\match_artifacts\\77\\shot_2.png',
        ],
        failedPaths: [],
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('remove-all-match-artifacts', {
        matchId: 12,
        fallbackImages: ['D:\\old\\match_artifacts\\77\\shot_2.png'],
      });
    });

    it('falls back to token-backed removal when the bulk IPC fails', async () => {
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'remove-all-match-artifacts') {
          expect(payload).toEqual({ matchId: 12, fallbackImages: ['D:\\old\\match_artifacts\\77\\shot_2.png'] });
          return Promise.reject(new Error('channel unavailable'));
        }
        if (channel === 'get-match-artifacts') {
          return Promise.resolve({
            success: true,
            data: {
              images: [
                'C:\\new\\match_artifacts\\12\\shot_1.png',
                'D:\\old\\match_artifacts\\77\\shot_2.png',
              ],
              imageFiles: [
                { artifactId: 'tok_1', filename: 'shot_1.png', path: 'C:\\new\\match_artifacts\\12\\shot_1.png' },
                { artifactId: 'tok_2', filename: 'shot_2.png', path: 'D:\\old\\match_artifacts\\77\\shot_2.png' },
              ],
              telemetry: [],
            },
          });
        }
        if (channel === 'remove-match-artifact') {
          return Promise.resolve({ success: true, data: { removed: 'shot_1.png' } });
        }
        return Promise.resolve(null);
      });

      const result = await removeAllMatchArtifacts(12, ['D:\\old\\match_artifacts\\77\\shot_2.png']);

      expect(result).toEqual({
        removedPaths: [
          'C:\\new\\match_artifacts\\12\\shot_1.png',
          'D:\\old\\match_artifacts\\77\\shot_2.png',
        ],
        failedPaths: [],
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'remove-all-match-artifacts', {
        matchId: 12,
        fallbackImages: ['D:\\old\\match_artifacts\\77\\shot_2.png'],
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'get-match-artifacts', {
        matchId: 12,
        fallbackImages: ['D:\\old\\match_artifacts\\77\\shot_2.png'],
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'remove-match-artifact', { matchId: 12, artifactId: 'tok_1' });
      expect(mockInvoke).toHaveBeenNthCalledWith(4, 'remove-match-artifact', { matchId: 12, artifactId: 'tok_2' });
    });

    it('surfaces failed paths returned by the bulk removal IPC', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          removedPaths: ['C:\\new\\match_artifacts\\12\\shot_1.png'],
          failedPaths: ['C:\\new\\match_artifacts\\12\\shot_2.png'],
        },
      });

      const result = await removeAllMatchArtifacts(12);

      expect(result).toEqual({
        removedPaths: ['C:\\new\\match_artifacts\\12\\shot_1.png'],
        failedPaths: ['C:\\new\\match_artifacts\\12\\shot_2.png'],
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('addMatchArtifact', () => {
    it('returns error when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      const result = await addMatchArtifact(1);
      expect(result).toEqual({ success: false, error: 'Electron API not available' });
    });

    it('invokes add-match-artifact with matchId and returns result', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: { added: ['/path/added_1.png'], canceled: false } });
      const result = await addMatchArtifact(3);
      expect(mockInvoke).toHaveBeenCalledWith('add-match-artifact', { matchId: 3 });
      expect(result).toEqual({ success: true, added: ['/path/added_1.png'] });
    });
  });

  describe('reassignMatchArtifact', () => {
    it('returns error when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      const result = await reassignMatchArtifact(1, 2, 'artifact-token');
      expect(result).toEqual({ success: false, error: 'Electron API not available' });
    });

    it('invokes reassign-match-artifact and returns moved payload', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          sourceMatchId: 1,
          targetMatchId: 2,
          sourcePath: 'C:\\match_artifacts\\1\\capture.png',
          targetPath: 'C:\\match_artifacts\\2\\capture.png',
          filename: 'capture.png',
        },
      });
      const result = await reassignMatchArtifact(1, 2, 'artifact-token');
      expect(mockInvoke).toHaveBeenCalledWith('reassign-match-artifact', { sourceMatchId: 1, targetMatchId: 2, artifactId: 'artifact-token' });
      expect(result).toEqual({
        success: true,
        moved: {
          sourceMatchId: 1,
          targetMatchId: 2,
          sourcePath: 'C:\\match_artifacts\\1\\capture.png',
          targetPath: 'C:\\match_artifacts\\2\\capture.png',
          filename: 'capture.png',
        },
      });
    });
  });
  describe('rerunOCROnArtifact', () => {
    it('throws when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      await expect(rerunOCROnArtifact('/p.png', 'user', 'both')).rejects.toThrow('Electron API not available');
    });

    it('invokes rerun-ocr-on-artifact with imagePath, activeUser, ocrMode', async () => {
      mockInvoke.mockResolvedValue({ teammates: [], opponents: [] });
      await rerunOCROnArtifact('/path/img.png', 'TestPilot', 'local');
      expect(mockInvoke).toHaveBeenCalledWith('rerun-ocr-on-artifact', {
        imagePath: '/path/img.png',
        activeUser: 'TestPilot',
        ocrMode: 'local',
      });
    });

    it('passes optional ocrRegions when provided', async () => {
      mockInvoke.mockResolvedValue({ teammates: [], opponents: [] });
      const ocrRegions = {
        crewHub: {
          leftPanel: { xMin: 0.0, xMax: 0.48, yMin: 0.05, yMax: 0.85 },
          enemyPanel: { xMin: 0.55, xMax: 1.0, yMin: 0.08, yMax: 0.95 },
          teamHeader: { xMin: 0, xMax: 0.45, yMin: 0.05, yMax: 0.2 },
          enemyName: { xMin: 0.63, xMax: 0.92, yMin: 0.08, yMax: 0.95 },
        },
        mapScreen: {
          yourShip: { xMin: 0, xMax: 0.3, yMin: 0, yMax: 0.25 },
          enemyShips: { xMin: 0.6, xMax: 1, yMin: 0.00, yMax: 0.10 },
          enemyShips2: { xMin: 0.6, xMax: 1, yMin: 0.10, yMax: 0.20 },
          enemyShips3: { xMin: 0.6, xMax: 1, yMin: 0.20, yMax: 0.30 },
          enemyShips4: { xMin: 0.6, xMax: 1, yMin: 0.30, yMax: 0.40 },
          hazards: { xMin: 0.6, xMax: 1, yMin: 0.3, yMax: 0.7 },
          players: { xMin: 0, xMax: 0.4, yMin: 0.7, yMax: 1 },
        },
      };
      await rerunOCROnArtifact('/path/img.png', 'TestPilot', 'cloud', ocrRegions);
      expect(mockInvoke).toHaveBeenCalledWith('rerun-ocr-on-artifact', {
        imagePath: '/path/img.png',
        activeUser: 'TestPilot',
        ocrMode: 'cloud',
        ocrRegions,
      });
    });

    it('passes optional runtimeOptions when provided', async () => {
      mockInvoke.mockResolvedValue({ teammates: [], opponents: [] });
      const runtimeOptions = {
        routingProfile: 'names-only',
        fontProfile: 'ealing-black-italic',
        nameRerouteThreshold: 78,
        maxReroutePasses: 1,
        externalFallbackEnabled: true,
        externalFallbackThreshold: 0.72,
        externalOnDetectorDisagreement: true,
        forceMaxAnalysis: true,
        forceUncached: true,
      } as const;
      await rerunOCROnArtifact('/path/img.png', 'TestPilot', 'both', undefined, runtimeOptions);
      expect(mockInvoke).toHaveBeenCalledWith('rerun-ocr-on-artifact', {
        imagePath: '/path/img.png',
        activeUser: 'TestPilot',
        ocrMode: 'both',
        runtimeOptions,
      });
    });
  });
});


