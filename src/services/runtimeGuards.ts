import type { Novel } from '../types/novel';
import type { NovelInfo } from './siteAdapter';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateSliderValue(
  startValue: number,
  dx: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number {
  if (!Number.isFinite(width) || width <= 0 || max <= min) {
    return clamp(startValue, min, max);
  }
  const rawValue = startValue + (dx / width) * (max - min);
  const clampedValue = clamp(rawValue, min, max);
  if (!Number.isFinite(step) || step <= 0) return clampedValue;
  const steppedValue = min + Math.round((clampedValue - min) / step) * step;
  return Number(clamp(steppedValue, min, max).toFixed(2));
}

export function getLibraryProgressPercentage(
  currentChapter: number | undefined,
  totalEpisodes: number,
): number | null {
  if (
    currentChapter === undefined ||
    !Number.isFinite(currentChapter) ||
    !Number.isFinite(totalEpisodes) ||
    totalEpisodes <= 0
  ) return null;
  return clamp((currentChapter / totalEpisodes) * 100, 0, 100);
}

export function hasNovelMetadataUpdate(
  novel: Pick<Novel, 'totalEpisodes' | 'isComplete' | 'siteUpdatedAt'>,
  info: Pick<NovelInfo, 'totalEpisodes' | 'isComplete' | 'lastUpdatedAt'>,
): boolean {
  if (info.totalEpisodes > novel.totalEpisodes || info.isComplete !== novel.isComplete) return true;
  if (!info.lastUpdatedAt) return false;
  const remoteTime = Date.parse(info.lastUpdatedAt);
  if (Number.isNaN(remoteTime)) return false;
  if (!novel.siteUpdatedAt) return true;
  const localTime = Date.parse(novel.siteUpdatedAt);
  return Number.isNaN(localTime) || remoteTime > localTime;
}

function parseDatabaseTimestampMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  const timestamp = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isSameLocalCalendarDay(
  timestamp: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const parsed = parseDatabaseTimestampMs(timestamp);
  if (parsed <= 0) return false;
  const date = new Date(parsed);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function shouldRefreshChapterList(
  localChapterCount: number,
  totalEpisodes: number,
  lastCheckedAt: string | null | undefined,
  nowMs: number = Date.now(),
  maxAgeMs: number = 5 * 60 * 1000,
): boolean {
  if (localChapterCount <= 0 || totalEpisodes > localChapterCount) return true;
  const lastCheckedMs = parseDatabaseTimestampMs(lastCheckedAt);
  return lastCheckedMs <= 0 || nowMs - lastCheckedMs >= maxAgeMs;
}

export function normalizeBackgroundCursor(
  rawCursor: string | null | undefined,
  itemCount: number,
): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  const parsed = Number.parseInt(rawCursor ?? '0', 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed) % Math.floor(itemCount);
}

export function getNextChapterListPage(
  knownChapterCount: number,
  pageSize: number = 100,
): number {
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : 100;
  const normalizedCount = Number.isFinite(knownChapterCount)
    ? Math.max(0, Math.floor(knownChapterCount))
    : 0;
  return Math.max(1, Math.ceil((normalizedCount + 1) / normalizedPageSize));
}
