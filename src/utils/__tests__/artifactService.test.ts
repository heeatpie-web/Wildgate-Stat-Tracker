import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bundleMatchArtifacts,
  getMatchArtifactsStructured,
  getArtifactsForMatch,
  removeMatchArtifact,
  addMatchArtifact,
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
      expect(result).toEqual({ images: [], imageFiles: [], telemetry: [] });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('invokes get-match-artifacts with matchId and returns object format', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          images: ['/a.png'],
          imageFiles: [{ artifactId: 'tok_1', filename: 'a.png', path: '/a.png' }],
          telemetry: [{ event: 'test' }],
        },
      });
      const result = await getMatchArtifactsStructured(5);
      expect(mockInvoke).toHaveBeenCalledWith('get-match-artifacts', 5);
      expect(result).toEqual({
        images: ['/a.png'],
        imageFiles: [{ artifactId: 'tok_1', filename: 'a.png', path: '/a.png' }],
        telemetry: [{ event: 'test' }],
      });
    });

    it('handles legacy array result (backward compatibility)', async () => {
      mockInvoke.mockResolvedValue(['/img1.png', '/img2.png']);
      const result = await getMatchArtifactsStructured(1);
      expect(result).toEqual({ images: ['/img1.png', '/img2.png'], imageFiles: [], telemetry: [] });
    });

    it('returns empty structure when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'));
      const result = await getMatchArtifactsStructured(1);
      expect(result).toEqual({ images: [], imageFiles: [], telemetry: [] });
    });
  });

  describe('getArtifactsForMatch', () => {
    it('returns images from getMatchArtifactsStructured', async () => {
      mockInvoke.mockResolvedValue({ images: ['/a.png'], imageFiles: [], telemetry: [] });
      const result = await getArtifactsForMatch(1);
      expect(result).toEqual(['/a.png']);
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

  describe('rerunOCROnArtifact', () => {
    it('throws when Electron API is not available', async () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);
      await expect(rerunOCROnArtifact('/p.png', 'user', 'both')).rejects.toThrow('Electron API not available');
    });

    it('invokes rerun-ocr-on-artifact with imagePath, activeUser, ocrMode', async () => {
      mockInvoke.mockResolvedValue({ teammates: [], opponents: [] });
      await rerunOCROnArtifact('/path/img.png', 'Alec', 'local');
      expect(mockInvoke).toHaveBeenCalledWith('rerun-ocr-on-artifact', {
        imagePath: '/path/img.png',
        activeUser: 'Alec',
        ocrMode: 'local',
      });
    });
  });
});
