export interface ReaderPositionAnchor {
  blockIndex: number;
  characterOffset: number;
  contextHash: string;
}

export interface ReaderProgressSnapshot {
  novelId: number;
  chapterIndex: number;
  progress: number;
  page: number;
  positionAnchor: ReaderPositionAnchor | null;
}

export function normalizeReaderProgress(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(value, 1))
    : 0;
}

/** Ignore transient WebView page notifications while Android is not interactive. */
export function shouldProcessReaderPageInfo(appState: unknown): boolean {
  return appState === "active";
}

export function createReaderProgressSnapshot(
  novelId: number,
  chapterIndex: number,
  progress: unknown,
  page: unknown,
  positionAnchor?: unknown,
): ReaderProgressSnapshot | null {
  if (!Number.isInteger(novelId) || novelId < 1) return null;
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) return null;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;

  const anchor = normalizeReaderPositionAnchor(positionAnchor);

  return {
    novelId,
    chapterIndex,
    progress: normalizeReaderProgress(progress),
    page,
    positionAnchor: anchor,
  };
}

export function normalizeReaderPositionAnchor(value: unknown): ReaderPositionAnchor | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReaderPositionAnchor>;
  if (!Number.isInteger(candidate.blockIndex) || (candidate.blockIndex ?? -1) < 0) return null;
  if (!Number.isInteger(candidate.characterOffset) || (candidate.characterOffset ?? -1) < 0) return null;
  if (typeof candidate.contextHash !== "string" || candidate.contextHash.length === 0) return null;
  return {
    blockIndex: candidate.blockIndex as number,
    characterOffset: candidate.characterOffset as number,
    contextHash: candidate.contextHash,
  };
}

export function isReaderProgressForChapter(
  snapshot: ReaderProgressSnapshot | null,
  novelId: number,
  chapterIndex: number,
): snapshot is ReaderProgressSnapshot {
  return (
    snapshot?.novelId === novelId && snapshot.chapterIndex === chapterIndex
  );
}
