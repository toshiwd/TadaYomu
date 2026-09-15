import assert from 'node:assert/strict';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getReaderSettings, getReadingProgress, upsertReadingProgress, isRemoteReadingProgressNewer } from '../src/database/repository';
import { DEFAULT_READER_SETTINGS } from '../src/types/novel';
import { generateReaderHtml } from '../src/services/readerHtmlGenerator';
import { runInNewContext } from 'node:vm';

const html = generateReaderHtml({
  chapterText: 'test', settings: DEFAULT_READER_SETTINGS,
  containerLayout: { width: 100, height: 200 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  readerTheme: { bg: '#fff', fg: '#000', selection: 'transparent' },
  documentId: 'test', startAtLastPage: false, rubyTextToHtml: text => text,
});
// Run the actual emitted capture function with geometry at different animation
// frames. The target is page 4 even while page 1 is still visually on screen.
const captureSource = html.slice(html.indexOf('  function capturePositionAnchor()'), html.indexOf('  function rangeAtCharacterOffset('));
for (const vertical of [true, false]) {
  for (const shift of [0, 150, 300]) {
    const rectFor = (index: number) => vertical
      ? { right: 100 + shift - index * 100, left: shift - index * 100, top: 0, bottom: 100 }
      : { left: index * 100 - shift, right: (index + 1) * 100 - shift, top: 0, bottom: 100 };
    const blocks = Array.from({ length: 6 }, (_, index) => ({
      index, textContent: 'x', getAttribute: () => String(index),
      getBoundingClientRect: () => rectFor(index),
    }));
    const anchor = runInNewContext(`${captureSource}; capturePositionAnchor()`, {
      reader: { scrollLeft: vertical ? 0 : shift, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 200 }), querySelectorAll: () => blocks },
      content: { getBoundingClientRect: () => ({ right: 100 + shift }) },
      isVertical: vertical, pageBoundaries: [0, 100, 200, 300, 400, 500], currentPage: 3, pageStepPx: 100,
      rangeAtCharacterOffset: (block: typeof blocks[number]) => ({ getBoundingClientRect: () => rectFor(block.index) }),
      contextHashForBlock: (block: typeof blocks[number]) => `block-${block.index}`,
    });
    assert.equal(anchor.blockIndex, 3, `page 4 anchor during ${vertical ? 'vertical' : 'horizontal'} animation at ${shift}`);
  }
}
console.log('PASS: emitted WebView anchor capture stays on target page throughout animation');

// Execute production repository SQL against a real, isolated in-memory SQLite DB.
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE novels (id INTEGER PRIMARY KEY, site_novel_id TEXT, site_type TEXT);
  INSERT INTO novels VALUES (1, 'test', 'syosetu');
  CREATE TABLE reading_progress (novel_id INTEGER PRIMARY KEY, current_chapter INTEGER,
    scroll_percentage REAL, anchor_block_index INTEGER, anchor_character_offset INTEGER,
    anchor_context_hash TEXT, last_read_at TEXT);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);`);
const db = {
  getFirstSync: (sql: string, params: unknown[] = []) => sqlite.prepare(sql).get(...params) ?? null,
  runSync: (sql: string, params: unknown[] = []) => sqlite.prepare(sql).run(...params),
} as unknown as SQLiteDatabase;
const anchor = { blockIndex: 18, characterOffset: 25, contextHash: 'saved-text' };
try {
  upsertReadingProgress(db, 1, 4, 0.6, anchor, '2026-09-15T01:00:00.125Z');
  assert.deepEqual(getReadingProgress(db, 1)?.positionAnchor, anchor);
  assert.equal(getReadingProgress(db, 1)?.lastReadAt, '2026-09-15T01:00:00.125Z');
  upsertReadingProgress(db, 1, 4, 0.6);
  assert.deepEqual(getReadingProgress(db, 1)?.positionAnchor, anchor, 'reopen preserves anchor');
  upsertReadingProgress(db, 1, 4, 0.2, null, '2026-09-15T01:00:00.250Z');
  assert.equal(getReadingProgress(db, 1)?.positionAnchor, null, 'legacy cloud data clears incompatible anchor');
  assert.equal(getReadingProgress(db, 1)?.lastReadAt, '2026-09-15T01:00:00.250Z', 'cloud timestamp must not become now');
  assert.ok(isRemoteReadingProgressNewer('2026-09-15T01:00:00.125Z', '2026-09-15T01:00:00.250Z'));
  assert.throws(() => upsertReadingProgress(db, 1, Number.NaN, 0));
  assert.throws(() => upsertReadingProgress(db, 1, 0, 0));
  assert.equal(getReadingProgress(db, 1)?.currentChapter, 4, 'invalid writes preserve existing progress');
  upsertReadingProgress(db, 1, 5, 0);
  assert.equal(getReadingProgress(db, 1)?.positionAnchor, null, 'chapter changes clear anchor');
  sqlite.prepare('INSERT INTO settings VALUES (?, ?)').run('reader_settings', JSON.stringify({ fontFamily: null, fontSize: 'huge', margin: -99, fullscreen: 'yes' }));
  const settings = getReaderSettings(db);
  assert.equal(settings.fontFamily, DEFAULT_READER_SETTINGS.fontFamily);
  assert.equal(settings.fontSize, DEFAULT_READER_SETTINGS.fontSize);
  assert.equal(settings.margin, 0);
  assert.equal(settings.fullscreen, DEFAULT_READER_SETTINGS.fullscreen);
  console.log('PASS: SQLite progress persistence, cloud timestamps, anchors and malformed settings');
} finally {
  sqlite.close();
}
