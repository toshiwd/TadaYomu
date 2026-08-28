/** Convert persisted or navigation-provided progress into a safe chapter index. */
export function normalizeReaderChapterIndex(
  value: unknown,
  totalEpisodes?: unknown,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  const normalizedValue =
    !Number.isFinite(numericValue) || numericValue < 1
      ? 1
      : Math.floor(numericValue);
  const numericTotal =
    typeof totalEpisodes === "number"
      ? totalEpisodes
      : typeof totalEpisodes === "string" && totalEpisodes.trim() !== ""
        ? Number(totalEpisodes)
        : Number.NaN;

  if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
    return normalizedValue;
  }
  return Math.min(normalizedValue, Math.floor(numericTotal));
}

export type ReaderChapterListResolution =
  | { kind: "empty" }
  | { kind: "ready"; chapterIndex: number; changed: boolean };

/** Decide whether a freshly fetched chapter list can safely serve a request. */
export function resolveReaderChapterList(
  requestedChapter: unknown,
  chapterCount: unknown,
): ReaderChapterListResolution {
  const numericCount =
    typeof chapterCount === "number"
      ? chapterCount
      : typeof chapterCount === "string" && chapterCount.trim() !== ""
        ? Number(chapterCount)
        : Number.NaN;
  if (!Number.isFinite(numericCount) || Math.floor(numericCount) <= 0) {
    return { kind: "empty" };
  }

  const normalizedRequested = normalizeReaderChapterIndex(requestedChapter);
  const chapterIndex = normalizeReaderChapterIndex(
    requestedChapter,
    numericCount,
  );
  return {
    kind: "ready",
    chapterIndex,
    changed: chapterIndex !== normalizedRequested,
  };
}

export type ReaderNextChapterResolution =
  | { kind: "empty" }
  | { kind: "latest"; totalChapters: number }
  | { kind: "advance"; chapterIndex: number; totalChapters: number };

/** Decide what an end-of-chapter refresh permits without moving backwards. */
export function resolveReaderNextChapter(
  currentChapter: unknown,
  chapterCount: unknown,
): ReaderNextChapterResolution {
  const list = resolveReaderChapterList(currentChapter, chapterCount);
  if (list.kind === "empty") return list;

  const normalizedCurrent = normalizeReaderChapterIndex(currentChapter);
  const refreshedTotal = normalizeReaderChapterIndex(chapterCount);
  const totalChapters = Math.max(normalizedCurrent, refreshedTotal);
  if (refreshedTotal <= normalizedCurrent) {
    return { kind: "latest", totalChapters };
  }
  return {
    kind: "advance",
    chapterIndex: normalizedCurrent + 1,
    totalChapters,
  };
}
