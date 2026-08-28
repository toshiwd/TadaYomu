/** Convert persisted or navigation-provided progress into a safe chapter index. */
export function normalizeReaderChapterIndex(
  value: unknown,
  totalChapters?: unknown,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  const chapterIndex = !Number.isFinite(numericValue) || numericValue < 1
    ? 1
    : Math.floor(numericValue);
  const numericTotal = typeof totalChapters === "number"
    ? totalChapters
    : typeof totalChapters === "string" && totalChapters.trim() !== ""
      ? Number(totalChapters)
      : Number.NaN;
  if (Number.isFinite(numericTotal) && numericTotal > 0) {
    return Math.min(chapterIndex, Math.floor(numericTotal));
  }
  return chapterIndex;
}

export type ReaderChapterListResolution =
  | { kind: "empty" }
  | { kind: "ready"; chapterIndex: number; changed: boolean };

export function resolveReaderChapterList(
  requestedChapter: unknown,
  chapterCount: unknown,
): ReaderChapterListResolution {
  const numericCount = typeof chapterCount === "number"
    ? chapterCount
    : typeof chapterCount === "string" && chapterCount.trim() !== ""
      ? Number(chapterCount)
      : Number.NaN;
  if (!Number.isFinite(numericCount) || Math.floor(numericCount) <= 0) {
    return { kind: "empty" };
  }
  const requested = normalizeReaderChapterIndex(requestedChapter);
  const chapterIndex = normalizeReaderChapterIndex(requestedChapter, numericCount);
  return { kind: "ready", chapterIndex, changed: chapterIndex !== requested };
}

export type ReaderNextChapterResolution =
  | { kind: "empty" }
  | { kind: "latest"; totalChapters: number }
  | { kind: "advance"; chapterIndex: number; totalChapters: number };

export function resolveReaderNextChapter(
  currentChapter: unknown,
  chapterCount: unknown,
): ReaderNextChapterResolution {
  const list = resolveReaderChapterList(currentChapter, chapterCount);
  if (list.kind === "empty") return list;
  const current = normalizeReaderChapterIndex(currentChapter);
  const refreshedTotal = normalizeReaderChapterIndex(chapterCount);
  const totalChapters = Math.max(current, refreshedTotal);
  if (refreshedTotal <= current) return { kind: "latest", totalChapters };
  return { kind: "advance", chapterIndex: current + 1, totalChapters };
}
