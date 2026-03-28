export const normalizeMatchCategory = (value: unknown): string => {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, 48);
};

