import { DEFAULT_READER_SETTINGS, type ReaderSettings } from '../types/novel';

/** Persisted settings may come from older releases or damaged imports. */
export function normalizeReaderSettings(value: unknown): ReaderSettings {
  const result = { ...DEFAULT_READER_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const input = value as Record<string, unknown>;
  const ranges = {
    fontSize: [8, 72], lineHeight: [1, 3], margin: [0, 80],
    marginTop: [0, 120], marginBottom: [0, 120], autoScrollSpeed: [0, 100],
    paragraphSpacing: [0, 3],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const number = input[key];
    if (typeof number === 'number' && Number.isFinite(number)) {
      result[key] = Math.max(ranges[key][0], Math.min(number, ranges[key][1]));
    }
  }
  for (const key of ['reversePageDirection', 'pageTurnAnimation', 'fullscreen', 'showImages'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (input.writingMode === 'vertical' || input.writingMode === 'horizontal') result.writingMode = input.writingMode;
  if (input.theme === 'light' || input.theme === 'dark' || input.theme === 'sepia') result.theme = input.theme;
  if (typeof input.fontFamily === 'string' && input.fontFamily.length > 0) result.fontFamily = input.fontFamily;
  return result;
}
