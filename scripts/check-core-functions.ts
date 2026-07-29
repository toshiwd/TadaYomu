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

process.exit(failed > 0 ? 1 : 0);
