/** Convert persisted or navigation-provided progress into a safe chapter index. */
export function normalizeReaderChapterIndex(value: unknown): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue < 1) return 1;
  return Math.floor(numericValue);
}
