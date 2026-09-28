/** Manual network smoke test for the four supported import adapters. */
import assert from 'node:assert/strict';
import { getAdapterForUrl } from '../src/services/siteAdapter';

const urls = [
  'https://ncode.syosetu.com/n6316bn/',
  'https://novel18.syosetu.com/n0381mn/',
  'https://kakuyomu.jp/works/2912051603474311296',
  'https://syosetu.org/novel/409137/',
];

async function main(): Promise<void> {
for (const url of urls) {
  const adapter = getAdapterForUrl(url);
  assert.ok(adapter, `adapter for ${url}`);
  if (process.argv[2] && adapter.siteType !== process.argv[2]) continue;
  const id = adapter.extractNovelId(url);
  assert.ok(id, `novel ID for ${url}`);
  const info = await adapter.getNovelInfo(id);
  const chapters = await adapter.getChapterList(id);
  assert.equal(info.siteNovelId, id);
  assert.equal(info.siteType, adapter.siteType);
  assert.ok(info.title.trim(), `title for ${url}`);
  assert.ok(chapters.length > 0, `chapters for ${url}`);
  assert.equal(new Set(chapters.map(chapter => chapter.index)).size, chapters.length);
  assert.ok(chapters.every(chapter => chapter.title.trim() && chapter.url));
  console.log(`PASS: ${adapter.siteType} import metadata and ${chapters.length} chapters`);
  try {
    const first = await adapter.getChapterContent(id, chapters[0].url);
    assert.ok(first.bodyText.trim(), `chapter text for ${url}`);
    console.log(`PASS: ${adapter.siteType} first chapter text ${first.bodyText.length} chars`);
  } catch (error) {
    if (adapter.siteType !== 'hameln' || !String(error).includes('HTTP 403')) throw error;
    console.warn('BLOCKED: hameln chapter text returned HTTP 403; import metadata succeeded');
  }
}
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
