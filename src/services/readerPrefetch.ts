const chapterReadsInFlight = new Map<string, Promise<string>>();

export function getNextChapterIndexToPrefetch(
  currentChapter: number,
  totalChapters: number,
): number | null {
  if (
    !Number.isInteger(currentChapter) ||
    !Number.isInteger(totalChapters) ||
    currentChapter < 1 ||
    currentChapter >= totalChapters
  ) {
    return null;
  }

  return currentChapter + 1;
}

export function createChapterReadKey(
  siteType: string | undefined,
  siteNovelId: string,
  chapterIndex: number,
): string {
  return JSON.stringify([siteType ?? "local", siteNovelId, chapterIndex]);
}

export function runChapterReadSingleFlight(
  key: string,
  read: () => Promise<string>,
): Promise<string> {
  const existing = chapterReadsInFlight.get(key);
  if (existing) return existing;

  const pending = read();
  chapterReadsInFlight.set(key, pending);

  const clearPending = () => {
    if (chapterReadsInFlight.get(key) === pending) {
      chapterReadsInFlight.delete(key);
    }
  };
  void pending.then(clearPending, clearPending);

  return pending;
}
