/**
 * SiteAdapter — abstract interface for novel sites.
 * Each supported site implements this interface.
 */
import type { SiteType } from '../types/novel';
import { syosetuAdapter } from './adapters/syosetuAdapter';
import { nocturneAdapter } from './adapters/nocturneAdapter';
import { kakuyomuAdapter } from './adapters/kakuyomuAdapter';
import { hamelnAdapter } from './adapters/hamelnAdapter';

/** Metadata returned by site search / novel info retrieval */
export interface NovelInfo {
    siteNovelId: string;
    url: string;
    publishedAt: string | null;
    revisedAt: string | null;
}

/** Downloaded chapter text content */
export interface ChapterContent {
    index: number;
    title: string;
    /** Raw HTML or cleaned text body */
    bodyHtml: string;
    /** Plain text (after stripping HTML) */
    bodyText: string;
}

/** Abstract adapter for a novel hosting site */
export interface SiteAdapter {
    siteType: SiteType;
    /** Human-readable site name */
    siteName: string;
    /** Check if a URL belongs to this site */
    matchesUrl(url: string): boolean;
    /** Extract site-specific novel ID from a URL */
    extractNovelId(url: string): string | null;
    /** Fetch novel metadata */
    getNovelInfo(novelId: string): Promise<NovelInfo>;
    /** Fetch table of contents (list of chapters) */
    getChapterList(novelId: string): Promise<ChapterInfo[]>;
    /** Download a single chapter's content */
    getChapterContent(novelId: string, chapterUrl: string): Promise<ChapterContent>;
    /** OPTIONAL: Fetch novel metadata in bulk (used for fast library updates) */
    getNovelInfoBulk?(novelIds: string[]): Promise<NovelInfo[]>;
}

/** Registry of adapters by site type */
const adapterRegistry = new Map<SiteType, SiteAdapter>();

export function registerAdapter(adapter: SiteAdapter): void {
    adapterRegistry.set(adapter.siteType, adapter);
}

// Auto-register known adapters (or call this from app init)
registerAdapter(syosetuAdapter);
registerAdapter(nocturneAdapter);
registerAdapter(kakuyomuAdapter);
registerAdapter(hamelnAdapter);

export function getAdapter(siteType: SiteType): SiteAdapter | undefined {
    return adapterRegistry.get(siteType);
}

export function getAdapterForUrl(url: string): SiteAdapter | undefined {
    for (const adapter of adapterRegistry.values()) {
        if (adapter.matchesUrl(url)) return adapter;
    }
    return undefined;
}

export function getAllAdapters(): SiteAdapter[] {
    return Array.from(adapterRegistry.values());
}
