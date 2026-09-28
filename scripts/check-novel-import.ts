import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SiteType } from '../src/types/novel';
import type { ChapterInfo, NovelInfo } from '../src/services/siteAdapter';
import { persistNovelImport } from '../src/services/novelImport';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE novels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, site_novel_id TEXT NOT NULL, site_type TEXT NOT NULL,
    title TEXT NOT NULL, author TEXT NOT NULL, synopsis TEXT NOT NULL,
    total_episodes INTEGER NOT NULL, downloaded_episodes INTEGER NOT NULL,
    url TEXT NOT NULL, cover_path TEXT, tags TEXT NOT NULL, is_complete INTEGER NOT NULL,
    is_archived INTEGER NOT NULL, site_updated_at TEXT, last_checked_at TEXT, added_at TEXT NOT NULL,
    UNIQUE(site_novel_id, site_type)
  );
  CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT, novel_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL, title TEXT NOT NULL, local_path TEXT,
    is_downloaded INTEGER NOT NULL, url TEXT NOT NULL, published_at TEXT, revised_at TEXT,
    UNIQUE(novel_id, chapter_index)
  );
`);

let rejectChapterIndex: number | null = null;
const db = {
  runSync(sql: string, params: unknown[] = []) {
    if (sql.includes('INSERT INTO chapters') && params[1] === rejectChapterIndex) {
      throw new Error('injected chapter write failure');
    }
    const result = sqlite.prepare(sql).run(...params as SQLInputValue[]);
    return { ...result, lastInsertRowId: Number(result.lastInsertRowid) };
  },
  getFirstSync(sql: string, params: unknown[] = []) {
    return sqlite.prepare(sql).get(...params as SQLInputValue[]) ?? null;
  },
  withTransactionSync(task: () => void) {
    sqlite.exec('BEGIN');
    try {
      task();
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
} as unknown as SQLiteDatabase;

const sites: { type: SiteType; id: string; host: string }[] = [
  { type: 'syosetu', id: 'n6316bn', host: 'ncode.syosetu.com' },
  { type: 'nocturne', id: 'n0381mn', host: 'novel18.syosetu.com' },
  { type: 'kakuyomu', id: '2912051603474311296', host: 'kakuyomu.jp' },
  { type: 'hameln', id: '409137', host: 'syosetu.org' },
];

for (const site of sites) {
  const url = site.type === 'kakuyomu'
    ? `https://${site.host}/works/${site.id}`
    : site.type === 'hameln'
      ? `https://${site.host}/novel/${site.id}/`
      : `https://${site.host}/${site.id}/`;
  const info: NovelInfo = {
    siteNovelId: site.id, siteType: site.type, title: `test ${site.type}`,
    author: 'author', synopsis: '', totalEpisodes: 2, isComplete: false,
    url, lastUpdatedAt: null,
  };
  const chapters: ChapterInfo[] = [1, 2].map(index => ({
    index, title: `chapter ${index}`, url: `${url}${index}/`,
    publishedAt: null, revisedAt: null,
  }));

  rejectChapterIndex = 2;
  assert.throws(() => persistNovelImport(db, info, chapters), /injected chapter write failure/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM novels WHERE site_type = ?').get(site.type)?.count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM chapters').get()?.count, (sites.indexOf(site) * 2));

  rejectChapterIndex = null;
  const saved = persistNovelImport(db, info, chapters);
  assert.equal(saved.siteType, site.type);
  assert.equal(saved.totalEpisodes, 2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM chapters WHERE novel_id = ?').get(saved.id)?.count, 2);
}

sqlite.close();
console.log('PASS: all four site imports persist atomically and failed chapter writes leave no partial novel');
