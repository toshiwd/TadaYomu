import {
  formatNovelText,
  rubyTextToHtml,
} from "../src/services/textFormatter";
import { extractHamelnAuthor } from "../src/services/adapters/hamelnAdapter";
import {
  getAdapterForUrl,
  getAllAdapters,
} from "../src/services/siteAdapter";
import { isExpectedChapterListEndStatus } from "../src/services/adapters/nocturneAdapter";
import {
  isRemoteReadingProgressNewer,
  parseReadingTimestampMs,
} from "../src/database/repository";
import { normalizeReaderChapterIndex } from "../src/services/readerEntry";
import {
  createChapterReadKey,
  getNextChapterIndexToPrefetch,
  runChapterReadSingleFlight,
} from "../src/services/readerPrefetch";
import {
  getReaderFlickDirection,
  getVolumeButtonPageDirection,
} from "../src/services/readerInput";
import {
  createReaderProgressSnapshot,
  isReaderProgressForChapter,
  normalizeReaderProgress,
  normalizeReaderPositionAnchor,
  shouldProcessReaderPageInfo,
} from "../src/services/readerProgress";
import { generateReaderHtml } from "../src/services/readerHtmlGenerator";
import { DEFAULT_READER_SETTINGS } from "../src/types/novel";
import {
  calculateSliderValue,
  getLibraryProgressPercentage,
  getNextChapterListPage,
  hasNovelMetadataUpdate,
  isSameLocalCalendarDay,
  normalizeBackgroundCursor,
  shouldRefreshChapterList,
} from "../src/services/runtimeGuards";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`PASS: ${label}`);
    return;
  }
  console.error(
    `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
  failed += 1;
}

check(
  "first paragraph indentation",
  formatNovelText("abc12"),
  '　ａｂｃ<span class="tcy">１２</span>',
);
check(
  "leading blank lines removed without losing indentation",
  formatNovelText("\n\n本文"),
  "　本文",
);
check(
  "ruby conversion",
  rubyTextToHtml("|漢字《かんじ》"),
  "<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>",
);
check(
  "hidden image placeholder",
  formatNovelText('<img src="https://example.com/a.jpg">').includes(
    'class="image-link"',
  ),
  true,
);
check(
  "visible image",
  formatNovelText('<img src="https://example.com/a.jpg">', {
    showImages: true,
  }).includes('class="image-page"'),
  true,
);
check(
  "Hameln current author markup",
  extractHamelnAuthor(
    '作：<span itemprop="author"><a href="/user/1/">tanuu</a></span>',
  ),
  "tanuu",
);
check(
  "Hameln legacy author markup",
  extractHamelnAuthor("作者：<a href=\"/user/1/\">旧作者</a><br>"),
  "旧作者",
);

const adapterCases = [
  ["https://ncode.syosetu.com/n6316bn/", "syosetu"],
  ["https://novel18.syosetu.com/n0381mn/", "nocturne"],
  ["https://kakuyomu.jp/works/2912051603474311296", "kakuyomu"],
  ["https://syosetu.org/novel/409137/", "hameln"],
] as const;

for (const [url, expected] of adapterCases) {
  check(`adapter routing ${expected}`, getAdapterForUrl(url)?.siteType, expected);
}
check("adapter registry size", getAllAdapters().length, 4);
check(
  "adapter routing rejects a lookalike host",
  getAdapterForUrl("https://kakuyomu.jp.example.com/works/2912051603474311296"),
  undefined,
);
check(
  "adapter routing rejects credentials in a URL",
  getAdapterForUrl("https://user:password@ncode.syosetu.com/n6316bn/"),
  undefined,
);
check(
  "Nocturne exact-page 404 ends a populated chapter list",
  isExpectedChapterListEndStatus(404, 3, 200),
  true,
);
check(
  "Nocturne first-page 404 remains an error",
  isExpectedChapterListEndStatus(404, 1, 0),
  false,
);
check(
  "Nocturne server error remains an error",
  isExpectedChapterListEndStatus(500, 3, 200),
  false,
);
check(
  "SQLite UTC timestamp is parsed as UTC",
  parseReadingTimestampMs("2026-07-29 05:00:00"),
  Date.parse("2026-07-29T05:00:00Z"),
);
check(
  "older cloud progress cannot overwrite newer local progress",
  isRemoteReadingProgressNewer(
    "2026-07-29 05:00:00",
    "2026-07-29T04:59:59.000Z",
  ),
  false,
);
check(
  "newer cloud progress can update local progress",
  isRemoteReadingProgressNewer(
    "2026-07-29 05:00:00",
    "2026-07-29T05:00:01.000Z",
  ),
  true,
);
check("reader entry defaults missing progress", normalizeReaderChapterIndex(undefined), 1);
check("reader entry rejects NaN progress", normalizeReaderChapterIndex(Number.NaN), 1);
check("reader entry rejects zero progress", normalizeReaderChapterIndex(0), 1);
check("reader entry accepts numeric cloud progress", normalizeReaderChapterIndex("134"), 134);
check("reader entry floors fractional progress", normalizeReaderChapterIndex(12.9), 12);
check("reader entry clamps stale chapter to available range", normalizeReaderChapterIndex(195, 194), 194);
check("reader prefetch selects the next chapter", getNextChapterIndexToPrefetch(4, 8), 5);
check("reader prefetch stops at the final chapter", getNextChapterIndexToPrefetch(8, 8), null);
check("reader prefetch rejects an invalid chapter", getNextChapterIndexToPrefetch(0, 8), null);
check(
  "reader prefetch key separates site types",
  createChapterReadKey("syosetu", "n1234ab", 2) ===
    createChapterReadKey("nocturne", "n1234ab", 2),
  false,
);
let chapterReadCalls = 0;
const pendingChapterRead = new Promise<string>(() => {});
const firstChapterRead = runChapterReadSingleFlight("prefetch-test", () => {
  chapterReadCalls += 1;
  return pendingChapterRead;
});
const secondChapterRead = runChapterReadSingleFlight("prefetch-test", () => {
  chapterReadCalls += 1;
  return pendingChapterRead;
});
check("reader prefetch shares an in-flight chapter read", firstChapterRead === secondChapterRead, true);
check("reader prefetch starts one chapter read", chapterReadCalls, 1);
check(
  "reader left flick advances a page",
  getReaderFlickDirection(-80, 6, 180, false),
  "next",
);
check(
  "reader right flick returns a page",
  getReaderFlickDirection(80, 6, 180, false),
  "previous",
);
check(
  "reader flick follows reversed page direction",
  getReaderFlickDirection(-80, 6, 180, true),
  "previous",
);
check(
  "reader ignores a mostly vertical flick",
  getReaderFlickDirection(-60, 80, 180, false),
  null,
);
check(
  "reader ignores a short drag",
  getReaderFlickDirection(-30, 2, 180, false),
  null,
);
check(
  "reader ignores a slow horizontal drag",
  getReaderFlickDirection(-80, 2, 900, false),
  null,
);
check(
  "reader volume down advances a page",
  getVolumeButtonPageDirection("volumeDown"),
  "next",
);
check(
  "reader volume up returns a page",
  getVolumeButtonPageDirection("volumeUp"),
  "previous",
);
check("settings slider uses measured width", calculateSliderValue(10, 100, 200, 10, 30, 1), 20);
check("settings slider stays stable before layout", calculateSliderValue(18, 100, 0, 10, 30, 1), 18);
check("library progress rejects zero total", getLibraryProgressPercentage(1, 0), null);
check("library progress is clamped", getLibraryProgressPercentage(12, 10), 100);
check(
  "missing remote timestamp is not a false update",
  hasNovelMetadataUpdate(
    { totalEpisodes: 10, isComplete: false, siteUpdatedAt: "2026-08-08T01:00:00.000Z" },
    { totalEpisodes: 10, isComplete: false, lastUpdatedAt: null },
  ),
  false,
);
check(
  "equivalent timestamps are not a false update",
  hasNovelMetadataUpdate(
    { totalEpisodes: 10, isComplete: false, siteUpdatedAt: "2026-08-08T01:00:00.000Z" },
    { totalEpisodes: 10, isComplete: false, lastUpdatedAt: "2026-08-08T10:00:00+09:00" },
  ),
  false,
);
const localNow = new Date(2026, 7, 8, 4, 0, 0);
check(
  "background timestamp uses local calendar day",
  isSameLocalCalendarDay(new Date(2026, 7, 8, 0, 30, 0).toISOString(), localNow),
  true,
);
check(
  "fresh complete chapter list skips refresh",
  shouldRefreshChapterList(10, 10, "2026-08-08T01:00:00.000Z", Date.parse("2026-08-08T01:03:00.000Z")),
  false,
);
check("background cursor wraps", normalizeBackgroundCursor("5", 3), 2);
check("background cursor rejects invalid state", normalizeBackgroundCursor("bad", 3), 0);
check("latest chapter page crosses exact boundary", getNextChapterListPage(100), 2);
check("reader progress clamps below zero", normalizeReaderProgress(-0.2), 0);
check("reader progress clamps above one", normalizeReaderProgress(1.2), 1);
check(
  "reader accepts page info while interactive",
  shouldProcessReaderPageInfo("active"),
  true,
);
check(
  "reader rejects transient page info while screen is off",
  shouldProcessReaderPageInfo("background"),
  false,
);
check(
  "reader rejects transient page info while becoming inactive",
  shouldProcessReaderPageInfo("inactive"),
  false,
);

const chapter134Progress = createReaderProgressSnapshot(7, 134, 0.456789, 57);
check(
  "progress snapshot belongs to its source chapter",
  isReaderProgressForChapter(chapter134Progress, 7, 134),
  true,
);
check(
  "progress snapshot cannot be saved under the next chapter",
  isReaderProgressForChapter(chapter134Progress, 7, 135),
  false,
);
check(
  "progress snapshot preserves full precision",
  chapter134Progress?.progress,
  0.456789,
);

const readerHtml = generateReaderHtml({
  chapterText: "first paragraph\n\nsecond paragraph",
  settings: DEFAULT_READER_SETTINGS,
  containerLayout: { width: 360, height: 720 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  readerTheme: { bg: "#fff", fg: "#000", selection: "transparent" },
  documentId: "7:134:0:0:360x720",
  startAtLastPage: false,
  initialProgress: 0.3425,
  initialPositionAnchor: {
    blockIndex: 1,
    characterOffset: 4,
    contextHash: "abc123",
  },
  rubyTextToHtml: (text) => text,
});
check(
  "reader document messages carry their generation id",
  readerHtml.includes('var documentId = "7:134:0:0:360x720"'),
  true,
);
check(
  "reader HTML keeps exact progress",
  readerHtml.includes("progress: lastKnownProgress"),
  true,
);
check(
  "reader HTML preserves progress across reflow",
  readerHtml.includes("repaginatePreservingProgress"),
  true,
);
check(
  "reader HTML exposes native page turns",
  readerHtml.includes("window.__tadayomuTurnPage"),
  true,
);
check(
  "reader HTML handles horizontal flicks",
  readerHtml.includes("var isHorizontalFlick"),
  true,
);
check(
  "reader HTML assigns stable content blocks",
  readerHtml.includes('data-reader-block="1"'),
  true,
);
check(
  "reader HTML restores a content anchor before percentage fallback",
  readerHtml.includes('restorePosition(initialPositionAnchor'),
  true,
);
check(
  "reader resumes the exact page when pagination is unchanged",
  readerHtml.includes("resumeTotalPages === totalPages") &&
    readerHtml.includes("goToPage(resumePage - 1, progress, 'resume-page')"),
  true,
);
const readerScript = readerHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
let readerScriptParses = true;
try {
  new Function(readerScript);
} catch {
  readerScriptParses = false;
}
check("generated reader script parses", readerScriptParses, true);
check(
  "reader saves a stable anchor after page animation",
  readerHtml.includes("stablePageInfoTimer = setTimeout"),
  true,
);
check(
  "reader identifies the exact anchor restored",
  readerHtml.includes("restoredAnchorHash: lastRestoredAnchorHash"),
  true,
);
check(
  "valid reader content anchor is accepted",
  JSON.stringify(normalizeReaderPositionAnchor({
    blockIndex: 3,
    characterOffset: 12,
    contextHash: "feedbeef",
  })),
  JSON.stringify({ blockIndex: 3, characterOffset: 12, contextHash: "feedbeef" }),
);
check(
  "invalid reader content anchor is rejected",
  normalizeReaderPositionAnchor({ blockIndex: -1, characterOffset: 0, contextHash: "x" }),
  null,
);

process.exit(failed > 0 ? 1 : 0);
