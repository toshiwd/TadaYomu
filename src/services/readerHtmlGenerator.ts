import type { ReaderSettings } from '../types/novel';
import {
  READER_FLICK_AXIS_RATIO,
  READER_FLICK_MAX_DURATION_MS,
  READER_FLICK_MIN_DISTANCE_PX,
} from './readerInput';
import type { ReaderPositionAnchor } from './readerProgress';

export interface GenerateHtmlParams {
  chapterText: string;
  settings: ReaderSettings;
  containerLayout: { width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
  readerTheme: { bg: string; fg: string; selection: string };
  documentId: string;
  startAtLastPage: boolean;
  initialProgress?: number;
  initialPositionAnchor?: ReaderPositionAnchor | null;
  rubyTextToHtml: (text: string) => string;
}

/**
 * HTML生成ロジックをカプセル化し、WebViewに渡す文字列を構築する。
 * UIコンポーネント(ReaderScreen)から分離させることで、デザイン変更時のAIのコンテキストを削減する。
 */
export function generateReaderHtml({
  chapterText,
  settings,
  containerLayout,
  insets,
  readerTheme,
  documentId,
  startAtLastPage,
  initialProgress,
  initialPositionAnchor,
  rubyTextToHtml,
}: GenerateHtmlParams): string {
  const isVertical = settings.writingMode === 'vertical';

  // Dynamically swap image link tags and actual image tags based on the settings
  let chapterContentWithImages = chapterText;
  if (settings.showImages) {
    // If showImages is true, restore any `<span class="image-link">` placeholders to `<div class="image-page"><img /></div>`
    chapterContentWithImages = chapterContentWithImages.replace(
      /<span\s+class=["']image-link["']\s+data-src=["']([^"']+)["'][^>]*>.*?<\/span>/gi,
      '\n<div class="image-page"><img src="$1" /></div>\n'
    );
  } else {
    // If showImages is false, convert any existing `<div class="image-page"><img /></div>` to `<span class="image-link">`
    chapterContentWithImages = chapterContentWithImages.replace(
      /<div\s+class=["']image-page["']>\s*<img\s+src=["']([^"']+)["'][^>]*\/>\s*<\/div>/gi,
      '<span class="image-link" data-src="$1">[画像あり: タップして表示]</span>'
    );
  }

  const processedText = rubyTextToHtml(chapterContentWithImages);
  const hasContent = processedText.trim().length > 0;

  // Google Fonts CDN
  const fontLink = settings.fontFamily === 'serif'
    ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">'
    : '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">';

  // Paragraph builder
  const contentHtml = hasContent ? (() => {
    const lines = processedText.split('\n');
    const paragraphs: string[] = [];
    let currentLines: string[] = [];
    const nextNonBlankLine: (string | undefined)[] = new Array(lines.length);
    let nextContent: string | undefined;
    for (let i = lines.length - 1; i >= 0; i--) {
      nextNonBlankLine[i] = nextContent;
      if (lines[i].trim()) nextContent = lines[i];
    }
    let previousContent: string | undefined;
    const isDialogue = (str: string) => /^[「『（]/.test(str.trim());
    const toDisplayLine = (str: string) => isVertical ? str.replace(/^[\s　]+/, '') : str;
    const flushCurrent = () => {
      if (currentLines.length > 0) {
        paragraphs.push(`<p>${currentLines.join('<br>')}</p>`);
        currentLines = [];
      }
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        flushCurrent();
        const followingContent = nextNonBlankLine[i];
        if ((previousContent && isDialogue(previousContent)) || (followingContent && isDialogue(followingContent))) {
          paragraphs.push('<p class="blank">&nbsp;</p>');
        }
      } else if (line.indexOf('<div class="image-page">') !== -1) {
        flushCurrent();
        paragraphs.push(line);
        previousContent = line;
      } else {
        currentLines.push(toDisplayLine(line));
        previousContent = line;
      }
    }
    flushCurrent();
    return paragraphs.map((paragraph, blockIndex) =>
      paragraph.replace(/^<(p|div)/, `<$1 data-reader-block="${blockIndex}"`)
    ).join('\n');
  })() : '<div style="display:flex;justify-content:center;align-items:center;height:60vh;opacity:0.5;font-size:16px;"><p>テキストが見つかりませんでした。<br>小説を削除して再ダウンロードしてください。</p></div>';

  // Geometry
  const viewW = containerLayout.width;
  const viewH = containerLayout.height;

  // CSS custom property initial values from settings
  const marginLR = settings.margin;
  const marginT = settings.marginTop;
  const marginB = settings.marginBottom;
  const fontSize = settings.fontSize;
  const lineHeight = settings.lineHeight;
  const paragraphSpacing = settings.paragraphSpacing;

  // Content dimensions
  const availW = Math.floor(viewW - marginLR * 2 - insets.left - insets.right);
  const contentH = Math.floor(viewH - marginT - marginB);

  let contentW = availW;
  let extraMarginLeft = 0;

  if (isVertical) {
    const lhNum = parseFloat(String(settings.lineHeight)) || 1.8;
    const physicalLineWidth = settings.fontSize * lhNum;
    const numLines = Math.floor(contentW / physicalLineWidth);

    if (numLines > 0) {
      const newW = numLines * physicalLineWidth;
      extraMarginLeft = Math.floor((contentW - newW) / 2);
      contentW = newW;
    }
  }

  let fontFamilyCSS = settings.fontFamily === 'sans-serif'
    ? '"Noto Sans JP", "游ゴシック", "YuGothic", "ヒラギノ角ゴ ProN", sans-serif'
    : '"Noto Serif JP", "游明朝", "YuMincho", "ヒラギノ明朝 ProN", serif';

  const initProg = typeof initialProgress === 'number' ? initialProgress : 0;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
${fontLink}
<style>
  :root {
    --fontSize: ${fontSize}px;
    --lineHeight: ${lineHeight};
    --marginLR: ${marginLR}px;
    --marginT: ${marginT}px;
    --marginB: ${marginB}px;
    --paragraphSpacing: ${paragraphSpacing};
    --insetLeft: ${insets.left}px;
    --insetRight: ${insets.right}px;
    --viewW: ${viewW}px;
    --viewH: ${viewH}px;
    --fontFamily: ${fontFamilyCSS};
    --fg: ${readerTheme.fg};
    --bg: ${readerTheme.bg};
    --selection: ${readerTheme.selection};
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html { width: var(--viewW); height: var(--viewH); overflow: hidden; background: var(--bg); }
  body {
    width: var(--viewW); height: var(--viewH); overflow: hidden; background: var(--bg);
    -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%;
    touch-action: none; -webkit-user-select: text; user-select: text;
  }
  ::selection { background: var(--selection); }

  ${isVertical ? `
  /* Vertical mode: viewport + content wrapper pattern */
  #reader {
    position: absolute; top: var(--marginT); left: calc(var(--marginLR) + var(--insetLeft) + ${extraMarginLeft}px);
    width: ${contentW}px; height: ${contentH}px; overflow: hidden; background: var(--bg);
  }
  #content {
    writing-mode: vertical-rl; direction: ltr; text-orientation: mixed; text-align: start;
    height: ${contentH}px; width: max-content; float: right;
    color: var(--fg); font-family: var(--fontFamily); font-size: var(--fontSize); line-height: var(--lineHeight);
    word-break: keep-all; overflow-wrap: break-word; line-break: strict;
    -webkit-font-smoothing: antialiased; padding: 0;
    will-change: transform; transition: transform 0.0s linear;
  }
  ` : `
  /* Horizontal mode: CSS multi-column layout */
  #reader {
    position: absolute; top: var(--marginT); left: calc(var(--marginLR) + var(--insetLeft) + ${extraMarginLeft}px);
    height: ${contentH}px; color: var(--fg); font-family: var(--fontFamily); font-size: var(--fontSize); line-height: var(--lineHeight);
    word-break: keep-all; overflow-wrap: break-word; line-break: strict;
    -webkit-font-smoothing: antialiased; padding: 0; box-sizing: content-box; -ms-overflow-style: none;
    writing-mode: horizontal-tb;
    column-width: calc(var(--viewW) - var(--marginLR) * 2 - var(--insetLeft) - var(--insetRight));
    column-gap: calc(var(--marginLR) * 2 + var(--insetLeft) + var(--insetRight));
    column-fill: auto; overflow-x: scroll; overflow-y: hidden;
  }
  `}
  #reader::-webkit-scrollbar { display: none; }

  ${isVertical ? '#content' : '#reader'} p {
    margin: 0;
    ${isVertical
      ? `text-indent: 0; padding-top: 1em; margin-left: calc(0.6em * var(--paragraphSpacing));`
      : `text-indent: 1em; margin-bottom: calc(1.0em * var(--paragraphSpacing));`}
  }
  ${isVertical ? '#content' : '#reader'} p:first-child { ${isVertical ? 'margin-right: 0;' : 'margin-top: 0;'} }
  p.blank { ${isVertical ? `padding-top: 0; min-width: 1em;` : `min-height: calc(0.3em * var(--paragraphSpacing)); margin-bottom: calc(0.5em * var(--paragraphSpacing));`} }
  
  /* Ruby spacing */
  ruby { ruby-align: center; ruby-position: over; }
  rt { font-size: 0.5em; color: var(--fg); opacity: 0.7; padding-right: 0.1em; padding-left: 0.1em; }
  
  .emphasis { text-emphasis: filled sesame; -webkit-text-emphasis: filled sesame; font-style: normal; }
  .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; font-family: "Helvetica Neue", Arial, sans-serif; }
  .image-link { font-size: 0.9em; font-weight: bold; color: currentColor; text-decoration: underline; text-decoration-color: currentColor; padding: 0.2em 0.5em; border: 1px solid currentColor; border-radius: 4px; display: inline-block; background: transparent; margin: 0.2em; }
  
  /* Image Layout fixes for 1 page = 1 image */
  .image-page { 
    ${isVertical
      ? `width: ${contentW}px; height: ${contentH}px; display: flex; justify-content: center; align-items: center;`
      : `break-before: column; break-after: column; height: ${contentH}px; display: flex; justify-content: center; align-items: center;`}
    margin: 0; padding: 0; text-indent: 0; overflow: hidden;
  }
  .image-page img { max-width: 100%; max-height: 100%; object-fit: contain; }
  
  #tap-zone { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 100; }
</style>
</head>
<body>
<div id="reader">
  ${isVertical ? `<div id="content">${contentHtml}</div><div id="page-mask" style="position: absolute; top: 0; left: 0; bottom: 0; background: var(--bg); z-index: 50; width: 0px;"></div>` : contentHtml}
</div>
<script>
(function() {
  var reader = document.getElementById('reader');
  var content = document.getElementById('content');
  var documentId = ${JSON.stringify(documentId)};
  var isVertical = ${isVertical};
  var reverseDirection = ${settings.reversePageDirection ? 'true' : 'false'};
  var pageTurnAnimation = ${settings.pageTurnAnimation ? 'true' : 'false'};
  var pageStepPx = 0;
  var containerW = 0;
  var containerH = 0;
  var startAtLast = ${startAtLastPage};
  var currentPage = 0;
  var totalPages = 1;
  var currentVisualOffset = 0;
  var stablePageInfoTimer = null;
  var lastKnownProgress = ${Math.max(0, Math.min(initialProgress ?? 0, 1))};
  var initialPositionAnchor = ${JSON.stringify(initialPositionAnchor ?? null)};
  var lastRestoreSource = 'initial';
  var lastRestoredAnchorHash = null;

  function postToNative(payload) {
    payload.documentId = documentId;
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function log(msg) { postToNative({ type: 'log', message: msg }); }

  var pageBoundaries = [0];

  function updateMaskForOffset(offset, useTransition) {
    var mask = document.getElementById('page-mask');
    if (!mask) return;
    if (useTransition) {
      mask.style.transition = 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    } else {
      mask.style.transition = 'none';
    }
    var mw = 0;
    var nextB = null;
    for (var k = 1; k < pageBoundaries.length; k++) {
      if (pageBoundaries[k] > offset + 0.5) { nextB = pageBoundaries[k]; break; }
    }
    if (nextB !== null && nextB < offset + pageStepPx - 0.5) {
      mw = (offset + pageStepPx) - nextB + 1;
    }
    mask.style.width = (mw > 0 ? mw : 0) + 'px';
  }

  function recalcGeometry() {
    if (isVertical && content) {
      var viewportW = reader.clientWidth;
      pageStepPx = viewportW;
      var paragraphs = content.querySelectorAll('p');
      var totalW = content.scrollWidth;
      if (paragraphs.length === 0 || totalW <= viewportW) {
        pageBoundaries = [0]; totalPages = 1; return;
      }
      var contentRect = content.getBoundingClientRect();
      var paraStarts = [];
      for (var i = 0; i < paragraphs.length; i++) {
        var rect = paragraphs[i].getBoundingClientRect();
        paraStarts.push(contentRect.right - rect.right);
      }
      paraStarts.push(totalW);
      paraStarts.sort(function(a, b) { return a - b; });
      var unique = [paraStarts[0]];
      for (var i = 1; i < paraStarts.length; i++) {
        if (Math.abs(paraStarts[i] - unique[unique.length - 1]) > 1) { unique.push(paraStarts[i]); }
      }
      paraStarts = unique;
      
      pageBoundaries = [0];
      var cursor = 0;
      while (cursor + viewportW < totalW) {
        var target = cursor + viewportW;
        var low = 0;
        var high = paraStarts.length - 1;
        var bestIdx = 0;
        while (low <= high) {
          var middle = Math.floor((low + high) / 2);
          if (paraStarts[middle] <= target + 0.5) {
            bestIdx = middle;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
        var nextStart = paraStarts[bestIdx];
        if (nextStart <= cursor + 0.5) nextStart = cursor + viewportW;
        if (nextStart >= totalW) break;
        pageBoundaries.push(nextStart);
        cursor = nextStart;
      }
      totalPages = pageBoundaries.length;
    } else {
      var cs = getComputedStyle(reader);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var colGapVal = parseFloat(cs.columnGap) || 0;
      pageStepPx = (reader.clientWidth - padL - padR) + colGapVal;
    }
    containerW = parseFloat(document.documentElement.style.getPropertyValue('--viewW')) || ${viewW};
    containerH = parseFloat(document.documentElement.style.getPropertyValue('--viewH')) || ${viewH};
  }

  function calcPages() {
    if (!isVertical || !content) {
      var sw = reader.scrollWidth;
      if (pageStepPx <= 0) { totalPages = 1; return; }
      var maxOff = Math.max(0, sw - pageStepPx);
      totalPages = Math.ceil(maxOff / pageStepPx) + 1;
      if (totalPages < 1) totalPages = 1;
    }
  }

  function goToPage(page, progressHint, restoreSource) {
    page = Math.max(0, Math.min(page, totalPages - 1));
    currentPage = page;
    if (isVertical && content) {
      var offset = pageBoundaries[page] || 0;
      currentVisualOffset = offset;
      updateMaskForOffset(offset, pageTurnAnimation);
      content.style.transition = pageTurnAnimation
        ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        : 'none';
      content.style.transform = 'translateX(' + offset + 'px)';
    } else {
      var maxOff = Math.max(0, reader.scrollWidth - pageStepPx);
      var offset = Math.min(page * pageStepPx, maxOff);
      if (pageTurnAnimation && reader.scrollTo) {
        reader.scrollTo({ left: offset, top: 0, behavior: 'smooth' });
      } else {
        reader.scrollLeft = offset;
      }
    }
    if (typeof progressHint === 'number' && Number.isFinite(progressHint)) {
      lastKnownProgress = Math.max(0, Math.min(progressHint, 1));
    } else if (totalPages > 1) {
      lastKnownProgress = currentPage / (totalPages - 1);
    }
    lastRestoreSource = restoreSource || 'navigation';
    if (lastRestoreSource !== 'anchor') lastRestoredAnchorHash = null;
    sendPageInfo();
    if (stablePageInfoTimer) clearTimeout(stablePageInfoTimer);
    if (pageTurnAnimation) {
      stablePageInfoTimer = setTimeout(function() {
        stablePageInfoTimer = null;
        sendPageInfo();
      }, 450);
    }
  }

  function hashText(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function contextHashForBlock(block, characterOffset) {
    var text = block ? (block.textContent || '') : '';
    var offset = Math.max(0, Math.min(Number(characterOffset) || 0, text.length));
    return hashText(text.slice(Math.max(0, offset - 16), offset + 32));
  }

  function characterOffsetWithinBlock(block, node, nodeOffset) {
    if (node && node.nodeType !== Node.TEXT_NODE) {
      try {
        var elementRange = document.createRange();
        elementRange.selectNodeContents(block);
        elementRange.setEnd(node, nodeOffset);
        return elementRange.toString().length;
      } catch (error) {
        return 0;
      }
    }
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var offset = 0;
    var textNode = walker.nextNode();
    while (textNode) {
      if (textNode === node) {
        return offset + Math.max(0, Math.min(nodeOffset, textNode.nodeValue.length));
      }
      offset += textNode.nodeValue.length;
      textNode = walker.nextNode();
    }
    return 0;
  }

  function caretRangeAtPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      var range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  function capturePositionAnchor() {
    var rect = reader.getBoundingClientRect();
    var contentRect = isVertical && content ? content.getBoundingClientRect() : null;
    var targetOffset = isVertical
      ? (pageBoundaries[currentPage] || 0)
      : currentPage * pageStepPx;
    var bestAnchor = null;
    var bestScore = Number.POSITIVE_INFINITY;
    var blocks = reader.querySelectorAll('[data-reader-block]');

    function logicalOffsetForRange(range) {
      var rangeRect = range.getBoundingClientRect();
      return {
        offset: isVertical && contentRect
          ? contentRect.right - rangeRect.right
          : rangeRect.left - rect.left + reader.scrollLeft,
        crossOffset: Math.abs(rangeRect.top - rect.top),
        rect: rangeRect
      };
    }

    for (var blockCursor = 0; blockCursor < blocks.length; blockCursor++) {
      var block = blocks[blockCursor];
      var blockRect = block.getBoundingClientRect();
      var blockIsVisible =
        blockRect.right > rect.left && blockRect.left < rect.right &&
        blockRect.bottom > rect.top && blockRect.top < rect.bottom;
      if (!blockIsVisible) continue;
      var textLength = (block.textContent || '').length;
      if (textLength < 1) continue;
      var low = 0;
      var high = textLength - 1;
      while (low < high) {
        var middle = Math.floor((low + high) / 2);
        var middleRange = rangeAtCharacterOffset(block, middle);
        if (!middleRange) break;
        var middleOffset = logicalOffsetForRange(middleRange).offset;
        if (middleOffset + 1 < targetOffset) low = middle + 1;
        else high = middle;
      }
      var scanStart = Math.max(0, low - 512);
      var scanEnd = Math.min(textLength - 1, low + 512);
      for (var characterOffset = scanStart; characterOffset <= scanEnd; characterOffset++) {
        var range = rangeAtCharacterOffset(block, characterOffset);
        if (!range) continue;
        var measured = logicalOffsetForRange(range);
        var charRect = measured.rect;
        var isVisible =
          charRect.right > rect.left && charRect.left < rect.right &&
          charRect.bottom > rect.top && charRect.top < rect.bottom;
        var score;
        if (isVisible) {
          var primaryEdgeDistance = isVertical
            ? Math.abs(rect.right - charRect.right)
            : Math.abs(charRect.left - rect.left);
          score = primaryEdgeDistance * 1000 + measured.crossOffset;
        } else {
          var behindBoundaryPenalty = measured.offset + 1 < targetOffset ? pageStepPx * 4 : 0;
          score = 1000000 + behindBoundaryPenalty + Math.abs(measured.offset - targetOffset);
        }
        if (score >= bestScore) continue;
        var blockIndex = Number(block.getAttribute('data-reader-block'));
        if (!Number.isInteger(blockIndex)) continue;
        bestScore = score;
        bestAnchor = {
          blockIndex: blockIndex,
          characterOffset: characterOffset,
          contextHash: contextHashForBlock(block, characterOffset)
        };
      }
    }
    return bestAnchor;
  }

  function rangeAtCharacterOffset(block, characterOffset) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var remaining = Math.max(0, Number(characterOffset) || 0);
    var node = walker.nextNode();
    var lastNode = null;
    while (node) {
      lastNode = node;
      if (remaining <= node.nodeValue.length) {
        var range = document.createRange();
        var start = remaining;
        var end = Math.min(node.nodeValue.length, start + 1);
        if (start === end && start > 0) start -= 1;
        range.setStart(node, start);
        range.setEnd(node, end);
        return range;
      }
      remaining -= node.nodeValue.length;
      node = walker.nextNode();
    }
    if (!lastNode) return null;
    var endRange = document.createRange();
    var lastLength = lastNode.nodeValue.length;
    endRange.setStart(lastNode, Math.max(0, lastLength - 1));
    endRange.setEnd(lastNode, lastLength);
    return endRange;
  }

  function pageForPositionAnchor(anchor) {
    if (!anchor || !Number.isInteger(anchor.blockIndex)) return null;
    var block = reader.querySelector('[data-reader-block="' + anchor.blockIndex + '"]');
    if (!block) return null;
    var offset = Math.max(0, Number(anchor.characterOffset) || 0);
    if (anchor.contextHash && contextHashForBlock(block, offset) !== anchor.contextHash) return null;

    if (isVertical && content) {
      content.style.transition = 'none';
      content.style.transform = 'translateX(0px)';
    } else {
      reader.scrollLeft = 0;
    }
    var range = rangeAtCharacterOffset(block, offset);
    if (!range) return null;
    var rangeRect = range.getBoundingClientRect();
    if (rangeRect.width === 0 && rangeRect.height === 0) {
      range.selectNodeContents(block);
      rangeRect = range.getBoundingClientRect();
    }
    if (isVertical && content) {
      var contentRect = content.getBoundingClientRect();
      var distance = Math.max(0, contentRect.right - rangeRect.right);
      var page = 0;
      for (var i = 1; i < pageBoundaries.length; i++) {
        if (pageBoundaries[i] <= distance + 1) page = i;
        else break;
      }
      return page;
    }
    var readerRect = reader.getBoundingClientRect();
    return Math.max(0, Math.min(
      Math.floor(Math.max(0, rangeRect.left - readerRect.left) / Math.max(1, pageStepPx)),
      totalPages - 1
    ));
  }

  function sendPageInfo() {
    postToNative({
      type: 'page-info',
      currentPage: currentPage + 1,
      totalPages: totalPages,
      progress: lastKnownProgress,
      positionAnchor: capturePositionAnchor(),
      restoreSource: lastRestoreSource,
      restoredAnchorHash: lastRestoredAnchorHash
    });
  }

  function goToProgress(progress) {
    var normalized = Number(progress);
    if (!Number.isFinite(normalized)) return;
    normalized = Math.max(0, Math.min(normalized, 1));
    var restorePage = Math.round(normalized * Math.max(0, totalPages - 1));
    goToPage(restorePage, normalized, 'progress');
  }

  function restorePosition(anchor, progress) {
    var anchorPage = pageForPositionAnchor(anchor);
    if (anchorPage !== null) {
      lastRestoredAnchorHash = anchor.contextHash || null;
      goToPage(anchorPage, progress, 'anchor');
      return true;
    }
    goToProgress(progress);
    return false;
  }

  function repaginatePreservingProgress() {
    var progressBeforeReflow = lastKnownProgress;
    var anchorBeforeReflow = capturePositionAnchor();
    recalcGeometry();
    calcPages();
    restorePosition(anchorBeforeReflow, progressBeforeReflow);
  }

  window.__tadayomuRestoreProgress = function(progress) {
    goToProgress(progress);
  };
  window.__tadayomuRestorePosition = function(anchor, progress) {
    restorePosition(anchor, progress);
  };
  window.__tadayomuRestorePositionForResume = function(anchor, progress, resumePage, resumeTotalPages) {
    if (
      Number.isInteger(resumePage) &&
      Number.isInteger(resumeTotalPages) &&
      resumeTotalPages === totalPages &&
      resumePage >= 1 &&
      resumePage <= totalPages
    ) {
      goToPage(resumePage - 1, progress, 'resume-page');
      return true;
    }
    return restorePosition(anchor, progress);
  };

  function goNextPage() {
    if (currentPage < totalPages - 1) goToPage(currentPage + 1);
    else postToNative({ type: 'next' });
  }

  function goPrevPage() {
    if (currentPage > 0) goToPage(currentPage - 1);
    else postToNative({ type: 'prev' });
  }

  window.__tadayomuTurnPage = function(direction) {
    if (direction === 'next') goNextPage();
    else if (direction === 'previous') goPrevPage();
  };

  document.addEventListener('message', handleSettingsMessage);
  window.addEventListener('message', handleSettingsMessage);

  function handleSettingsMessage(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type !== 'update-style') return;
      var s = data.settings;
      var root = document.documentElement;

      if (s.fontSize !== undefined) root.style.setProperty('--fontSize', s.fontSize + 'px');
      if (s.lineHeight !== undefined) root.style.setProperty('--lineHeight', String(s.lineHeight));
      if (s.margin !== undefined) root.style.setProperty('--marginLR', s.margin + 'px');
      if (s.marginTop !== undefined) root.style.setProperty('--marginT', s.marginTop + 'px');
      if (s.marginBottom !== undefined) root.style.setProperty('--marginB', s.marginBottom + 'px');
      if (s.paragraphSpacing !== undefined) root.style.setProperty('--paragraphSpacing', String(s.paragraphSpacing));
      if (s.reversePageDirection !== undefined) reverseDirection = s.reversePageDirection;
      if (s.pageTurnAnimation !== undefined) pageTurnAnimation = !!s.pageTurnAnimation;

      if (s.fontFamily !== undefined) {
        var ff = '"Noto Serif JP", "游明朝", "YuMincho", "ヒラギノ明朝 ProN", serif';
        if (s.fontFamily === 'sans-serif') ff = '"Noto Sans JP", "游ゴシック", "YuGothic", "ヒラギノ角ゴ ProN", sans-serif';
        root.style.setProperty('--fontFamily', ff);
      }

      setTimeout(function() {
        repaginatePreservingProgress();
      }, 50);
    } catch(ex) { }
  }

  var touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  var touchMoved = false, isDragging = false;

  function isInteractiveImageTarget(target) {
    if (!target) return false;
    if (target.tagName && target.tagName.toLowerCase() === 'img') return true;
    if (target.closest && (target.closest('.image-link') || target.closest('a'))) {
      return true;
    }
    return false;
  }

  document.body.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) {
      isDragging = false;
      return;
    }
    var target = e.target;
    if (isInteractiveImageTarget(target)) {
      touchMoved = false; isDragging = false; return;
    }
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    touchMoved = false; isDragging = true;
  }, { passive: false });

  document.body.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    var currentX = e.touches[0].clientX, currentY = e.touches[0].clientY;
    var dx = currentX - touchStartX, dy = currentY - touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchMoved = true;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });

  document.body.addEventListener('touchend', function(e) {
    if (isInteractiveImageTarget(e.target)) {
      isDragging = false;
      return;
    }
    if (!isDragging) return;
    isDragging = false;
    var endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
    var dx = endX - touchStartX, dy = endY - touchStartY;
    var durationMs = Date.now() - touchStartTime;
    var isHorizontalFlick =
      durationMs <= ${READER_FLICK_MAX_DURATION_MS} &&
      Math.abs(dx) >= ${READER_FLICK_MIN_DISTANCE_PX} &&
      Math.abs(dx) > Math.abs(dy) * ${READER_FLICK_AXIS_RATIO};

    if (isHorizontalFlick) {
      var direction = dx < 0 ? 'next' : 'previous';
      if (reverseDirection) {
        direction = direction === 'next' ? 'previous' : 'next';
      }
      window.__tadayomuTurnPage(direction);
      return;
    }
    if (touchMoved) return;
    handleClickBoundary(endX, endY);
  });

  document.body.addEventListener('touchcancel', function() {
    isDragging = false;
  });

  function handleClickBoundary(x, y) {
    if (isVertical && content) {
      currentVisualOffset = pageBoundaries[currentPage] || 0;
      content.style.transform = 'translateX(' + currentVisualOffset + 'px)';
    }
  
    if (x < containerW * 0.4) {
      if (reverseDirection) goNextPage(); else goPrevPage();
    } else if (x > containerW * 0.6) {
      if (reverseDirection) goPrevPage(); else goNextPage();
    } else {
      postToNative({ type: 'toggle-toolbar' });
    }
  }

  window.addEventListener('resize', function() {
    repaginatePreservingProgress();
  });

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      recalcGeometry();
      calcPages();
      if (startAtLast) goToProgress(1);
      else if (initialPositionAnchor) {
        restorePosition(initialPositionAnchor, ${initProg});
      }
      else if (${initProg} > 0) {
        window.__tadayomuRestoreProgress(${initProg});
      }
      else goToProgress(0);
      
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].addEventListener('load', function() {
          repaginatePreservingProgress();
        });
      }
      
      // Image expansion handling
      function postExpandImage(target) {
        var src = target.getAttribute('data-src') || target.getAttribute('href') || target.getAttribute('src');
        if (src) {
          postToNative({
            type: 'expand-image',
            url: src
          });
        }
      }

      var imageLinks = document.querySelectorAll('.image-link, img');
      for (var i = 0; i < imageLinks.length; i++) {
          imageLinks[i].addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              postExpandImage(this);
          });
          imageLinks[i].addEventListener('touchend', function(e) {
              e.preventDefault();
              e.stopPropagation();
              postExpandImage(this);
          });
      }
    }, 100);
  });
})();
</script>
</body>
</html>`;
}
