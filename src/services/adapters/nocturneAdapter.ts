/**
 * NocturneAdapter — adapter for ノクターンノベルズ (novel18.syosetu.com).
 *
 * Nocturne Novels is an 18+ sister-site of 小説家になろう.
 * Uses the same Narou API (with nocgenre filter) and similar HTML structure.
 * Requires the over18=yes cookie for content access.
 */
import type {
    SiteAdapter, NovelInfo, ChapterInfo, ChapterContent,
} from '../siteAdapter';
import type { SiteType } from '../../types/novel';

const NAROU_API = 'https://api.syosetu.com/novel18api/api/';
const NOCTURNE_BASE = 'https://novel18.syosetu.com';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36';
const RATE_LIMIT_MS = 2000;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<string> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    lastRequestTime = Date.now();

    console.log(`[NocturneAdapter] Fetching: ${url}`);
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': 'over18=yes',
        },
    });
    console.log(`[NocturneAdapter] Status: ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const text = await res.text();
    console.log(`[NocturneAdapter] Response Length: ${text.length}`);
    return text;
}

function parseNarouApiResponse(json: string): any[] {
    const data = JSON.parse(json);
    return Array.isArray(data) ? data.slice(1) : [];
}

/** Extract ncode from URL: https://novel18.syosetu.com/n1234ab/ → n1234ab */
function extractNcode(url: string): string | null {
    const match = url.match(/novel18\.syosetu\.com\/([a-z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
}

/** Strip HTML tags and decode entities */
function stripHtml(html: string): string {
    return html
        .replace(/<ruby>([^<]*)<rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/g, '$2')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/** Preserve ruby tags for the reader, strip everything else */
function cleanHtmlForReader(html: string): string {
    let cleaned = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');

    cleaned = cleaned.replace(/<(?!\/?(?:ruby|rb|rt|rp|img)\b)[^>]+>/gi, '');

    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');

    return cleaned.trim();
}

/** Convert HTML with Ruby tags to internal |Text《Ruby》 format */
function htmlToNovelFormat(html: string): string {
    let text = html;

    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');

    text = text.replace(/<ruby>(.*?)<rp>.*?<\/rp><rt>(.*?)<\/rt><rp>.*?<\/rp><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi, '|$1《$2》');

    text = text.replace(/<(?!\/?img\b)[^>]+>/gi, '');

    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');

    return text.trim();
}

export const nocturneAdapter: SiteAdapter = {
    siteType: 'nocturne' as SiteType,
    siteName: 'ノクターンノベルズ',

    matchesUrl(url: string): boolean {
        return /novel18\.syosetu\.com/i.test(url);
    },

    extractNovelId(url: string): string | null {
        return extractNcode(url);
    },

    async getNovelInfo(novelId: string): Promise<NovelInfo> {
        const apiUrl = `${NAROU_API}?out=json&ncode=${novelId}&of=t-w-s-ga-e-gf-n`;
        const json = await rateLimitedFetch(apiUrl);
        const novels = parseNarouApiResponse(json);

        if (novels.length === 0) {
            throw new Error(`Novel not found: ${novelId}`);
        }

        const n = novels[0];
        return {
            siteNovelId: novelId,
            siteType: 'nocturne',
            title: n.title || novelId,
            author: n.writer || '',
            synopsis: n.story || '',
            totalEpisodes: n.general_all_no || 0,
            isComplete: n.end === 0,
            url: `${NOCTURNE_BASE}/${novelId}/`,
            lastUpdatedAt: n.novelupdated_at || n.general_firstup || null,
        };
    },

    async getNovelInfoBulk(novelIds: string[]): Promise<NovelInfo[]> {
        if (novelIds.length === 0) return [];
        const chunk = novelIds.slice(0, 500);
        const ncodes = chunk.join('-');
        const apiUrl = `${NAROU_API}?out=json&ncode=${ncodes}&of=t-w-s-ga-e-gf-n-nu`;

        const json = await rateLimitedFetch(apiUrl);
        const novels = parseNarouApiResponse(json);

        return novels.map((n: any) => {
            let lastUpdatedAt = null;
            if (n.novelupdated_at) {
                lastUpdatedAt = new Date(n.novelupdated_at.replace(/-/g, '/') + ' +0900').toISOString();
            } else if (n.general_firstup) {
                lastUpdatedAt = new Date(n.general_firstup.replace(/-/g, '/') + ' +0900').toISOString();
            }

            const siteNovelId = n.ncode ? n.ncode.toLowerCase() : '';

            return {
                siteNovelId,
                siteType: 'nocturne',
                title: n.title || siteNovelId,
                author: n.writer || '',
                synopsis: n.story || '',
                totalEpisodes: n.general_all_no || 0,
                isComplete: n.end === 0,
                url: `${NOCTURNE_BASE}/${siteNovelId}/`,
                lastUpdatedAt,
            };
        });
    },

    async getChapterList(novelId: string): Promise<ChapterInfo[]> {
        const chapters: ChapterInfo[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const base = `${NOCTURNE_BASE}/${novelId}`;
            const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
            const indexUrl = `${cleanBase}/?p=${page}`;
            const html = await rateLimitedFetch(indexUrl);

            const linkRegex = /<a\s+href="\/[a-z0-9]+\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
            let match: RegExpExecArray | null;
            let foundInPage = 0;

            while ((match = linkRegex.exec(html)) !== null) {
                const index = parseInt(match[1], 10);
                const title = stripHtml(match[2]).trim();
                if (index > 0 && title) {
                    chapters.push({
                        index,
                        title,
                        url: `${NOCTURNE_BASE}/${novelId}/${index}/`,
                        publishedAt: null,
                        revisedAt: null,
                    });
                    foundInPage++;
                }
            }

            if (foundInPage === 0) {
                hasMore = false;
            } else if (foundInPage < 100) {
                hasMore = false;
            } else {
                page++;
                if (page > 50) hasMore = false;
            }
        }

        if (chapters.length === 0) {
            chapters.push({
                index: 1,
                title: '本文',
                url: `${NOCTURNE_BASE}/${novelId}/`,
                publishedAt: null,
                revisedAt: null,
            });
        }

        return chapters;
    },

    async getChapterContent(novelId: string, chapterUrl: string): Promise<ChapterContent> {
        const html = await rateLimitedFetch(chapterUrl);

        let title = '';
        const subtitleMatch = html.match(/<[^>]+class="[^"]*p-novel__subtitle[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
        const pcTitleMatch = html.match(/<p\s+class="novel_subtitle"[^>]*>([\s\S]*?)<\/p>/i);

        if (subtitleMatch) title = stripHtml(subtitleMatch[1]);
        else if (pcTitleMatch) title = stripHtml(pcTitleMatch[1]);

        let bodyHtml = '';

        // Strategy 1: Collect all <p id="L1">, <p id="L2">, etc.
        // Relaxed regex to allow single/double quotes and varying spacing
        const pTagRegex = /<p\s+id=["']L\d+["'][^>]*>[\s\S]*?<\/p>/gi;
        const pTags = html.match(pTagRegex);
        if (pTags && pTags.length > 0) {
            bodyHtml = pTags.join('\n');
        }

        // Strategy 2: Current site format
        if (!bodyHtml) {
            const mobileBodyMatch = html.match(/<div\s+[^>]*class=["'][^"']*(?:js-novel-text|p-novel__text)[^"']*["'][^>]*>([\s\S]*)<\/div>/i);
            if (mobileBodyMatch && mobileBodyMatch[1].trim().length > 0) {
                bodyHtml = mobileBodyMatch[1];
            }
        }

        // Strategy 3: Old PC format
        if (!bodyHtml) {
            const pcBodyMatch = html.match(/<div\s+[^>]*id=["']novel_honbun["'][^>]*>([\s\S]*)<\/div>/i);
            if (pcBodyMatch && pcBodyMatch[1].trim().length > 0) {
                bodyHtml = pcBodyMatch[1];
            }
        }

        // Strategy 4: Fallback to entire body if it looks like a short story
        if (!bodyHtml && html.length > 500) {
            // Check for known "Deleted" or "Hidden" markers
            if (html.includes('指定された小説は削除')) {
                throw new Error('This novel has been deleted.');
            }
            if (html.includes('年齢確認') || html.includes('Enter')) {
                throw new Error('Age verification required (Cookie failed)');
            }
        }

        if (!bodyHtml) {
            console.warn('[NocturneAdapter] WARNING: No body content found in HTML!');
        }

        const indexMatch = chapterUrl.match(/\/(\d+)\/\s*$/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : 1;

        const rubyText = htmlToNovelFormat(bodyHtml);
        const cleanedHtml = cleanHtmlForReader(bodyHtml);

        return {
            index,
            title,
            bodyHtml: cleanedHtml,
            bodyText: rubyText,
        };
    },
};
