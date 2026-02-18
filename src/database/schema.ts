/**
 * SQLite database initialization and schema for Tadayomu.
 * Uses expo-sqlite v16 synchronous API.
 */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'tadayomu.db';

/** Open (or create) the database */
export function getDatabase(): SQLiteDatabase {
    return openDatabaseSync(DB_NAME);
}

/** Initialize all tables */
export function initDatabase(db: SQLiteDatabase): void {
    db.execSync(`
    CREATE TABLE IF NOT EXISTS novels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_novel_id TEXT NOT NULL,
      site_type TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      synopsis TEXT NOT NULL DEFAULT '',
      total_episodes INTEGER NOT NULL DEFAULT 0,
      downloaded_episodes INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      cover_path TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_complete INTEGER NOT NULL DEFAULT 0,
      site_updated_at TEXT,
      last_checked_at TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_novel_id, site_type)
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER NOT NULL,
      chapter_index INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      local_path TEXT,
      is_downloaded INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      revised_at TEXT,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      UNIQUE(novel_id, chapter_index)
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      novel_id INTEGER PRIMARY KEY,
      current_chapter INTEGER NOT NULL DEFAULT 1,
      scroll_percentage REAL NOT NULL DEFAULT 0,
      last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER NOT NULL,
      chapter_index INTEGER NOT NULL,
      scroll_percentage REAL NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novel_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_novel ON bookmarks(novel_id);
  `);
}
