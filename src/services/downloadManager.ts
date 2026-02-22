/**
 * Download manager — orchestrates novel download and storage.
 * Uses expo-file-system v19 class-based API (File, Directory, Paths).
 */
import { File, Directory, Paths } from 'expo-file-system';
import { downloadAsync } from 'expo-file-system/legacy';
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

        // Done — chapters will be downloaded on-demand when opened
        onProgress?.({ phase: 'done', current: 0, total: chapterList.length, message: '追加完了' });
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

        // Insert new chapters as metadata only (content fetched on-demand)
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

        updateNovel(db, novel.id, {
            totalEpisodes: chapterList.length,
            lastCheckedAt: new Date().toISOString(),
        });

        onProgress?.({ phase: 'done', current: newChapters.length, total: newChapters.length, message: `${newChapters.length}話の新着あり` });
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
    let formattedText = formatNovelText(content.bodyText);

    if (!formattedText || formattedText.trim().length === 0) {
        throw new Error(`Re-download produced empty text (raw: ${content.bodyText?.length ?? 0})`);
    }

    // Extract and download images
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const originalSrcs: string[] = [];
    let match;
    while ((match = imgRegex.exec(formattedText)) !== null) {
        originalSrcs.push(match[1]);
    }

    if (originalSrcs.length > 0) {
        const imageDir = new Directory(Paths.document, 'novels', siteNovelId, 'images');
        ensureDirectory(getNovelsDir());
        ensureDirectory(new Directory(Paths.document, 'novels', siteNovelId));
        ensureDirectory(imageDir);

        for (const src of originalSrcs) {
            let url = src;
            if (url.startsWith('//')) url = 'https:' + url;

            try {
                // Generate safe filename from URL
                let filename = url.split('/').pop()?.split('?')[0];
                if (!filename || !filename.includes('.')) filename = `${Date.now()}.jpg`;

                const imageFile = new File(imageDir, filename);
                if (!imageFile.exists) {
                    console.log(`[Reader] Downloading image: ${url}`);
                    await downloadAsync(url, imageFile.uri);
                }

                // Replace URL with local file URI
                formattedText = formattedText.split(src).join(imageFile.uri);
            } catch (err) {
                console.warn(`[Reader] Failed to download image ${url}:`, err);
            }
        }
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
