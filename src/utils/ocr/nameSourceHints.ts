import { normalizeOcrName } from '../stringUtils';
import type { OCRExtractedData } from './ocrTypes';

export type OcrNameSourceRole = 'teammate' | 'opponent';

export interface OcrNameSourceHint {
  imagePath: string;
  imageIndex: number;
  sourceRole: OcrNameSourceRole;
  teamName?: string;
  teamColor?: string;
}

export type OcrNameSourceMap = Record<string, OcrNameSourceHint[]>;

interface RerunPerFileEntry {
  imagePath: string;
  success: boolean;
  data?: OCRExtractedData;
}

const toName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = (value as { name?: unknown }).name;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
};

const toNameKey = (value: string): string =>
  normalizeOcrName(value || '').toLowerCase();

const toCleanPath = (value: string): string =>
  String(value || '').trim();

const pushHint = (
  target: OcrNameSourceMap,
  seen: Set<string>,
  name: string,
  hint: OcrNameSourceHint
) => {
  const key = toNameKey(name);
  if (!key) return;
  const signature = [
    key,
    hint.imagePath.toLowerCase(),
    hint.imageIndex,
    hint.sourceRole,
    String(hint.teamName || '').toLowerCase(),
    String(hint.teamColor || '').toLowerCase(),
  ].join('|');
  if (seen.has(signature)) return;
  seen.add(signature);
  if (!target[key]) target[key] = [];
  target[key].push(hint);
};

export const buildOcrNameSourceMap = (
  perFile: RerunPerFileEntry[]
): OcrNameSourceMap => {
  const out: OcrNameSourceMap = {};
  const seen = new Set<string>();

  (perFile || []).forEach((entry, imageIndex) => {
    if (!entry?.success || !entry?.data) return;
    const imagePath = toCleanPath(entry.imagePath);
    if (!imagePath) return;

    (entry.data.teammates || []).forEach((player) => {
      const name = toName(player);
      if (!name) return;
      pushHint(out, seen, name, {
        imagePath,
        imageIndex,
        sourceRole: 'teammate',
      });
    });

    (entry.data.opponentTeams || []).forEach((team) => {
      const teamName = String(team?.teamName || '').trim();
      const teamColor = String(team?.color || '').trim();
      (team?.players || []).forEach((player) => {
        const name = toName(player);
        if (!name) return;
        pushHint(out, seen, name, {
          imagePath,
          imageIndex,
          sourceRole: 'opponent',
          teamName,
          teamColor,
        });
      });
    });
  });

  Object.keys(out).forEach((key) => {
    out[key].sort((a, b) => a.imageIndex - b.imageIndex);
  });

  return out;
};

