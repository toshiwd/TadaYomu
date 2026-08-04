/** Convert persisted or navigation-provided progress into a safe chapter index. */
export function normalizeReaderChapterIndex(
  value: unknown,
  totalChapters?: number,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue < 1) return 1;

  const chapterIndex = Math.floor(numericValue);
  if (typeof totalChapters === "number" && Number.isFinite(totalChapters) && totalChapters >= 1) {
    return Math.min(chapterIndex, Math.floor(totalChapters));
  }
  return chapterIndex;
}
