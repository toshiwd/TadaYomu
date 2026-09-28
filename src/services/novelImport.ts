import type { SQLiteDatabase } from 'expo-sqlite';
import type { Novel } from '../types/novel';
import { getNovelBySiteId, insertNovel, upsertChapter } from '../database/repository';
import type { ChapterInfo, NovelInfo } from './siteAdapter';

/** Save an import as one unit so a failed chapter never leaves an empty novel. */
export function persistNovelImport(
  db: SQLiteDatabase,
  info: NovelInfo,
  chapters: ChapterInfo[],
): Novel {
  let savedNovel: Novel | null = null;
  db.withTransactionSync(() => {
    const now = new Date().toISOString();
    const novelId = insertNovel(db, {
      siteNovelId: info.siteNovelId,
      siteType: info.siteType,
      title: info.title,
      author: info.author,
      synopsis: info.synopsis,
      totalEpisodes: chapters.length,
      downloadedEpisodes: 0,
      url: info.url,
      coverPath: null,
      tags: [],
      isComplete: info.isComplete,
      isArchived: false,
      siteUpdatedAt: info.lastUpdatedAt,
      lastCheckedAt: now,
      addedAt: now,
    });

    for (const chapter of chapters) {
      upsertChapter(db, {
        novelId,
        index: chapter.index,
        title: chapter.title,
        localPath: null,
        isDownloaded: false,
        url: chapter.url,
        publishedAt: chapter.publishedAt,
        revisedAt: chapter.revisedAt,
      });
    }

    savedNovel = getNovelBySiteId(db, info.siteNovelId, info.siteType);
    if (!savedNovel) throw new Error('Novel was saved but could not be read back');
  });
  if (!savedNovel) throw new Error('Novel import did not complete');
  return savedNovel;
}
