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
  createReaderProgressSnapshot,
  isReaderProgressForChapter,
  normalizeReaderProgress,
  normalizeReaderPositionAnchor,
} from "../src/services/readerProgress";
import { generateReaderHtml } from "../src/services/readerHtmlGenerator";
import { DEFAULT_READER_SETTINGS } from "../src/types/novel";

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
check("reader progress clamps below zero", normalizeReaderProgress(-0.2), 0);
check("reader progress clamps above one", normalizeReaderProgress(1.2), 1);

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
  "reader HTML assigns stable content blocks",
  readerHtml.includes('data-reader-block="1"'),
  true,
);
check(
  "reader HTML restores a content anchor before percentage fallback",
  readerHtml.includes('restorePosition(initialPositionAnchor'),
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
