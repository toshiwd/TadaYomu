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
import { createPrivacySafeCrashRecord } from "../src/services/crashPrivacy";
import {
  normalizeReaderChapterIndex,
  resolveReaderChapterList,
  resolveReaderNextChapter,
} from "../src/services/readerEntry";
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
check("reader entry defaults null progress", normalizeReaderChapterIndex(null), 1);
check("reader entry rejects NaN progress", normalizeReaderChapterIndex(Number.NaN), 1);
check("reader entry rejects zero progress", normalizeReaderChapterIndex(0), 1);
check("reader entry rejects negative progress", normalizeReaderChapterIndex(-10), 1);
check("reader entry accepts numeric cloud progress", normalizeReaderChapterIndex("134"), 134);
check("reader entry floors fractional progress", normalizeReaderChapterIndex(12.9), 12);
check("reader entry keeps an in-range chapter", normalizeReaderChapterIndex(54, 61), 54);
check("reader entry clamps a chapter above total", normalizeReaderChapterIndex(100, 61), 61);
check("reader entry keeps the final chapter", normalizeReaderChapterIndex(61, 61), 61);
const shrunkChapterList = resolveReaderChapterList(54, 53);
check("reader entry accepts a non-empty refreshed list", shrunkChapterList.kind, "ready");
check(
  "reader entry clamps after a refreshed list shrinks",
  shrunkChapterList.kind === "ready" ? shrunkChapterList.chapterIndex : null,
  53,
);
check(
  "reader entry rejects an empty refreshed list",
  resolveReaderChapterList(1, 0).kind,
  "empty",
);
check(
  "reader boundary advances when a new chapter appears",
  JSON.stringify(resolveReaderNextChapter(53, 54)),
  JSON.stringify({ kind: "advance", chapterIndex: 54, totalChapters: 54 }),
);
check(
  "reader boundary stays put at the latest chapter",
  JSON.stringify(resolveReaderNextChapter(53, 53)),
  JSON.stringify({ kind: "latest", totalChapters: 53 }),
);
check(
  "reader boundary does not move backwards on a temporarily shorter list",
  JSON.stringify(resolveReaderNextChapter(53, 52)),
  JSON.stringify({ kind: "latest", totalChapters: 53 }),
);
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

check(
  "settings slider uses the measured width",
  calculateSliderValue(10, 100, 200, 10, 30, 1),
  20,
);
check(
  "settings slider keeps its value before layout",
  calculateSliderValue(18, 100, 0, 10, 30, 1),
  18,
);
check(
  "library progress rejects a zero episode count",
  getLibraryProgressPercentage(1, 0),
  null,
);
check(
  "library progress is clamped",
  getLibraryProgressPercentage(12, 10),
  100,
);

const localNovelMetadata = {
  totalEpisodes: 10,
  isComplete: false,
  siteUpdatedAt: "2026-08-08T01:00:00.000Z",
};
check(
  "missing remote timestamp does not create a false update",
  hasNovelMetadataUpdate(localNovelMetadata, {
    totalEpisodes: 10,
    isComplete: false,
    lastUpdatedAt: null,
  }),
  false,
);
check(
  "equivalent timestamp formats do not create a false update",
  hasNovelMetadataUpdate(localNovelMetadata, {
    totalEpisodes: 10,
    isComplete: false,
    lastUpdatedAt: "2026-08-08T10:00:00+09:00",
  }),
  false,
);
check(
  "new episode count is detected",
  hasNovelMetadataUpdate(localNovelMetadata, {
    totalEpisodes: 11,
    isComplete: false,
    lastUpdatedAt: null,
  }),
  true,
);

const localNow = new Date(2026, 7, 8, 4, 0, 0);
check(
  "background UTC timestamp is compared as a local calendar day",
  isSameLocalCalendarDay(new Date(2026, 7, 8, 0, 30, 0).toISOString(), localNow),
  true,
);
check(
  "background previous local day remains pending",
  isSameLocalCalendarDay(new Date(2026, 7, 7, 23, 59, 0).toISOString(), localNow),
  false,
);
check(
  "chapter list refresh is skipped while metadata is fresh",
  shouldRefreshChapterList(
    10,
    10,
    "2026-08-08T01:00:00.000Z",
    Date.parse("2026-08-08T01:03:00.000Z"),
  ),
  false,
);
check(
  "chapter list refresh runs when local chapters are missing",
  shouldRefreshChapterList(
    9,
    10,
    "2026-08-08T01:00:00.000Z",
    Date.parse("2026-08-08T01:01:00.000Z"),
  ),
  true,
);
check("background cursor wraps across novels", normalizeBackgroundCursor("5", 3), 2);
check("background cursor rejects invalid state", normalizeBackgroundCursor("bad", 3), 0);
check("background cursor handles an empty library", normalizeBackgroundCursor("2", 0), 0);
check("latest chapter probe stays on page one before boundary", getNextChapterListPage(99), 1);
check("latest chapter probe crosses exact page boundary", getNextChapterListPage(100), 2);
check("latest chapter probe stays on current partial page", getNextChapterListPage(199), 2);

const sensitiveError = new Error(
  "HTTP 403 https://example.com/work/secret?token=abc user@example.com C:\\private\\chapter.txt",
);
sensitiveError.stack = [
  sensitiveError.message,
  "    at loadWork (https://example.com/work/secret?token=abc:10:2)",
  "    at readFile (C:\\private\\chapter.txt:20:4)",
  "    at localFile (file:///data/user/0/com.enish.tadayomu/files/novels/secret.txt:30:6)",
].join("\n");
const safeCrash = createPrivacySafeCrashRecord(
  sensitiveError,
  {
    feature: "reader_webview",
    operationType: "render_process_exit",
    errorCategory: "webview_renderer_crash",
    screenName: "reader",
    internalWorkId: 123,
    didCrash: true,
    retryCount: 2,
  },
  "1.3.65",
  "23",
  "foreground",
);
const serializedCrash = JSON.stringify({
  attributes: safeCrash.attributes,
  message: safeCrash.error.message,
  stack: safeCrash.error.stack,
});

for (const forbidden of [
  "example.com",
  "secret",
  "user@example.com",
  "C:\\private",
  "/data/user",
  "token=abc",
]) {
  check(`Crashlytics privacy redacts ${forbidden}`, serializedCrash.includes(forbidden), false);
}
check(
  "Crashlytics privacy keeps technical status",
  safeCrash.attributes.technical_status_code,
  "403",
);
check(
  "Crashlytics privacy keeps internal work ID",
  safeCrash.attributes.internal_work_id,
  "123",
);
check(
  "Crashlytics privacy keeps renderer category",
  safeCrash.attributes.error_category,
  "webview_renderer_crash",
);

process.exit(failed > 0 ? 1 : 0);
