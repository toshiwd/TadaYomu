import type { ReaderSettings } from '../types/novel';

export interface GenerateHtmlParams {
  chapterText: string;
  settings: ReaderSettings;
  containerLayout: { width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
  readerTheme: { bg: string; fg: string; selection: string };
  startAtLastPage: boolean;
  initialProgress?: number;
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
  startAtLastPage,
  initialProgress,
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
    const isDialogue = (str: string) => /^[「『（]/.test(str.trim());
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
        const prevContent = paragraphs.length > 0 ? lines.slice(0, i).filter(l => l.trim()).pop() : undefined;
        const nextContent = lines.slice(i + 1).find(l => l.trim());
        if ((prevContent && isDialogue(prevContent)) || (nextContent && isDialogue(nextContent))) {
          paragraphs.push('<p class="blank">&nbsp;</p>');
        }
      } else if (line.indexOf('<div class="image-page">') !== -1) {
        flushCurrent();
        paragraphs.push(line);
      } else {
        currentLines.push(line);
      }
    }
    flushCurrent();
    return paragraphs.join('\n');
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
    text-indent: 1em; margin: 0;
    ${isVertical ? `margin-left: calc(0.6em * var(--paragraphSpacing));` : `margin-bottom: calc(1.0em * var(--paragraphSpacing));`}
  }
  ${isVertical ? '#content' : '#reader'} p:first-child { ${isVertical ? 'margin-right: 0;' : 'margin-top: 0;'} }
  p.blank { ${isVertical ? `min-width: 1em;` : `min-height: calc(0.3em * var(--paragraphSpacing)); margin-bottom: calc(0.5em * var(--paragraphSpacing));`} }
  
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
  var isVertical = ${isVertical};
  var reverseDirection = ${settings.reversePageDirection ? 'true' : 'false'};
  var pageStepPx = 0;
  var containerW = 0;
  var containerH = 0;
  var startAtLast = ${startAtLastPage};
  var currentPage = 0;
  var totalPages = 1;
  var currentVisualOffset = 0;

  function log(msg) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg })); }

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
        var bestIdx = 0;
        for (var j = 0; j < paraStarts.length; j++) { if (paraStarts[j] <= target + 0.5) bestIdx = j; }
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

  function goToPage(page) {
    page = Math.max(0, Math.min(page, totalPages - 1));
    currentPage = page;
    if (isVertical && content) {
      var offset = pageBoundaries[page] || 0;
      currentVisualOffset = offset;
      updateMaskForOffset(offset, true);
      content.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      content.style.transform = 'translateX(' + offset + 'px)';
    } else {
      var maxOff = Math.max(0, reader.scrollWidth - pageStepPx);
      var offset = Math.min(page * pageStepPx, maxOff);
      reader.scrollLeft = offset;
    }
    sendPageInfo();
  }

  function sendPageInfo() {
    var progress = totalPages > 1 ? currentPage / (totalPages - 1) : 1;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'page-info', currentPage: currentPage + 1, totalPages: totalPages, progress: Math.round(progress * 100) / 100
    }));
  }

  function goNextPage() {
    if (currentPage < totalPages - 1) goToPage(currentPage + 1);
    else window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'next' }));
  }

  function goPrevPage() {
    if (currentPage > 0) goToPage(currentPage - 1);
    else window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prev' }));
  }

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

      if (s.fontFamily !== undefined) {
        var ff = '"Noto Serif JP", "游明朝", "YuMincho", "ヒラギノ明朝 ProN", serif';
        if (s.fontFamily === 'sans-serif') ff = '"Noto Sans JP", "游ゴシック", "YuGothic", "ヒラギノ角ゴ ProN", sans-serif';
        root.style.setProperty('--fontFamily', ff);
      }

      setTimeout(function() {
        recalcGeometry();
        calcPages();
        goToPage(Math.min(currentPage, totalPages - 1));
      }, 50);
    } catch(ex) { }
  }

  var touchStartX = 0, touchStartY = 0, touchStartTime = 0, touchMoved = false, baseOffset = 0, isDragging = false, animationFrameId = null;

  document.body.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) return;
    var target = e.target;
    if (target.tagName.toLowerCase() === 'img' || (target.closest && target.closest('a'))) {
      touchMoved = false; isDragging = false; return;
    }
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchStartTime = Date.now();
    touchMoved = false; isDragging = true;
    if (isVertical && content) {
      content.style.transition = 'none'; baseOffset = currentVisualOffset;
    }
  }, { passive: false });

  document.body.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    var currentX = e.touches[0].clientX, currentY = e.touches[0].clientY;
    var dx = currentX - touchStartX, dy = currentY - touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchMoved = true;

    if (isVertical && content && touchMoved && Math.abs(dx) > Math.abs(dy) * 0.5) {
        e.preventDefault();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(function() {
            var target = baseOffset + dx;
            var maxOff = totalPages > 0 ? (pageBoundaries[totalPages - 1] || 0) : 0;
            if (target < 0) target = target * 0.3;
            else if (target > maxOff) target = maxOff + (target - maxOff) * 0.3;
            currentVisualOffset = target;
            updateMaskForOffset(target, false);
            content.style.transform = 'translateX(' + target + 'px)';
            animationFrameId = null;
        });
    }
  }, { passive: false });

  document.body.addEventListener('touchend', function(e) {
    if (!isDragging) return;
    isDragging = false;
    var endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
    var dx = endX - touchStartX, dy = endY - touchStartY;
    var elapsed = Date.now() - touchStartTime;
    var absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (isVertical && content) {
      if (touchMoved) {
        var velocity = dx / Math.max(1, elapsed);
        var amplitude = velocity * 150;
        var targetOffset = currentVisualOffset + amplitude;
        var maxOffset = content.scrollWidth - reader.clientWidth;
        targetOffset = Math.max(0, Math.min(maxOffset, targetOffset));
        content.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        var bestPage = currentPage;
        var minDiff = Infinity;
        for (var i = 0; i < totalPages; i++) {
          var diff = Math.abs(pageBoundaries[i] - targetOffset);
          if (diff < minDiff) { minDiff = diff; bestPage = i; }
        }
        
        var isFastSwipe = Math.abs(velocity) > 0.5;
        if (isFastSwipe) {
          if (velocity < -0.5 && reverseDirection && currentPage < totalPages - 1) bestPage = currentPage + 1;
          else if (velocity > 0.5 && reverseDirection && currentPage > 0) bestPage = currentPage - 1;
          else if (velocity < -0.5 && !reverseDirection && currentPage > 0) bestPage = currentPage - 1;
          else if (velocity > 0.5 && !reverseDirection && currentPage < totalPages - 1) bestPage = currentPage + 1;
        }

        if (bestPage === currentPage && (velocity < -0.8 || dx < -containerW * 0.2)) {
          if (reverseDirection) goNextPage(); else goPrevPage();
          return;
        } else if (bestPage === currentPage && (velocity > 0.8 || dx > containerW * 0.2)) {
          if (reverseDirection) goPrevPage(); else goNextPage();
          return;
        }

        goToPage(bestPage);
      } else {
        handleClickBoundary(endX, endY);
      }
    } else {
      if (touchMoved) {
        if (absDx > absDy && absDx > 40 && elapsed < 500) {
          if (dx < 0) { if (reverseDirection) goPrevPage(); else goNextPage(); }
          else { if (reverseDirection) goNextPage(); else goPrevPage(); }
        } else {
          calcPages();
          currentPage = Math.round(reader.scrollLeft / pageStepPx);
          sendPageInfo();
        }
      } else {
        handleClickBoundary(endX, endY);
      }
    }
  });

  function handleClickBoundary(x, y) {
    if (isVertical && content) {
      currentVisualOffset = pageBoundaries[currentPage] || 0;
      content.style.transform = 'translateX(' + currentVisualOffset + 'px)';
    }
  
    if (x < containerW * 0.3) {
      if (reverseDirection) goNextPage(); else goPrevPage();
    } else if (x > containerW * 0.7) {
      if (reverseDirection) goPrevPage(); else goNextPage();
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggle-toolbar' }));
    }
  }

  window.addEventListener('resize', function() {
    recalcGeometry();
    calcPages();
    goToPage(currentPage);
  });

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      recalcGeometry();
      calcPages();
      if (startAtLast) goToPage(Math.max(0, totalPages - 1));
      else if (${initProg} > 0) {
        var restorePage = Math.round(${initProg} * Math.max(0, totalPages - 1));
        goToPage(restorePage);
      }
      else goToPage(0);
      
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].addEventListener('load', function() {
          recalcGeometry();
          calcPages();
          goToPage(currentPage);
        });
      }
      
      // Image expansion handling
      var imageLinks = document.querySelectorAll('.image-link, img');
      for (var i = 0; i < imageLinks.length; i++) {
          imageLinks[i].addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              var src = this.getAttribute('data-src') || this.getAttribute('href') || this.getAttribute('src');
              if (src) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'expand-image',
                      url: src
                  }));
              }
          });
      }
    }, 100);
  });
})();
</script>
</body>
</html>`;
}
