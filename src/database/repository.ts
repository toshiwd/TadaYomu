/**
 * CRUD operations for novels and chapters using expo-sqlite v16.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Novel, Chapter, ReadingProgress, Bookmark, ReaderSettings } from '../types/novel';
import { DEFAULT_READER_SETTINGS } from '../types/novel';

// ── Novel CRUD ──

export type LibrarySortBy = 'updatedAt' | 'lastRead';

export function getAllNovels(db: SQLiteDatabase, sortBy?: LibrarySortBy): Novel[] {
    let query: string;
    switch (sortBy) {
        case 'updatedAt':
            query = `SELECT n.* FROM novels n
                     ORDER BY COALESCE(n.site_updated_at, n.last_checked_at, n.added_at) DESC, n.title ASC`;
            break;
        case 'lastRead':
            query = `SELECT n.* FROM novels n
                     LEFT JOIN reading_progress rp ON rp.novel_id = n.id
                     ORDER BY COALESCE(rp.last_read_at, n.added_at) DESC, n.title ASC`;
            break;
        default:
            query = 'SELECT * FROM novels ORDER BY last_checked_at DESC, added_at DESC';
            break;
    }
    const rows = db.getAllSync(query) as any[];
    return rows.map(mapRowToNovel);
}

export function getNovelById(db: SQLiteDatabase, id: number): Novel | null {
    const row = db.getFirstSync('SELECT * FROM novels WHERE id = ?', [id]) as any;
    return row ? mapRowToNovel(row) : null;
}

export function getNovelBySiteId(
    db: SQLiteDatabase, siteNovelId: string, siteType: string
): Novel | null {
    const row = db.getFirstSync(
        'SELECT * FROM novels WHERE site_novel_id = ? AND site_type = ?',
        [siteNovelId, siteType]
    ) as any;
    return row ? mapRowToNovel(row) : null;
}

export function insertNovel(db: SQLiteDatabase, novel: Omit<Novel, 'id'>): number {
    const result = db.runSync(
        `INSERT INTO novels (site_novel_id, site_type, title, author, synopsis, total_episodes,
      downloaded_episodes, url, cover_path, tags, is_complete, site_updated_at, last_checked_at, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            novel.siteNovelId, novel.siteType, novel.title, novel.author, novel.synopsis,
            novel.totalEpisodes, novel.downloadedEpisodes, novel.url, novel.coverPath,
            JSON.stringify(novel.tags), novel.isComplete ? 1 : 0, novel.siteUpdatedAt,
            novel.lastCheckedAt, novel.addedAt,
        ]
    );
    return result.lastInsertRowId;
}

export function updateNovel(db: SQLiteDatabase, id: number, updates: Partial<Novel>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.author !== undefined) { fields.push('author = ?'); values.push(updates.author); }
    if (updates.synopsis !== undefined) { fields.push('synopsis = ?'); values.push(updates.synopsis); }
    if (updates.totalEpisodes !== undefined) { fields.push('total_episodes = ?'); values.push(updates.totalEpisodes); }
    if (updates.downloadedEpisodes !== undefined) { fields.push('downloaded_episodes = ?'); values.push(updates.downloadedEpisodes); }
    if (updates.isComplete !== undefined) { fields.push('is_complete = ?'); values.push(updates.isComplete ? 1 : 0); }
    if (updates.siteUpdatedAt !== undefined) { fields.push('site_updated_at = ?'); values.push(updates.siteUpdatedAt); }
    if (updates.lastCheckedAt !== undefined) { fields.push('last_checked_at = ?'); values.push(updates.lastCheckedAt); }

    if (fields.length > 0) {
        values.push(id);
        db.runSync(`UPDATE novels SET ${fields.join(', ')} WHERE id = ?`, values);
    }
}

export function deleteNovel(db: SQLiteDatabase, id: number): void {
    db.runSync('DELETE FROM novels WHERE id = ?', [id]);
}

// ── Chapter CRUD ──

export function getChaptersByNovelId(db: SQLiteDatabase, novelId: number): Chapter[] {
    const rows = db.getAllSync(
        'SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_index ASC',
        [novelId]
    ) as any[];
    return rows.map(mapRowToChapter);
}

export function getChapter(db: SQLiteDatabase, novelId: number, index: number): Chapter | null {
    const row = db.getFirstSync(
        'SELECT * FROM chapters WHERE novel_id = ? AND chapter_index = ?',
        [novelId, index]
    ) as any;
    return row ? mapRowToChapter(row) : null;
}

export function upsertChapter(db: SQLiteDatabase, chapter: Omit<Chapter, 'id'>): void {
    db.runSync(
        `INSERT INTO chapters (novel_id, chapter_index, title, local_path, is_downloaded, url, published_at, revised_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(novel_id, chapter_index) DO UPDATE SET
       title = excluded.title,
       local_path = excluded.local_path,
       is_downloaded = excluded.is_downloaded,
       url = excluded.url,
       published_at = excluded.published_at,
       revised_at = excluded.revised_at`,
        [
            chapter.novelId, chapter.index, chapter.title, chapter.localPath,
            chapter.isDownloaded ? 1 : 0, chapter.url, chapter.publishedAt, chapter.revisedAt,
        ]
    );
}

export function countDownloadedChapters(db: SQLiteDatabase, novelId: number): number {
    const row = db.getFirstSync(
        'SELECT COUNT(*) as cnt FROM chapters WHERE novel_id = ? AND is_downloaded = 1',
        [novelId]
    ) as any;
    return row?.cnt ?? 0;
}

// ── Reading Progress ──

export function getReadingProgress(db: SQLiteDatabase, novelId: number): ReadingProgress | null {
    const row = db.getFirstSync(
        'SELECT * FROM reading_progress WHERE novel_id = ?',
        [novelId]
    ) as any;
    if (!row) return null;
    const novel = getNovelById(db, novelId);
    return {
        novelId: row.novel_id,
        siteNovelId: novel?.siteNovelId ?? '',
        siteType: novel?.siteType ?? 'syosetu',
        currentChapter: row.current_chapter,
        scrollPercentage: row.scroll_percentage,
        lastReadAt: row.last_read_at,
    };
}

export function upsertReadingProgress(
    db: SQLiteDatabase, novelId: number, chapter: number, scroll: number
): void {
    db.runSync(
        `INSERT INTO reading_progress (novel_id, current_chapter, scroll_percentage, last_read_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(novel_id) DO UPDATE SET
       current_chapter = excluded.current_chapter,
       scroll_percentage = excluded.scroll_percentage,
       last_read_at = datetime('now')`,
        [novelId, chapter, scroll]
    );
}

// ── Bookmarks ──

export function getBookmarksByNovel(db: SQLiteDatabase, novelId: number): Bookmark[] {
    const rows = db.getAllSync(
        'SELECT * FROM bookmarks WHERE novel_id = ? ORDER BY created_at DESC',
        [novelId]
    ) as any[];
    return rows.map((r) => ({
        id: r.id,
        novelId: r.novel_id,
        chapterIndex: r.chapter_index,
        scrollPercentage: r.scroll_percentage,
        label: r.label,
        createdAt: r.created_at,
    }));
}

export function addBookmark(
    db: SQLiteDatabase, novelId: number, chapterIndex: number, scroll: number, label: string
): void {
    db.runSync(
        'INSERT INTO bookmarks (novel_id, chapter_index, scroll_percentage, label) VALUES (?, ?, ?, ?)',
        [novelId, chapterIndex, scroll, label]
    );
}

export function deleteBookmark(db: SQLiteDatabase, id: number): void {
    db.runSync('DELETE FROM bookmarks WHERE id = ?', [id]);
}

// ── Settings ──

export function getSetting(db: SQLiteDatabase, key: string): string | null {
    const row = db.getFirstSync('SELECT value FROM settings WHERE key = ?', [key]) as any;
    return row?.value ?? null;
}

export function setSetting(db: SQLiteDatabase, key: string, value: string): void {
    db.runSync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value]
    );
}

export function getReaderSettings(db: SQLiteDatabase): ReaderSettings {
    const json = getSetting(db, 'reader_settings');
    if (json) {
        try { return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(json) }; } catch { }
    }
    return { ...DEFAULT_READER_SETTINGS };
}

export function saveReaderSettings(db: SQLiteDatabase, settings: ReaderSettings): void {
    setSetting(db, 'reader_settings', JSON.stringify(settings));
}

// ── Row mappers ──

function mapRowToNovel(row: any): Novel {
    return {
        id: row.id,
        siteNovelId: row.site_novel_id,
        siteType: row.site_type,
        title: row.title,
        author: row.author,
        synopsis: row.synopsis,
        totalEpisodes: row.total_episodes,
        downloadedEpisodes: row.downloaded_episodes,
        url: row.url,
        coverPath: row.cover_path,
        tags: safeParseJson(row.tags, []),
        isComplete: !!row.is_complete,
        siteUpdatedAt: row.site_updated_at,
        lastCheckedAt: row.last_checked_at,
        addedAt: row.added_at,
    };
}

function mapRowToChapter(row: any): Chapter {
    return {
        id: row.id,
        novelId: row.novel_id,
        index: row.chapter_index,
        title: row.title,
        localPath: row.local_path,
        isDownloaded: !!row.is_downloaded,
        url: row.url,
        publishedAt: row.published_at,
        revisedAt: row.revised_at,
    };
}

function safeParseJson<T>(str: string, fallback: T): T {
    try { return JSON.parse(str); } catch { return fallback; }
}
