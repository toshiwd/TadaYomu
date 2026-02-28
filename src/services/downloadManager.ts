/**
 * Download manager - orchestrates novel download and storage.
 * Uses expo-file-system v19 class-based API (File, Directory, Paths).
 */
import { File, Directory, Paths } from "expo-file-system";
import { downloadAsync } from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Novel, Chapter } from "../types/novel";
import {
  insertNovel,
  updateNovel,
  getNovelBySiteId,
  upsertChapter,
} from "../database/repository";
import { getAdapterForUrl, getAdapter } from "./siteAdapter";
import { formatNovelText } from "./textFormatter";

/** Get the novels base directory */
function getNovelsDir(): Directory {
  return new Directory(Paths.document, "novels");
}

/** Get a chapter file */
function getChapterFile(siteNovelId: string, chapterIndex: number): File {
  return new File(Paths.document, "novels", siteNovelId, `${chapterIndex}.txt`);
}

/** Ensure a directory exists by creating it */
function ensureDirectory(dir: Directory): void {
  if (!dir.exists) {
    dir.create();
  }
}

export interface DownloadProgress {
  phase: "info" | "chapters" | "downloading" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: DownloadProgress) => void;

export interface AddNovelResult {
  status: "success" | "duplicate" | "error";
  novel?: Novel;
  message?: string;
}

/**
 * Add a novel by URL - fetch info and chapter list metadata.
 * Chapter bodies are downloaded on-demand when opened.
 */
export async function addNovelByUrl(
  db: SQLiteDatabase,
  url: string,
  onProgress?: ProgressCallback,
): Promise<AddNovelResult> {
  const adapter = getAdapterForUrl(url);
  if (!adapter) {
    const message = "Unsupported site URL";
    onProgress?.({ phase: "error", current: 0, total: 0, message });
    return { status: "error", message };
  }

  const novelId = adapter.extractNovelId(url);
  if (!novelId) {
    const message = "Failed to extract novel ID from URL";
    onProgress?.({ phase: "error", current: 0, total: 0, message });
    return { status: "error", message };
  }

  const existing = getNovelBySiteId(db, novelId, adapter.siteType);
  if (existing) {
    const message = "This novel already exists in your library";
    onProgress?.({ phase: "error", current: 0, total: 0, message });
    return { status: "duplicate", novel: existing, message };
  }

  try {
    onProgress?.({
      phase: "info",
      current: 0,
      total: 0,
      message: "Getting novel info...",
    });
    const info = await adapter.getNovelInfo(novelId);

    onProgress?.({
      phase: "chapters",
      current: 0,
      total: 0,
      message: "Fetching chapter list...",
    });
    const chapterList = await adapter.getChapterList(novelId);

    const dbId = insertNovel(db, {
      siteNovelId: info.siteNovelId,
      siteType: info.siteType,
      title: info.title,
      author: info.author,
      synopsis: info.synopsis,
      totalEpisodes: chapterList.length,
      downloadedEpisodes: 0,
      url: info.url,
      coverPath: null,
      tags: [],
      isComplete: info.isComplete,
      isArchived: false,
      siteUpdatedAt: info.lastUpdatedAt,
      lastCheckedAt: new Date().toISOString(),
      addedAt: new Date().toISOString(),
    });

    db.withTransactionSync(() => {
      for (const ch of chapterList) {
        upsertChapter(db, {
          novelId: dbId,
          index: ch.index,
          title: ch.title,
          localPath: null,
          isDownloaded: false,
          url: ch.url,
          publishedAt: ch.publishedAt,
          revisedAt: ch.revisedAt,
        });
      }
    });

    const savedNovel = getNovelBySiteId(db, novelId, adapter.siteType);
    onProgress?.({
      phase: "done",
      current: 0,
      total: chapterList.length,
      message: "Added to library",
    });

    if (!savedNovel) {
      return {
        status: "error",
        message: "Novel was added but could not be read back from DB",
      };
    }
    return { status: "success", novel: savedNovel };
  } catch (err: any) {
    const message = `Error: ${err?.message || "unknown error"}`;
    onProgress?.({ phase: "error", current: 0, total: 0, message });
    return { status: "error", message };
  }
}

/**
 * Check a novel for updates and insert new chapter metadata.
 */
export async function checkNovelUpdates(
  db: SQLiteDatabase,
  novel: Novel,
  onProgress?: ProgressCallback,
): Promise<number> {
  const adapter = getAdapter(novel.siteType);
  if (!adapter) return 0;

  try {
    onProgress?.({
      phase: "info",
      current: 0,
      total: 0,
      message: "Checking for updates...",
    });
    const chapterList = await adapter.getChapterList(novel.siteNovelId);

    const newChapters = chapterList.filter((ch) => ch.index > novel.totalEpisodes);
    if (newChapters.length === 0) {
      updateNovel(db, novel.id, { lastCheckedAt: new Date().toISOString() });
      return 0;
    }

    db.withTransactionSync(() => {
      for (const ch of newChapters) {
        upsertChapter(db, {
          novelId: novel.id,
          index: ch.index,
          title: ch.title,
          localPath: null,
          isDownloaded: false,
          url: ch.url,
          publishedAt: ch.publishedAt,
          revisedAt: ch.revisedAt,
        });
      }
    });

    updateNovel(db, novel.id, {
      totalEpisodes: chapterList.length,
      siteUpdatedAt:
        chapterList[chapterList.length - 1]?.publishedAt ||
        new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });

    onProgress?.({
      phase: "done",
      current: newChapters.length,
      total: newChapters.length,
      message: `${newChapters.length} new chapters`,
    });
    return newChapters.length;
  } catch (err) {
    console.warn("[UpdateCheck] Failed to check novel updates", err);
    return 0;
  }
}

/**
 * Download (or re-download) a single chapter from the site and save to disk.
 */
export async function downloadSingleChapter(
  db: SQLiteDatabase,
  chapter: Chapter,
  siteNovelId: string,
  siteType: string,
): Promise<string> {
  const adapter = getAdapter(siteType as any);
  if (!adapter) throw new Error(`No adapter for site type: ${siteType}`);

  console.log(
    `[Reader] Re-downloading chapter ${chapter.index} from ${chapter.url}`,
  );
  const content = await adapter.getChapterContent(siteNovelId, chapter.url);
  let formattedText = formatNovelText(content.bodyText);

  if (!formattedText || formattedText.trim().length === 0) {
    throw new Error(
      `Re-download produced empty text (raw: ${content.bodyText?.length ?? 0})`,
    );
  }

  const imgRegex = /(?:<img[^>]+src=["']|<span[^>]+data-src=["'])([^"']+)["']/gi;
  const originalSrcs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(formattedText)) !== null) {
    originalSrcs.push(match[1]);
  }

  if (originalSrcs.length > 0) {
    const imageDir = new Directory(
      Paths.document,
      "novels",
      siteNovelId,
      "images",
    );
    ensureDirectory(getNovelsDir());
    ensureDirectory(new Directory(Paths.document, "novels", siteNovelId));
    ensureDirectory(imageDir);

    for (const src of originalSrcs) {
      let imageUrl = src;
      if (imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`;

      try {
        let filename = imageUrl.split("/").pop()?.split("?")[0];
        if (!filename || !filename.includes(".")) {
          filename = `${Date.now()}.jpg`;
        }

        const imageFile = new File(imageDir, filename);
        if (!imageFile.exists) {
          console.log(`[Reader] Downloading image: ${imageUrl}`);
          await downloadAsync(imageUrl, imageFile.uri);
        }

        formattedText = formattedText.split(src).join(imageFile.uri);
      } catch (err) {
        console.warn(`[Reader] Failed to download image ${imageUrl}:`, err);
      }
    }
  }

  const novelDir = new Directory(Paths.document, "novels", siteNovelId);
  ensureDirectory(getNovelsDir());
  ensureDirectory(novelDir);

  const file = getChapterFile(siteNovelId, chapter.index);
  file.create({ intermediates: true, overwrite: true });
  file.write(formattedText);

  upsertChapter(db, {
    novelId: chapter.novelId,
    index: chapter.index,
    title: content.title || chapter.title,
    localPath: file.uri,
    isDownloaded: true,
    url: chapter.url,
    publishedAt: chapter.publishedAt,
    revisedAt: chapter.revisedAt,
  });

  console.log(
    `[Reader] Re-downloaded chapter ${chapter.index}: ${formattedText.length} chars`,
  );
  return formattedText;
}

/**
 * Read a chapter's text from local storage.
 * If the file is empty or missing, automatically re-downloads from the site.
 */
export async function readChapterText(
  chapter: Chapter,
  siteNovelId: string,
  db?: SQLiteDatabase,
  siteType?: string,
): Promise<string> {
  const file = getChapterFile(siteNovelId, chapter.index);
  console.log(`[Reader] Looking for file at: ${file.uri}`);

  if (file.exists) {
    try {
      const text = await file.text();
      if (text && text.trim().length > 0) {
        console.log(`[Reader] Read ${text.length} chars from ${file.uri}`);
        return text;
      }
      console.warn(`[Reader] File exists but is empty: ${file.uri}`);
    } catch (err) {
      console.warn("[Reader] Error reading file:", err);
    }
  } else {
    console.warn(`[Reader] File does not exist: ${file.uri}`);
  }

  if (db && siteType && chapter.url) {
    console.log(
      `[Reader] Attempting re-download for chapter ${chapter.index}...`,
    );
    try {
      return await downloadSingleChapter(db, chapter, siteNovelId, siteType);
    } catch (err: any) {
      console.error("[Reader] Re-download failed:", err);
      throw new Error(
        `Failed to re-download chapter: ${err.message || "network error"}`,
      );
    }
  }

  throw new Error(
    "No local chapter file and no network fallback available for this chapter.",
  );
}

/**
 * Delete all downloaded data for a novel.
 */
export function deleteNovelData(siteNovelId: string): void {
  const dir = new Directory(Paths.document, "novels", siteNovelId);
  if (dir.exists) {
    dir.delete();
  }
}
