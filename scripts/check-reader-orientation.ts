import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_READER_SETTINGS } from '../src/types/novel';
import { generateReaderHtml } from '../src/services/readerHtmlGenerator';

const config = JSON.parse(readFileSync('app.json', 'utf8'));
assert.equal(config.expo.orientation, 'default', 'the Android activity must be allowed to rotate');

const settings = { ...DEFAULT_READER_SETTINGS, writingMode: 'vertical' as const };
function checkLayout(width: number, height: number, leftInset: number, rightInset: number) {
  const insets = { top: 24, right: rightInset, bottom: 24, left: leftInset };
  const html = generateReaderHtml({
    chapterText: '縦書き本文。'.repeat(500),
    settings,
    containerLayout: { width, height },
    insets,
    readerTheme: { bg: '#fff', fg: '#000', selection: '#ddd' },
    documentId: `orientation-${width}x${height}`,
    startAtLastPage: false,
    rubyTextToHtml: (text) => text,
  });
  const readerWidth = Number(html.match(/#reader\s*\{[^}]*?width: (\d+)px/s)?.[1]);
  const linePitch = settings.fontSize * settings.lineHeight;
  const availableWidth = width - settings.margin * 2 - insets.left - insets.right;
  const expectedWidth = Math.floor(availableWidth / linePitch) * linePitch;

  assert.equal(readerWidth, expectedWidth, `reader width at ${width}x${height}`);
  assert.match(html, new RegExp(`--fontSize: ${settings.fontSize}px`));
  assert.match(html, new RegExp(`--lineHeight: ${settings.lineHeight};`));
  assert.match(html, /pageStepPx = viewportW;/);
  assert.match(html, /window\.addEventListener\('resize', function\(\) \{\s*repaginatePreservingProgress\(\);/);
  assert.match(html, /restorePosition\(anchorBeforeReflow, progressBeforeReflow\);/);
  return readerWidth;
}

const portraitWidth = checkLayout(800, 1280, 0, 0);
const landscapeWidth = checkLayout(1280, 800, 24, 24);
assert.ok(landscapeWidth > portraitWidth, 'landscape must fit more vertical text columns');
assert.ok(landscapeWidth > 0.9 * 1280, 'landscape must use nearly the full screen width');
console.log(`PASS: portrait ${portraitWidth}px, landscape ${landscapeWidth}px, unchanged font and line pitch`);
