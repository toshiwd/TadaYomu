/**
 * SyosetuAdapter — adapter for 小説家になろう (syosetu.com).
 *
 * Uses the official Narou API for metadata and HTML scraping for chapter text.
 * Rate-limited to 1 request per 2 seconds to be polite.
 */
import type {
    SiteAdapter, NovelInfo, ChapterInfo, ChapterContent,
} from '../siteAdapter';
import type { SiteType } from '../../types/novel';

const NAROU_API = 'https://api.syosetu.com/novelapi/api/';
const NAROU_BASE = 'https://ncode.syosetu.com';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36';
const RATE_LIMIT_MS = 2000;

let lastRequestTime = 0;

function parseNarouDate(dateStr: string | null | undefined): string | null {
    if (!dateStr || dateStr.startsWith('0000') || dateStr.trim() === '') return null;
    try {
        const d = new Date(dateStr.replace(/-/g, '/') + ' +0900');
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch {
        return null;
    }
}

async function rateLimitedFetch(url: string): Promise<string> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    lastRequestTime = Date.now();

    console.log(`[Adapter] Fetching: ${url}`);
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': 'over18=yes',
        },
    });
    console.log(`[Adapter] Status: ${res.status}`);
    console.log(`[Adapter] Final URL: ${res.url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const text = await res.text();
    console.log(`[Adapter] Response Length: ${text.length}`);
    return text;
}

/**
 * Parse the Narou API JSON response.
 * Response format: first element is { allcount: N }, rest are novels.
 */
function parseNarouApiResponse(json: string): any[] {
    const data = JSON.parse(json);
    // First element is the meta { allcount }, skip it
    return Array.isArray(data) ? data.slice(1) : [];
}

/** Extract ncode from URL: https://ncode.syosetu.com/n1234ab/ → n1234ab */
function extractNcode(url: string): string | null {
    const match = url.match(/ncode\.syosetu\.com\/([a-z0-9]+)/i);
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
    // Keep <ruby>, <rb>, <rt>, <rp> tags
    // Convert <br> to newline-in-paragraph
    let cleaned = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');

    // Remove all tags except ruby-related and img
    cleaned = cleaned.replace(/<(?!\/?(?:ruby|rb|rt|rp|img)\b)[^>]+>/gi, '');

    // Decode entities
    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');

    return cleaned.trim();
}

export const syosetuAdapter: SiteAdapter = {
    siteType: 'syosetu' as SiteType,
    siteName: '小説家になろう',

    matchesUrl(url: string): boolean {
        // Exclude novel18.syosetu.com (Nocturne) — handled by nocturneAdapter
        if (/novel18\.syosetu\.com/i.test(url)) return false;
        return /ncode\.syosetu\.com/i.test(url) ||
            /syosetu\.com\/[a-z0-9]+/i.test(url);
    },

    extractNovelId(url: string): string | null {
        return extractNcode(url);
    },

    async getNovelInfo(novelId: string): Promise<NovelInfo> {
        const lowerId = novelId.toLowerCase();
        const apiUrl = `${NAROU_API}?out=json&ncode=${lowerId}&of=t-w-s-ga-e-gf-n-nu-gl`;
        const json = await rateLimitedFetch(apiUrl);
        const novels = parseNarouApiResponse(json);

        if (novels.length === 0) {
            throw new Error(`Novel not found: ${novelId}`);
        }

        const n = novels[0];
        let lastUpdatedAt = parseNarouDate(n.general_lastup) ||
            parseNarouDate(n.novelupdated_at) ||
            parseNarouDate(n.general_firstup);

        return {
            siteNovelId: lowerId,
            siteType: 'syosetu',
            title: n.title || lowerId,
            author: n.writer || '',
            synopsis: n.story || '',
            totalEpisodes: n.general_all_no || 0,
            isComplete: n.end === 0,
            url: `${NAROU_BASE}/${lowerId}/`,
            lastUpdatedAt,
        };
    },

    async getNovelInfoBulk(novelIds: string[]): Promise<NovelInfo[]> {
        if (novelIds.length === 0) return [];
        // Max 500 ncodes per request supported by Narou API
        const chunk = novelIds.slice(0, 500);
        const ncodes = chunk.join('-');
        const apiUrl = `${NAROU_API}?out=json&ncode=${ncodes}&of=t-w-s-ga-e-gf-n-nu-gl`;

        const json = await rateLimitedFetch(apiUrl);
        const novels = parseNarouApiResponse(json);

        return novels.map((n: any) => {
            let lastUpdatedAt = parseNarouDate(n.general_lastup) ||
                parseNarouDate(n.novelupdated_at) ||
                parseNarouDate(n.general_firstup);

            const siteNovelId = n.ncode ? n.ncode.toLowerCase() : '';

            return {
                siteNovelId,
                siteType: 'syosetu',
                title: n.title || siteNovelId,
                author: n.writer || '',
                synopsis: n.story || '',
                totalEpisodes: n.general_all_no || 0,
                isComplete: n.end === 0,
                url: `${NAROU_BASE}/${siteNovelId}/`,
                lastUpdatedAt,
            };
        });
    },

    async getChapterList(novelId: string): Promise<ChapterInfo[]> {
        const chapters: ChapterInfo[] = [];
        let page = 1;
        let hasMore = true;

        // Use lowercase to avoid redirect screens on Syosetu
        const lowerId = novelId.toLowerCase();
        let currentChapterTitle = '';

        while (hasMore) {
            // Syosetu uses ?p= for pagination. Avoid double slash if base ends with /
            const base = `${NAROU_BASE}/${lowerId}`;
            const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
            const indexUrl = `${cleanBase}/?p=${page}`;
            const html = await rateLimitedFetch(indexUrl);

            let foundInPage = 0;

            if (html.includes('class="p-eplist"')) {
                // --- NEW DESIGN (p-eplist) ---
                const parts = html.split(/<div\s+class="p-eplist__(chapter-title|sublist)"[^>]*>/i);

                // parts will be [html_before, "chapter-title" or "sublist", html_inside_div, "chapter-title" or "sublist", ...]
                for (let i = 1; i < parts.length; i += 2) {
                    const type = parts[i];
                    const content = parts[i + 1];
                    if (!content) continue;

                    if (type.toLowerCase() === 'chapter-title') {
                        // Extract text up to the closing div
                        const textMatch = content.match(/([\s\S]*?)<\/div>/i);
                        if (textMatch) {
                            currentChapterTitle = stripHtml(textMatch[1]).trim();
                        }
                    } else if (type.toLowerCase() === 'sublist') {
                        const linkMatch = content.match(/<a\s+href="\/[a-z0-9]+\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/i);
                        const dateMatch = content.match(/<div class="p-eplist__update">\s*([\d/:\s]+)(?:<span\s+title="([^"]+)"[^>]*>)?/i);

                        if (linkMatch) {
                            const index = parseInt(linkMatch[1], 10);
                            let title = stripHtml(linkMatch[2]).trim();

                            // Prepend chapter title if available
                            if (currentChapterTitle) {
                                title = `${currentChapterTitle} ${title}`;
                            }

                            let pbDate = null;
                            let rvDate = null;

                            if (dateMatch && dateMatch[1]) {
                                pbDate = new Date(dateMatch[1].trim().replace(/\//g, '-') + ':00+09:00').toISOString();
                                rvDate = pbDate;

                                if (dateMatch[2]) {
                                    const rvMatch = dateMatch[2].match(/([\d/:\s]+)/);
                                    if (rvMatch) {
                                        rvDate = new Date(rvMatch[1].trim().replace(/\//g, '-') + ':00+09:00').toISOString();
                                    }
                                }
                            }

                            if (index > 0 && title) {
                                chapters.push({
                                    index,
                                    title,
                                    url: `${NAROU_BASE}/${lowerId}/${index}/`,
                                    publishedAt: pbDate,
                                    revisedAt: rvDate,
                                });
                                foundInPage++;
                            }
                        }
                    }
                }
            } else {
                // --- OLD DESIGN (novel_sublist2) ---
                const elementRegex = /<div\s+class="chapter_title"[^>]*>([\s\S]*?)<\/div>|<dt\s+class="novel_sublist2">\s*([\d/:\s]+)(?:<span\s+title="([^"]+)"[^>]*>)?[\s\S]*?<\/dt>\s*<dd\s+class="subtitle">\s*<a\s+href="\/[a-z0-9]+\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>\s*<\/dd>/gi;
                let match: RegExpExecArray | null;

                while ((match = elementRegex.exec(html)) !== null) {
                    if (match[1]) {
                        // It's a chapter title
                        currentChapterTitle = stripHtml(match[1]).trim();
                    } else if (match[4]) {
                        // It's an episode
                        const rawDate = match[2] ? match[2].trim() : '';
                        const rawRevise = match[3] ? match[3].trim() : null;
                        const index = parseInt(match[4], 10);
                        let title = stripHtml(match[5]).trim();

                        if (currentChapterTitle) {
                            title = `${currentChapterTitle} ${title}`;
                        }

                        let pbDate = null;
                        let rvDate = null;

                        if (rawDate) {
                            pbDate = new Date(rawDate.replace(/\//g, '-') + ':00+09:00').toISOString();
                            rvDate = pbDate;
                        }
                        if (rawRevise) {
                            const rvMatch = rawRevise.match(/([\d/:\s]+)/);
                            if (rvMatch) {
                                rvDate = new Date(rvMatch[1].trim().replace(/\//g, '-') + ':00+09:00').toISOString();
                            }
                        }

                        if (index > 0 && title) {
                            chapters.push({
                                index,
                                title,
                                url: `${NAROU_BASE}/${lowerId}/${index}/`,
                                publishedAt: pbDate,
                                revisedAt: rvDate,
                            });
                            foundInPage++;
                        }
                    }
                }
            }

            // Pagination logic:
            // - If no chapters found, stop.
            // - If chapters < 100 (standard page size), it's the last page.
            if (foundInPage === 0) {
                hasMore = false;
            } else if (foundInPage < 100) {
                hasMore = false;
            } else {
                page++;
                // Safety break
                if (page > 50) hasMore = false;
            }
        }

        // If no chapters found, it might be a single-page novel (短編)
        if (chapters.length === 0) {
            chapters.push({
                index: 1,
                title: '本文',
                url: `${NAROU_BASE}/${novelId}/`,
                publishedAt: null,
                revisedAt: null,
            });
        }

        return chapters;
    },

    async getChapterContent(novelId: string, chapterUrl: string): Promise<ChapterContent> {
        const html = await rateLimitedFetch(chapterUrl);
        console.log(`[Adapter] Full HTML length: ${html.length}`);

        // Extract chapter title
        let title = '';
        // Try subtitle class first (current site structure)
        const subtitleMatch = html.match(/<[^>]+class="[^"]*p-novel__subtitle[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
        // Fallback: old PC format
        const pcTitleMatch = html.match(/<p\s+class="novel_subtitle"[^>]*>([\s\S]*?)<\/p>/i);

        if (subtitleMatch) title = stripHtml(subtitleMatch[1]);
        else if (pcTitleMatch) title = stripHtml(pcTitleMatch[1]);

        // Extract chapter body — try multiple strategies
        let bodyHtml = '';

        // Strategy 1 (most reliable): Collect all <p id="L1">, <p id="L2">, etc.
        // These are the actual chapter text paragraphs on syosetu (all versions)
        const pTagRegex = /<p\s+id="L\d+"[^>]*>[\s\S]*?<\/p>/gi;
        const pTags = html.match(pTagRegex);
        if (pTags && pTags.length > 0) {
            bodyHtml = pTags.join('\n');
            console.log(`[Adapter] Strategy 1: Found ${pTags.length} paragraph tags.`);
        }

        // Strategy 2: Current site format — <div class="js-novel-text p-novel__text">
        // Use greedy match to handle nested divs
        if (!bodyHtml) {
            const mobileBodyMatch = html.match(/<div\s+[^>]*class="[^"]*(?:js-novel-text|p-novel__text)[^"]*"[^>]*>([\s\S]*)<\/div>/i);
            if (mobileBodyMatch && mobileBodyMatch[1].trim().length > 0) {
                bodyHtml = mobileBodyMatch[1];
                console.log('[Adapter] Strategy 2: Used mobile body class match.');
            }
        }

        // Strategy 3: Old PC format — <div id="novel_honbun">
        if (!bodyHtml) {
            const pcBodyMatch = html.match(/<div\s+[^>]*id="novel_honbun"[^>]*>([\s\S]*)<\/div>/i);
            if (pcBodyMatch && pcBodyMatch[1].trim().length > 0) {
                bodyHtml = pcBodyMatch[1];
                console.log('[Adapter] Strategy 3: Used PC body id match.');
            }
        }

        if (!bodyHtml) {
            console.warn('[Adapter] WARNING: No body content found in HTML!');
            console.warn('[Adapter] HTML snippet:', html.substring(0, 500));
        }

        // Extract index from URL
        const indexMatch = chapterUrl.match(/\/(\d+)\/\s*$/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : 1;

        // Convert bodyHtml to our internal text format with |Text《Ruby》
        const rubyText = htmlToNovelFormat(bodyHtml);
        console.log(`[Adapter] Body HTML length: ${bodyHtml.length}`);
        console.log(`[Adapter] Converted text length: ${rubyText.length}`);
        if (rubyText.length > 0) {
            console.log(`[Adapter] Preview: ${rubyText.substring(0, 100)}`);
        } else {
            console.warn('[Adapter] WARNING: Converted text is empty!');
        }

        const cleanedHtml = cleanHtmlForReader(bodyHtml);

        return {
            index,
            title,
            bodyHtml: cleanedHtml,
            bodyText: rubyText,
        };
    },
};

/** Convert HTML with Ruby tags to internal |Text《Ruby》 format */
function htmlToNovelFormat(html: string): string {
    let text = html;

    // 1. Convert <br> and </p> to newlines (Mobile uses <p>)
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');

    // 2. Convert <ruby> structure to |Text《Ruby》
    // Syosetu format: <ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>
    // Simple regex for standard structure
    text = text.replace(/<ruby>(.*?)<rp>.*?<\/rp><rt>(.*?)<\/rt><rp>.*?<\/rp><\/ruby>/gi, '|$1《$2》');
    // Fallback for without rp
    text = text.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi, '|$1《$2》');

    // 3. Strip all other tags except img
    text = text.replace(/<(?!\/?img\b)[^>]+>/gi, '');

    // 4. Decode entities
    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');

    return text.trim();
}

