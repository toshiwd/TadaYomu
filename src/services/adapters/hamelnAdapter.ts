/**
 * HamelnAdapter — adapter for ハーメルン (syosetu.org).
 *
 * Scrapes HTML from Hameln pages to extract novel metadata and chapters.
 */
import type {
    SiteAdapter, NovelInfo, ChapterInfo, ChapterContent,
} from '../siteAdapter';
import type { SiteType } from '../../types/novel';

const HAMELN_BASE = 'https://syosetu.org';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';

async function fetchHtml(url: string): Promise<string> {
    console.log(`[HamelnAdapter] Fetching: ${url}`);
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });
    console.log(`[HamelnAdapter] Status: ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const text = await res.text();
    console.log(`[HamelnAdapter] Response Length: ${text.length}`);
    return text;
}

function extractNovelId(url: string): string | null {
    const match = url.match(/syosetu\.org\/novel\/(\d+)/i);
    return match ? match[1] : null;
}

function stripHtml(html: string): string {
    return html
        .replace(/<ruby>([^<]*)<rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/g, '$2')
        .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi, '$1')
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

export function extractHamelnAuthor(html: string): string {
    const itempropMatch = html.match(
        /<span[^>]*itemprop=["']author["'][^>]*>([\s\S]*?)<\/span>/i,
    );
    if (itempropMatch) {
        return stripHtml(itempropMatch[1]).trim();
    }

    const labelMatch = html.match(
        /(?:作者|作)[：:]\s*(?:<span[^>]*>|<a[^>]*>)?([\s\S]*?)(?:<\/span>|<\/a>|<br\s*\/?>|$)/i,
    );
    return labelMatch ? stripHtml(labelMatch[1]).trim() : '';
}

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

function parseHamelnDate(text: string): string | null {
    const m = text.match(/(\d{4})[\/年]\s*(\d{1,2})[\/月]\s*(\d{1,2})日?\s+(\d{1,2}):(\d{1,2})/);
    if (!m) return null;
    return new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}:00+09:00`).toISOString();
}

function htmlToNovelFormat(html: string): string {
    let text = html;

    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');

    // standard Hameln ruby: <ruby><rb>漢字</rb><rt>かんじ</rt></ruby>
    text = text.replace(/<ruby><rb>(.*?)<\/rb><rp>.*?<\/rp><rt>(.*?)<\/rt><rp>.*?<\/rp><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<ruby><rb>(.*?)<\/rb><rt>(.*?)<\/rt><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<ruby>(.*?)<rp>.*?<\/rp><rt>(.*?)<\/rt><rp>.*?<\/rp><\/ruby>/gi, '|$1《$2》');

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

export const hamelnAdapter: SiteAdapter = {
    siteType: 'hameln' as SiteType,
    siteName: 'ハーメルン',

    matchesUrl(url: string): boolean {
        return /syosetu\.org/i.test(url);
    },

    extractNovelId(url: string): string | null {
        return extractNovelId(url);
    },

    async getNovelInfo(novelId: string): Promise<NovelInfo> {
        const url = `${HAMELN_BASE}/novel/${novelId}/`;
        const html = await fetchHtml(url);

        // Extract title
        const titleMatch = html.match(/<title>(.*?)(?:\s*-\s*ハーメルン)?<\/title>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : novelId;

        // Extract author
        const author = extractHamelnAuthor(html);

        // Extract synopsis
        const synopsisMatch = html.match(/<div\s+class="ss[^"]*">([\s\S]*?)<\/div>\s*<span/i) || html.match(/<div\s+class="ss[^"]*">([\s\S]*?)<\/div>/i);
        const synopsis = synopsisMatch ? stripHtml(synopsisMatch[1]).trim() : '';

        // Detect completion status
        const isComplete = /状態[：:]\s*[^<]*完結/.test(html);

        // Get last updated time if possible (usually standard on index)
        let lastUpdatedAt = null;
        const dateMatches = html.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/g);
        if (dateMatches && dateMatches.length > 0) {
            const lastStr = dateMatches[dateMatches.length - 1];
            const m = lastStr.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
            if (m) {
                lastUpdatedAt = new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}:00+09:00`).toISOString();
            }
        }

        return {
            siteNovelId: novelId,
            siteType: 'hameln',
            title,
            author,
            synopsis,
            totalEpisodes: 0, // Calculated in getChapterList
            isComplete,
            url,
            lastUpdatedAt,
        };
    },

    async getChapterList(novelId: string): Promise<ChapterInfo[]> {
        const url = `${HAMELN_BASE}/novel/${novelId}/`;
        const html = await fetchHtml(url);

        const chapters: ChapterInfo[] = [];

        // Link pattern: <a href="./1.html">...
        // Hameln chapter list usually looks like table rows:
        // <tr bgcolor="#FFFFFF"><td ...>...</td><td ...><a href="./1.html">タイトル</a></td><td class="non">2023年01月01日 12:00<br/>(改) 2023年01月02日 12:00</td>...
        const rowRegex = /<tr[^>]*>[\s\S]*?<a\s+href=["']?(?:\.\/|\/novel\/\d+\/)?(\d+)\.html["']?\s*[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;

        let match;
        const seenIndexes = new Set<number>();

        while ((match = rowRegex.exec(html)) !== null) {
            const index = parseInt(match[1], 10);
            const title = stripHtml(match[2]).trim();
            const dateHtml = match[3];

            if (index > 0 && !seenIndexes.has(index)) {
                // Ensure the link is actually a chapter link within the table of contents
                seenIndexes.add(index);

                let pbDate = null;
                let rvDate = null;

                // Typical format: 2023年01月01日 12:00
                const dateMatches = [...dateHtml.matchAll(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/g)];
                if (dateMatches.length > 0) {
                    const m1 = dateMatches[0];
                    pbDate = new Date(`${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}T${m1[4].padStart(2, '0')}:${m1[5].padStart(2, '0')}:00+09:00`).toISOString();
                    rvDate = pbDate;

                    if (dateMatches.length > 1) {
                        const m2 = dateMatches[1];
                        rvDate = new Date(`${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}T${m2[4].padStart(2, '0')}:${m2[5].padStart(2, '0')}:00+09:00`).toISOString();
                    }
                }

                chapters.push({
                    index,
                    title,
                    url: `${HAMELN_BASE}/novel/${novelId}/${index}.html`,
                    publishedAt: pbDate,
                    revisedAt: rvDate,
                });
            }
        }

        if (chapters.length === 0) {
            const entryMatch = html.match(/<ul\s+class=["'][^"']*\bentry\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
            const chapterListHtml = entryMatch ? entryMatch[1] : html;
            const linkRegex = /<a\s+[^>]*href=["'](?:\.\/|\/novel\/\d+\/)(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;

            while ((match = linkRegex.exec(chapterListHtml)) !== null) {
                const index = parseInt(match[1], 10);
                if (index <= 0 || seenIndexes.has(index)) continue;

                seenIndexes.add(index);

                const anchorHtml = match[2];
                const dateHtml = anchorHtml.match(/<span\s+class=["']date["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '';
                const titleHtml = anchorHtml
                    .replace(/<span\s+class=["']date["'][^>]*>[\s\S]*?<\/span>/gi, '')
                    .replace(/<br\s*\/?>[\s\S]*$/i, '');
                const title = stripHtml(titleHtml).trim() || `第${index}話`;
                const dateText = stripHtml(dateHtml);
                const dateMatches = dateText.match(/(\d{4}[\/年]\s*\d{1,2}[\/月]\s*\d{1,2}日?\s+\d{1,2}:\d{1,2})/g) ?? [];
                const pbDate = dateMatches[0] ? parseHamelnDate(dateMatches[0]) : null;
                const rvDate = dateMatches[1] ? parseHamelnDate(dateMatches[1]) : pbDate;

                chapters.push({
                    index,
                    title,
                    url: `${HAMELN_BASE}/novel/${novelId}/${index}.html`,
                    publishedAt: pbDate,
                    revisedAt: rvDate,
                });
            }
        }

        // Sort just in case order is weird
        chapters.sort((a, b) => a.index - b.index);

        if (chapters.length === 0) {
            // Short story fallback if "honbun" is found on the same page
            if (/<div\s+id="honbun"/i.test(html)) {
                chapters.push({
                    index: 1,
                    title: '本文',
                    url: `${HAMELN_BASE}/novel/${novelId}/`,
                    publishedAt: null,
                    revisedAt: null,
                });
            } else {
                throw new Error('Failed to parse the chapter list from Hameln');
            }
        }

        return chapters;
    },

    async getChapterContent(novelId: string, chapterUrl: string): Promise<ChapterContent> {
        const html = await fetchHtml(chapterUrl);

        // Extract Title
        let title = '';
        const titleMatch = html.match(/<span\s+style="font-size:120%[^"]*">([\s\S]*?)<\/span>/i);
        if (titleMatch) {
            title = stripHtml(titleMatch[1]).trim();
        }

        // Extract body inside <div id="honbun">
        let bodyHtml = '';
        const bodyMatch = html.match(/<div\s+id="honbun"[^>]*>([\s\S]*?)<\/div>\s*(?:<!--|<div[^>]*class="[^"]*nav[^"]*"|<p[^>]*class="[^"]*nav[^"]*")/i)
            || html.match(/<div\s+id="honbun"[^>]*>([\s\S]*?)<\/div>(?:\s*<\/div>)?\s*$/i);

        if (bodyMatch && bodyMatch[1].trim().length > 0) {
            bodyHtml = bodyMatch[1].trim();
        }

        if (!bodyHtml) {
            // Fallback for short stories where honbun is just in the middle
            const fallbackBodyMatch = html.match(/<div\s+id="honbun"[^>]*>([\s\S]*?)<\/div>/i);
            if (fallbackBodyMatch) {
                bodyHtml = fallbackBodyMatch[1].trim();
            } else {
                throw new Error('Failed to parse chapter content from Hameln');
            }
        }

        const indexMatch = chapterUrl.match(/\/(\d+)\.html/i);
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
