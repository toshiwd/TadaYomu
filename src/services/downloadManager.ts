/**
 * Download manager — orchestrates novel download and storage.
 * Uses expo-file-system v19 class-based API (File, Directory, Paths).
 */
import { File, Directory, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Novel, Chapter } from '../types/novel';
import {
    insertNovel, updateNovel, getNovelBySiteId,
    upsertChapter, countDownloadedChapters,
} from '../database/repository';
import { getAdapterForUrl, getAdapter } from './siteAdapter';
import { formatNovelText } from './textFormatter';

/** Get the novels base directory */
function getNovelsDir(): Directory {
    return new Directory(Paths.document, 'novels');
}

/** Get a chapter file */
function getChapterFile(siteNovelId: string, chapterIndex: number): File {
    return new File(Paths.document, 'novels', siteNovelId, `${chapterIndex}.txt`);
}

/** Ensure a directory exists by creating it */
function ensureDirectory(dir: Directory): void {
    if (!dir.exists) {
        dir.create();
    }
}

export interface DownloadProgress {
    phase: 'info' | 'chapters' | 'downloading' | 'done' | 'error';
    current: number;
    total: number;
    message: string;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Add a novel by URL — fetch info, chapter list, and download all chapters.
 */
export async function addNovelByUrl(
    db: SQLiteDatabase,
    url: string,
    onProgress?: ProgressCallback,
): Promise<Novel | null> {
    const adapter = getAdapterForUrl(url);
    if (!adapter) {
        onProgress?.({ phase: 'error', current: 0, total: 0, message: '対応していないサイトです' });
        return null;
    }

    const novelId = adapter.extractNovelId(url);
    if (!novelId) {
        onProgress?.({ phase: 'error', current: 0, total: 0, message: 'URLから小説IDを取得できません' });
        return null;
    }

    // Check if already exists
    const existing = getNovelBySiteId(db, novelId, adapter.siteType);
    if (existing) {
        onProgress?.({ phase: 'error', current: 0, total: 0, message: 'この小説は既に追加されています' });
        return existing;
    }

    try {
        // Phase 1: Get novel info
        onProgress?.({ phase: 'info', current: 0, total: 0, message: '小説情報を取得中...' });
        const info = await adapter.getNovelInfo(novelId);

        // Phase 2: Get chapter list
        onProgress?.({ phase: 'chapters', current: 0, total: 0, message: '目次を取得中...' });
        const chapterList = await adapter.getChapterList(novelId);

        // Insert novel into DB
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
            siteUpdatedAt: info.lastUpdatedAt,
            lastCheckedAt: new Date().toISOString(),
            addedAt: new Date().toISOString(),
        });

        // Insert chapters into DB
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

        // Phase 3: Download all chapters
        const novelDir = new Directory(Paths.document, 'novels', novelId);
        ensureDirectory(getNovelsDir());
        ensureDirectory(novelDir);

        const total = chapterList.length;

        for (let i = 0; i < total; i++) {
            const ch = chapterList[i];
            onProgress?.({
                phase: 'downloading',
                current: i + 1,
                total,
                message: `ダウンロード中: ${i + 1}/${total} - ${ch.title}`,
            });

            try {
                const content = await adapter.getChapterContent(novelId, ch.url);
                const formattedText = formatNovelText(content.bodyText);

                // Validate: skip saving empty content
                if (!formattedText || formattedText.trim().length === 0) {
                    console.warn(`[Download] Chapter ${ch.index}: extracted text is empty, skipping save.`);
                    continue;
                }

                const file = getChapterFile(novelId, ch.index);

                // Write text to file
                file.create({ intermediates: true, overwrite: true });
                file.write(formattedText);

                // Verify write succeeded by reading back
                const verifyText = await file.text();
                if (!verifyText || verifyText.length === 0) {
                    console.warn(`[Download] Chapter ${ch.index}: file write verification failed (empty read-back).`);
                    continue;
                }
                console.log(`[Download] Chapter ${ch.index}: saved ${verifyText.length} chars to ${file.uri}`);

                upsertChapter(db, {
                    novelId: dbId,
                    index: ch.index,
                    title: content.title || ch.title,
                    localPath: file.uri,
                    isDownloaded: true,
                    url: ch.url,
                    publishedAt: ch.publishedAt,
                    revisedAt: ch.revisedAt,
                });
            } catch (err) {
                console.warn(`Failed to download chapter ${ch.index}:`, err);
            }
        }

        // Update download count
        const downloaded = countDownloadedChapters(db, dbId);
        updateNovel(db, dbId, {
            downloadedEpisodes: downloaded,
            lastCheckedAt: new Date().toISOString(),
        });

        onProgress?.({ phase: 'done', current: total, total, message: 'ダウンロード完了' });
        return getNovelBySiteId(db, novelId, adapter.siteType);
    } catch (err: any) {
        onProgress?.({
            phase: 'error',
            current: 0,
            total: 0,
            message: `エラー: ${err.message || '不明なエラー'}`,
        });
        return null;
    }
}

/**
 * Check a novel for updates and download new chapters.
 */
export async function checkNovelUpdates(
    db: SQLiteDatabase,
    novel: Novel,
    onProgress?: ProgressCallback,
): Promise<number> {
    const adapter = getAdapter(novel.siteType);
    if (!adapter) return 0;

    try {
        onProgress?.({ phase: 'info', current: 0, total: 0, message: '更新を確認中...' });
        const chapterList = await adapter.getChapterList(novel.siteNovelId);

        const newChapters = chapterList.filter((ch) => ch.index > novel.totalEpisodes);
        if (newChapters.length === 0) {
            updateNovel(db, novel.id, { lastCheckedAt: new Date().toISOString() });
            return 0;
        }

        const novelDir = new Directory(Paths.document, 'novels', novel.siteNovelId);
        ensureDirectory(novelDir);

        for (let i = 0; i < newChapters.length; i++) {
            const ch = newChapters[i];
            onProgress?.({
                phase: 'downloading',
                current: i + 1,
                total: newChapters.length,
                message: `新着ダウンロード: ${i + 1}/${newChapters.length}`,
            });

            try {
                const content = await adapter.getChapterContent(novel.siteNovelId, ch.url);
                const formattedText = formatNovelText(content.bodyText);
                const file = getChapterFile(novel.siteNovelId, ch.index);

                file.create({ intermediates: true, overwrite: true });
                file.write(formattedText);

                upsertChapter(db, {
                    novelId: novel.id,
                    index: ch.index,
                    title: content.title || ch.title,
                    localPath: file.uri,
                    isDownloaded: true,
                    url: ch.url,
                    publishedAt: ch.publishedAt,
                    revisedAt: ch.revisedAt,
                });
            } catch (err) {
                console.warn(`Failed to download chapter ${ch.index}:`, err);
            }
        }

        const downloaded = countDownloadedChapters(db, novel.id);
        updateNovel(db, novel.id, {
            totalEpisodes: chapterList.length,
            downloadedEpisodes: downloaded,
            lastCheckedAt: new Date().toISOString(),
        });

        onProgress?.({ phase: 'done', current: newChapters.length, total: newChapters.length, message: '完了' });
        return newChapters.length;
    } catch {
        return 0;
    }
}

/**
 * Download (or re-download) a single chapter from the site and save to disk.
 */
export async function downloadSingleChapter(
    db: SQLiteDatabase, chapter: Chapter, siteNovelId: string, siteType: string
): Promise<string> {
    const adapter = getAdapter(siteType as any);
    if (!adapter) throw new Error('No adapter for site type: ' + siteType);

    console.log(`[Reader] Re-downloading chapter ${chapter.index} from ${chapter.url}`);
    const content = await adapter.getChapterContent(siteNovelId, chapter.url);
    const formattedText = formatNovelText(content.bodyText);

    if (!formattedText || formattedText.trim().length === 0) {
        throw new Error(`Re-download produced empty text (raw: ${content.bodyText?.length ?? 0})`);
    }

    const novelDir = new Directory(Paths.document, 'novels', siteNovelId);
    ensureDirectory(getNovelsDir());
    ensureDirectory(novelDir);

    const file = getChapterFile(siteNovelId, chapter.index);
    file.create({ intermediates: true, overwrite: true });
    file.write(formattedText);

    // Update DB
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

    console.log(`[Reader] Re-downloaded chapter ${chapter.index}: ${formattedText.length} chars`);
    return formattedText;
}

/**
 * Read a chapter's text from local storage.
 * If the file is empty or missing, automatically re-downloads from the site.
 */
export async function readChapterText(
    chapter: Chapter, siteNovelId: string, db?: SQLiteDatabase, siteType?: string
): Promise<string> {
    const file = getChapterFile(siteNovelId, chapter.index);
    console.log(`[Reader] Looking for file at: ${file.uri}`);

    // Try reading from disk first
    if (file.exists) {
        try {
            const text = await file.text();
            if (text && text.trim().length > 0) {
                console.log(`[Reader] Read ${text.length} chars from ${file.uri}`);
                return text;
            }
            console.warn(`[Reader] File exists but is empty: ${file.uri}`);
        } catch (err) {
            console.warn(`[Reader] Error reading file:`, err);
        }
    } else {
        console.warn(`[Reader] File does not exist: ${file.uri}`);
    }

    // Fallback: re-download from site
    if (db && siteType && chapter.url) {
        console.log(`[Reader] Attempting re-download for chapter ${chapter.index}...`);
        return downloadSingleChapter(db, chapter, siteNovelId, siteType);
    }

    throw new Error('Chapter file is empty or missing and cannot re-download');
}

/**
 * Delete all downloaded data for a novel.
 */
export function deleteNovelData(siteNovelId: string): void {
    const dir = new Directory(Paths.document, 'novels', siteNovelId);
    if (dir.exists) {
        dir.delete();
    }
}
