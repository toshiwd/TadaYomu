/**
 * Core data types for Tadayomu novel reader.
 */

/** Supported novel hosting sites */
export type SiteType =
  | 'syosetu'      // 小説家になろう
  | 'nocturne'     // ノクターンノ�Eルズ
  | 'moonlight'    // ムーンライトノベルズ
  | 'midnight'     // ミッドナイトノベルズ
  | 'hameln'       // ハ�Eメルン
  | 'kakuyomu';    // カクヨム

/** Novel metadata stored in local database */
export interface Novel {
  id: number;
  /** Unique code on the site (e.g. ncode for syosetu) */
  siteNovelId: string;
  siteType: SiteType;
  title: string;
  author: string;
  synopsis: string;
  /** Total number of episodes/chapters */
  totalEpisodes: number;
  /** Number of downloaded episodes */
  downloadedEpisodes: number;
  /** URL of the novel's top/index page */
  url: string;
  /** Cover image path (local) */
  coverPath: string | null;
  /** User-defined tags */
  tags: string[];
  /** Is the novel marked as complete by author? */
  isComplete: boolean;
  /** Last updated on the site */
  siteUpdatedAt: string | null;
  /** Last time we downloaded/checked */
  lastCheckedAt: string | null;
  /** When the novel was added to library */
  addedAt: string;
  /** Current chapter derived from reading progress (optional, used in library view to avoid N+1) */
  currentChapter?: number;
  /** Scroll percentage derived from reading progress (optional, used in library view to avoid N+1) */
  scrollPercentage?: number;
  /** Whether the novel is hidden in the archive */
  isArchived: boolean;
}

/** A single chapter/episode of a novel */
export interface Chapter {
  id: number;
  novelId: number;
  /** Chapter index (1-based) */
  index: number;
  title: string;
  /** Path to the local text file */
  localPath: string | null;
  /** Whether this chapter has been downloaded */
  isDownloaded: boolean;
  /** URL of this chapter on the site */
  url: string;
  /** Date published on the site */
  publishedAt: string | null;
  /** Date last revised on the site */
  revisedAt: string | null;
}

/** Reading progress for synchronization */
export interface ReadingProgress {
  novelId: number;
  siteNovelId: string;
  siteType: SiteType;
  currentChapter: number;
  scrollPercentage: number;
  lastReadAt: string;
}

/** Bookmark within a chapter */
export interface Bookmark {
  id: number;
  novelId: number;
  chapterIndex: number;
  scrollPercentage: number;
  label: string;
  createdAt: string;
}

/** Reader display settings */
export interface ReaderSettings {
  /** Font family: 'serif' (Mincho) or 'sans-serif' (Gothic) */
  fontFamily: 'serif' | 'sans-serif' | string;
  fontSize: number;
  lineHeight: number;
  /** Writing direction */
  writingMode: 'vertical' | 'horizontal';
  /** Color theme */
  theme: 'light' | 'dark' | 'sepia';
  /** Page margin in px (left/right) */
  margin: number;
  /** Top margin in px (reading comfort) */
  marginTop: number;
  /** Bottom margin in px (Kindle-style, thicker than top) */
  marginBottom: number;
  /** Auto-scroll speed (0 = off) */
  autoScrollSpeed: number;
  /** Reverse page tap direction (left=next, right=prev) */
  reversePageDirection: boolean;
  pageTurnAnimation: boolean;
  /** Paragraph spacing multiplier (0.0 E.0) */
  paragraphSpacing: number;
  /** Fullscreen mode (hide status bar/clock) */
  fullscreen: boolean;
  /** Show inline images instead of link placeholders */
  showImages: boolean;
}

/** Default reader settings */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.5,
  writingMode: 'vertical',
  theme: 'light',
  margin: 16,
  marginTop: 14,
  marginBottom: 28,
  autoScrollSpeed: 0,
  reversePageDirection: false,
  pageTurnAnimation: true,
  paragraphSpacing: 0.5,
  fullscreen: true,
  showImages: false,
};


