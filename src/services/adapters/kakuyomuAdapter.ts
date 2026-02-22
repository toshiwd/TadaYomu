/**
 * KakuyomuAdapter — adapter for カクヨム (kakuyomu.jp).
 *
 * Scrapes HTML from Kakuyomu pages to extract novel metadata and chapters.
 */
import type {
    SiteAdapter, NovelInfo, ChapterInfo, ChapterContent,
} from '../siteAdapter';
import type { SiteType } from '../../types/novel';

const KAKUYOMU_BASE = 'https://kakuyomu.jp';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36';

async function fetchHtml(url: string): Promise<string> {
    console.log(`[KakuyomuAdapter] Fetching: ${url}`);
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });
    console.log(`[KakuyomuAdapter] Status: ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const text = await res.text();
    console.log(`[KakuyomuAdapter] Response Length: ${text.length}`);
    return text;
}

/** Extract novel ID from URL: https://kakuyomu.jp/works/1177354054880238... → 117735... */
function extractNovelId(url: string): string | null {
    const match = url.match(/kakuyomu\.jp\/works\/(\d+)/i);
    return match ? match[1] : null;
}

/** Strip HTML tags and decode entities */
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

    // Kakuyomu ruby format: <ruby>漢字<rt>かんじ</rt></ruby> or <ruby><rb>漢字</rb><rt>かんじ</rt></ruby>
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

export const kakuyomuAdapter: SiteAdapter = {
    siteType: 'kakuyomu' as SiteType,
    siteName: 'カクヨム',

    matchesUrl(url: string): boolean {
        return /kakuyomu\.jp/i.test(url);
    },

    extractNovelId(url: string): string | null {
        return extractNovelId(url);
    },

    async getNovelInfo(novelId: string): Promise<NovelInfo> {
        const url = `${KAKUYOMU_BASE}/works/${novelId}`;
        const html = await fetchHtml(url);

        const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!jsonMatch) {
            throw new Error(`Failed to find Next.js data block for Kakuyomu novel ${novelId}`);
        }

        const data = JSON.parse(jsonMatch[1]);
        const state = data.props.pageProps.__APOLLO_STATE__;
        const workKey = `Work:${novelId}`;
        const work = state[workKey];

        if (!work) {
            throw new Error(`Novel work data not found in state for ${novelId}`);
        }

        const title = work.title || novelId;
        const authorRef = work.author?.__ref;
        const author = authorRef ? state[authorRef]?.activityName || '' : '';
        const synopsis = work.catchphrase || work.introduction || '';

        const isComplete = work.isComplete === true || work.status === 'COMPLETED';
        const lastUpdatedAt = work.updatedAt ? new Date(work.updatedAt).toISOString() : new Date().toISOString();

        return {
            siteNovelId: novelId,
            siteType: 'kakuyomu',
            title,
            author,
            synopsis,
            totalEpisodes: 0, // Calculated via getChapterList subsequently
            isComplete,
            url,
            lastUpdatedAt,
        };
    },

    async getChapterList(novelId: string): Promise<ChapterInfo[]> {
        const url = `${KAKUYOMU_BASE}/works/${novelId}`;
        const html = await fetchHtml(url);

        const chapters: ChapterInfo[] = [];
        const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

        if (!jsonMatch) {
            throw new Error(`Failed to find Next.js data block for chapter list of ${novelId}`);
        }

        const data = JSON.parse(jsonMatch[1]);
        const state = data.props.pageProps.__APOLLO_STATE__;
        const workKey = `Work:${novelId}`;
        const work = state[workKey];
        const toc = work?.tableOfContents;

        if (toc && Array.isArray(toc)) {
            let index = 1;
            for (const itemRef of toc) {
                const itemObj = state[itemRef.__ref];
                if (!itemObj) continue;

                if (itemObj.__typename === 'TableOfContentsChapter') {
                    const episodes = itemObj.episodeUnions;
                    if (episodes && Array.isArray(episodes)) {
                        for (const epRef of episodes) {
                            const epObj = state[epRef.__ref];
                            if (epObj && epObj.__typename === 'Episode') {
                                chapters.push({
                                    index,
                                    title: epObj.title || `Episode ${index}`,
                                    url: `${KAKUYOMU_BASE}/works/${novelId}/episodes/${epObj.id}`,
                                    publishedAt: epObj.publishedAt || null,
                                    revisedAt: epObj.publishedAt || null,
                                });
                                index++;
                            }
                        }
                    }
                } else if (itemObj.__typename === 'Episode') {
                    chapters.push({
                        index,
                        title: itemObj.title || `Episode ${index}`,
                        url: `${KAKUYOMU_BASE}/works/${novelId}/episodes/${itemObj.id}`,
                        publishedAt: itemObj.publishedAt || null,
                        revisedAt: itemObj.publishedAt || null,
                    });
                    index++;
                }
            }
        }

        if (chapters.length === 0) {
            throw new Error('Failed to parse the chapter list from Kakuyomu');
        }

        return chapters;
    },

    async getChapterContent(novelId: string, chapterUrl: string): Promise<ChapterContent> {
        const html = await fetchHtml(chapterUrl);

        // Extract Title
        const titleMatch = html.match(/<p\s+class="widget-episodeTitle js-vertical-composition-item">([\s\S]*?)<\/p>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]).trim() : '';

        // Extract body inside <div class="widget-episodeBody" id="episodeBody">
        let bodyHtml = '';
        const bodyMatch = html.match(/<div\s+class="widget-episodeBody js-vertical-composition-item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
            html.match(/<div\s+class="widget-episodeBody[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<!--)/i);

        if (bodyMatch && bodyMatch[1].trim().length > 0) {
            bodyHtml = bodyMatch[1].trim();
        } else {
            // Further fallback if structural change happens
            const fallbackBodyMatch = html.match(/<div\s+id="episodeBody"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
            if (fallbackBodyMatch) {
                bodyHtml = fallbackBodyMatch[1].trim();
            }
        }

        if (!bodyHtml) {
            throw new Error('Failed to parse chapter content from Kakuyomu');
        }

        const indexMatch = chapterUrl.match(/episodes\/(\d+)$/i);
        const index = indexMatch ? parseInt(indexMatch[1].substring(0, 8), 10) || 1 : 1; // Extracting integer form might be too large if it is timestamp based id, so we'd rather manage index sequence globally if required, but Kakuyomu uses arbitrary huge IDs, so we keep index 1 as default or pass through. We actually want the sequential index here but we dont have the list.
        // As a workaround since getChapterContent can't easily know its sequential index standalone, we'll try to find an episode number if available or rely on the caller assigning the correct index to the db.

        const rubyText = htmlToNovelFormat(bodyHtml);
        const cleanedHtml = cleanHtmlForReader(bodyHtml);

        return {
            index, // Caller/DB usually tracks the truth
            title,
            bodyHtml: cleanedHtml,
            bodyText: rubyText,
        };
    },
};
