import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text, Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { Novel } from '../types/novel';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography } from '../theme/colors';
import type { RootStackScreenProps } from '../navigation/types';
import type { ReaderSettings } from '../types/novel';
import {
  getNovelById, getChapter, getReaderSettings,
  upsertReadingProgress, saveReaderSettings,
} from '../database/repository';
import { readChapterText } from '../services/downloadManager';
import { rubyTextToHtml } from '../services/textFormatter';

export default function ReaderScreen({ navigation, route }: RootStackScreenProps<'Reader'>) {
  const { mode } = useTheme();
  const db = useSQLiteContext();
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  const novelId = route.params.novelId;
  const initialChapter = route.params.chapterIndex ?? 1;

  const [chapterIndex, setChapterIndex] = useState(initialChapter);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterText, setChapterText] = useState('');
  const [totalChapters, setTotalChapters] = useState(0);
  const [loading, setLoading] = useState(true);
  const [novel, setNovel] = useState<Novel | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(() => getReaderSettings(db));
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [startAtLastPage, setStartAtLastPage] = useState(false);

  // Keep a ref to settings so htmlContent doesn't depend on it
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const onLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerLayout((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) return prev;
      return { width, height };
    });
  }, []);

  const settingsAnim = useRef(new Animated.Value(0)).current;
  const toolbarAnim = useRef(new Animated.Value(1)).current;

  // Load novel info
  useEffect(() => {
    const n = getNovelById(db, novelId);
    if (n) {
      setTotalChapters(n.totalEpisodes);
      setNovel(n);
    }
  }, [db, novelId]);

  // Load chapter text
  useEffect(() => {
    if (!novel) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    (async () => {
      const ch = getChapter(db, novelId, chapterIndex);
      if (ch && ch.url) {
        try {
          const text = await readChapterText(ch, novel.siteNovelId, db, novel.siteType);
          if (!cancelled) {
            setChapterText(text);
            setChapterTitle(ch.title || `第${chapterIndex}話`);
          }
        } catch (err: any) {
          console.error(`[Reader] Failed to load chapter:`, err);
          if (!cancelled) {
            setChapterText(`テキストの読み込みに失敗しました\n${err?.message || ''}`);
            setLoadError(true);
          }
        }
      } else {
        if (!cancelled) setChapterText('この話はまだダウンロードされていません');
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [db, novelId, chapterIndex, novel, retryCount]);

  // Save progress
  useEffect(() => {
    if (!loading) {
      upsertReadingProgress(db, novelId, chapterIndex, 0);
    }
  }, [db, novelId, chapterIndex, loading]);

  const readerTheme = useMemo(() => {
    const themes = {
      light: { bg: '#FAF7F2', fg: '#2C2C2C', selection: 'rgba(45,95,79,0.2)' },
      dark: { bg: '#1A1A2E', fg: '#E0E0E0', selection: 'rgba(45,95,79,0.4)' },
      sepia: { bg: '#F5E6C8', fg: '#3E2F1C', selection: 'rgba(194,149,107,0.3)' },
    };
    return themes[mode];
  }, [mode]);

  const goNextChapter = useCallback(() => {
    if (chapterIndex < totalChapters) {
      setStartAtLastPage(false);
      setChapterIndex((i) => i + 1);
    }
  }, [chapterIndex, totalChapters]);

  const goPrevChapter = useCallback((startAtLast = false) => {
    if (chapterIndex > 1) {
      setStartAtLastPage(startAtLast === true);
      setChapterIndex((i) => i - 1);
    }
  }, [chapterIndex]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const toggleToolbar = useCallback(() => {
    const next = !toolbarVisible;
    setToolbarVisible(next);
    Animated.timing(toolbarAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [toolbarVisible, toolbarAnim]);

  const toggleSettings = useCallback(() => {
    const next = !showSettings;
    if (next) {
      setIsSettingsVisible(true);
      setShowSettings(true);
      Animated.spring(settingsAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      setShowSettings(false);
      Animated.spring(settingsAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start(() => {
        setIsSettingsVisible(false);
      });
    }
  }, [showSettings, settingsAnim]);

  const updateSetting = useCallback((key: keyof ReaderSettings, value: any) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      saveReaderSettings(db, updated);

      // Send style update to WebView via postMessage (no reload)
      webViewRef.current?.postMessage(JSON.stringify({
        type: 'update-style',
        settings: {
          fontSize: updated.fontSize,
          lineHeight: updated.lineHeight,
          fontFamily: updated.fontFamily,
          margin: updated.margin,
          marginTop: updated.marginTop,
          marginBottom: updated.marginBottom,
          paragraphSpacing: updated.paragraphSpacing,
          writingMode: updated.writingMode,
          reversePageDirection: updated.reversePageDirection,
        },
      }));

      return updated;
    });
  }, [db]);

  // ========================================================
  // HTML content — does NOT depend on `settings` (uses settingsRef)
  // ========================================================
  const htmlContent = useMemo(() => {
    if (loading) return '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><p>読み込み中...</p></body></html>';
    if (containerLayout.width === 0 || containerLayout.height === 0) return '';

    // Capture settings at generation time (ref) — subsequent changes go via postMessage
    const s = settingsRef.current;
    const isVertical = s.writingMode === 'vertical';
    const processedText = rubyTextToHtml(chapterText);
    const hasContent = processedText.trim().length > 0;

    // Google Fonts CDN
    const fontLink = (() => {
      const f = s.fontFamily;
      if (f === 'shippori-mincho') return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;700&display=swap" rel="stylesheet">';
      if (f === 'zen-kaku-gothic') return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet">';
      if (f === 'klee-one') return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap" rel="stylesheet">';
      if (f === 'serif') return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">';
      return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">';
    })();

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

    // ========================================================
    // Geometry
    // ========================================================
    const viewW = containerLayout.width;
    const viewH = containerLayout.height;

    // CSS custom property initial values from settings
    const marginLR = s.margin;
    const marginT = s.marginTop;
    const marginB = s.marginBottom;
    const fontSize = s.fontSize;
    const lineHeight = s.lineHeight;
    const paragraphSpacing = s.paragraphSpacing;

    // Content dimensions (used for paging calculation) - floor to avoid sub-pixel overflow
    const availW = Math.floor(viewW - marginLR * 2 - insets.left - insets.right);
    const contentH = Math.floor(viewH - marginT - marginB);

    let contentW = availW;
    let extraMarginLeft = 0;

    let fontFamilyCSS = '"Noto Serif JP", "游明朝", "YuMincho", "ヒラギノ明朝 ProN", serif';
    if (s.fontFamily === 'sans-serif') fontFamilyCSS = '"Noto Sans JP", "游ゴシック", "YuGothic", "ヒラギノ角ゴ ProN", sans-serif';
    else if (s.fontFamily === 'shippori-mincho') fontFamilyCSS = '"Shippori Mincho", "游明朝", "YuMincho", serif';
    else if (s.fontFamily === 'zen-kaku-gothic') fontFamilyCSS = '"Zen Kaku Gothic New", "游ゴシック", "YuGothic", sans-serif';
    else if (s.fontFamily === 'klee-one') fontFamilyCSS = '"Klee One", "游明朝", "YuMincho", serif';

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

  html {
    width: var(--viewW);
    height: var(--viewH);
    overflow: hidden;
    background: var(--bg);
  }

  body {
    width: var(--viewW);
    height: var(--viewH);
    overflow: hidden;
    background: var(--bg);
    -webkit-tap-highlight-color: transparent;
    -webkit-text-size-adjust: 100%;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  ::selection { background: var(--selection); }

  ${isVertical ? `
  /* Vertical mode: viewport + content wrapper pattern */
  #reader {
    position: absolute;
    top: var(--marginT);
    left: calc(var(--marginLR) + var(--insetLeft) + ${extraMarginLeft}px);
    width: ${contentW}px;
    height: ${contentH}px;
    overflow: hidden;
    background: var(--bg);
  }
  #content {
    writing-mode: vertical-rl;
    direction: ltr;
    text-orientation: mixed;
    text-align: start;
    height: ${contentH}px;
    width: max-content;
    float: right; /* Right-align so page 0 shows the start (rightmost) text */
    color: var(--fg);
    font-family: var(--fontFamily);
    font-size: var(--fontSize);
    line-height: var(--lineHeight);
    word-break: keep-all;
    overflow-wrap: break-word;
    line-break: strict;
    -webkit-font-smoothing: antialiased;
    padding: 0;
    will-change: transform;
    transition: transform 0.0s linear;
  }
  ` : `
  /* Horizontal mode: CSS multi-column layout */
  #reader {
    position: absolute;
    top: var(--marginT);
    left: calc(var(--marginLR) + var(--insetLeft) + ${extraMarginLeft}px);
    height: ${contentH}px;
    color: var(--fg);
    font-family: var(--fontFamily);
    font-size: var(--fontSize);
    line-height: var(--lineHeight);
    word-break: keep-all;
    overflow-wrap: break-word;
    line-break: strict;
    -webkit-font-smoothing: antialiased;
    padding: 0;
    box-sizing: content-box;
    -ms-overflow-style: none;
    writing-mode: horizontal-tb;
    column-width: calc(var(--viewW) - var(--marginLR) * 2 - var(--insetLeft) - var(--insetRight));
    column-gap: calc(var(--marginLR) * 2 + var(--insetLeft) + var(--insetRight));
    column-fill: auto;
    overflow-x: scroll;
    overflow-y: hidden;
  }
  `}
  #reader::-webkit-scrollbar { display: none; }

  ${isVertical ? '#content' : '#reader'} p {
    text-indent: 1em;
    margin: 0;
    ${isVertical
        ? `margin-left: calc(0.6em * var(--paragraphSpacing));`
        : `margin-bottom: calc(1.0em * var(--paragraphSpacing));`}
  }
  ${isVertical ? '#content' : '#reader'} p:first-child {
    ${isVertical ? 'margin-right: 0;' : 'margin-top: 0;'}
  }
  p.blank {
    ${isVertical
        ? `min-width: 1em;`
        : `min-height: calc(0.3em * var(--paragraphSpacing));
           margin-bottom: calc(0.5em * var(--paragraphSpacing));`}
  }
  
  /* Ruby spacing to prevent overlap */
  ruby { ruby-align: center; ruby-position: over; }
  rt { font-size: 0.5em; color: var(--fg); opacity: 0.7; padding-right: 0.1em; padding-left: 0.1em; }
  
  /* Tate-chu-yoko and Bouten */
  .emphasis { 
    text-emphasis: filled sesame; 
    -webkit-text-emphasis: filled sesame; 
    font-style: normal;
  }
  .tcy { 
    text-combine-upright: all; 
    -webkit-text-combine: horizontal;
    /* ensure digits are legible */
    font-family: "Helvetica Neue", Arial, sans-serif;
  }

  /* Single Page Image Display */
  .image-page {
    width: var(--viewW);
    height: ${contentH}px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    ${isVertical ? `margin-top: 0; margin-bottom: 0; margin-left: var(--marginLR); margin-right: var(--marginLR);` : `margin: 0;`}
  }
  .image-page img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  #tap-zone {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 100;
  }
</style>
</head>
<body>
<div id="reader">
  ${isVertical ? `<div id="content">${contentHtml}</div>` : contentHtml}
</div>
<div id="tap-zone"></div>
<script>
(function() {
  var reader = document.getElementById('reader');
  var content = document.getElementById('content'); // only exists in vertical mode
  var tapZone = document.getElementById('tap-zone');
  var isVertical = ${isVertical};
  var reverseDirection = ${s.reversePageDirection ? 'true' : 'false'};
  var pageStepPx = 0;
  var containerW = 0;
  var containerH = 0;
  var startAtLast = ${startAtLastPage};
  var currentPage = 0;
  var totalPages = 1;
  var currentVisualOffset = 0;

  function log(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
  }

  // For vertical mode: precomputed array of page offsets (from right edge of content)
  var pageBoundaries = [0]; // page 0 starts at offset 0

  function recalcGeometry() {
    if (isVertical && content) {
      var viewportW = reader.clientWidth;
      pageStepPx = viewportW;
      
      var paragraphs = content.querySelectorAll('p');
      var totalW = content.scrollWidth;
      if (paragraphs.length === 0 || totalW <= viewportW) {
        pageBoundaries = [0];
        totalPages = 1;
        log('[Geometry] vertical: single page, totalW=' + totalW + ' viewportW=' + viewportW);
        return;
      }
      
      var contentRect = content.getBoundingClientRect();
      
      // Collect paragraph start positions (right edges in vertical-rl)
      // measured as distance from content's right edge
      var paraStarts = [];
      for (var i = 0; i < paragraphs.length; i++) {
        var rect = paragraphs[i].getBoundingClientRect();
        var startFromRight = contentRect.right - rect.right;
        paraStarts.push(startFromRight);
      }
      // Add end marker
      paraStarts.push(totalW);
      // Sort ascending
      paraStarts.sort(function(a, b) { return a - b; });
      // Deduplicate
      var unique = [paraStarts[0]];
      for (var i = 1; i < paraStarts.length; i++) {
        if (Math.abs(paraStarts[i] - unique[unique.length - 1]) > 1) {
          unique.push(paraStarts[i]);
        }
      }
      paraStarts = unique;
      
      // Build page boundaries
      pageBoundaries = [0];
      var cursor = 0;
      while (cursor + viewportW < totalW) {
        var target = cursor + viewportW;
        // Find the largest paraStart that is <= target
        var bestIdx = 0;
        for (var j = 0; j < paraStarts.length; j++) {
          if (paraStarts[j] <= target + 0.5) bestIdx = j;
        }
        var nextStart = paraStarts[bestIdx];
        // If nextStart hasn't advanced past cursor, force advance by viewportW
        if (nextStart <= cursor + 0.5) {
          nextStart = cursor + viewportW;
        }
        if (nextStart >= totalW) break;
        pageBoundaries.push(nextStart);
        cursor = nextStart;
      }
      
      totalPages = pageBoundaries.length;
      log('[Geometry] vertical: viewportW=' + viewportW + ' totalW=' + totalW + ' totalPages=' + totalPages + ' paraStarts=' + paraStarts.length);
    } else {
      var cs = getComputedStyle(reader);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var colGapVal = parseFloat(cs.columnGap) || 0;
      pageStepPx = (reader.clientWidth - padL - padR) + colGapVal;
    }
    containerW = parseFloat(document.documentElement.style.getPropertyValue('--viewW')) || ${viewW};
    containerH = parseFloat(document.documentElement.style.getPropertyValue('--viewH')) || ${viewH};
    log('[Geometry] recalcGeometry: pageStepPx=' + pageStepPx + ' isVertical=' + isVertical);
  }

  function calcPages() {
    if (isVertical && content) {
      log('[Paging] vertical totalPages=' + totalPages);
    } else {
      var sw = reader.scrollWidth;
      if (pageStepPx <= 0) { totalPages = 1; return; }
      var maxOff = Math.max(0, sw - pageStepPx);
      totalPages = Math.ceil(maxOff / pageStepPx) + 1;
      if (totalPages < 1) totalPages = 1;
      log('[Paging] scrollWidth=' + sw + ' pageStep=' + pageStepPx + ' totalPages=' + totalPages);
    }
  }

  function goToPage(page) {
    page = Math.max(0, Math.min(page, totalPages - 1));
    currentPage = page;
    if (isVertical && content) {
      var offset = pageBoundaries[page] || 0;
      currentVisualOffset = offset;
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
      type: 'page-info',
      currentPage: currentPage + 1,
      totalPages: totalPages,
      progress: Math.round(progress * 100) / 100
    }));
  }

  function goNextPage() {
    if (currentPage < totalPages - 1) {
      goToPage(currentPage + 1);
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'next' }));
    }
  }

  function goPrevPage() {
    if (currentPage > 0) {
      goToPage(currentPage - 1);
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prev' }));
    }
  }

  // --- Handle settings updates from RN (no reload) ---
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
        else if (s.fontFamily === 'shippori-mincho') ff = '"Shippori Mincho", "游明朝", "YuMincho", serif';
        else if (s.fontFamily === 'zen-kaku-gothic') ff = '"Zen Kaku Gothic New", "游ゴシック", "YuGothic", sans-serif';
        else if (s.fontFamily === 'klee-one') ff = '"Klee One", "游明朝", "YuMincho", serif';
        root.style.setProperty('--fontFamily', ff);

        var linkId = 'font-' + s.fontFamily;
        if (!document.getElementById(linkId)) {
           var href = '';
           if (s.fontFamily === 'shippori-mincho') href = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;700&display=swap';
           else if (s.fontFamily === 'zen-kaku-gothic') href = 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap';
           else if (s.fontFamily === 'klee-one') href = 'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap';
           else if (s.fontFamily === 'serif') href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';
           else if (s.fontFamily === 'sans-serif') href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
           
           if (href) {
               var link = document.createElement('link');
               link.id = linkId;
               link.rel = 'stylesheet';
               link.href = href;
               document.head.appendChild(link);
           }
        }
      }

      // Recalculate geometry and pages after a short reflow delay
      setTimeout(function() {
        recalcGeometry();
        calcPages();
        goToPage(Math.min(currentPage, totalPages - 1));
      }, 50);
    } catch(ex) { /* ignore non-JSON messages */ }
  }

  // --- Tap & swipe handling ---
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartTime = 0;
  var touchMoved = false;
  var baseOffset = 0; // For animating drag
  var isDragging = false;
  var animationFrameId = null;

  tapZone.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) return; // ignore multi-touch
    // e.preventDefault(); // Don't prevent default on start to allow some native interactions if needed, though we block scaling. Actually for full control, preventDefault is better.
    // e.preventDefault() causes warnings in some listeners unless passive:false. We added passive:false.
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    touchMoved = false;
    isDragging = true;
    
    if (isVertical && content) {
      // Remove transition for instant finger tracking
      content.style.transition = 'none';
      baseOffset = currentVisualOffset; // We'll maintain a global visual offset
    }
  }, { passive: false });

  tapZone.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    // e.preventDefault();
    var currentX = e.touches[0].clientX;
    var currentY = e.touches[0].clientY;
    var dx = currentX - touchStartX;
    var dy = currentY - touchStartY;
    
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchMoved = true;

    // Finger tracking animation
    if (isVertical && content && touchMoved && Math.abs(dx) > Math.abs(dy) * 0.5) {
        e.preventDefault(); // Prevent native scroll
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(function() {
            var target = baseOffset + dx;
            // Clamp roughly
            var maxOffset = content.scrollWidth - viewportW;
            currentVisualOffset = Math.max(-100, Math.min(maxOffset + 100, target));
            content.style.transform = 'translateX(' + currentVisualOffset + 'px)';
        });
    }
  }, { passive: false });

  tapZone.addEventListener('touchend', function(e) {
    if (!isDragging) return;
    isDragging = false;
    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var dx = endX - touchStartX;
    var dy = endY - touchStartY;
    var elapsed = Date.now() - touchStartTime;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (isVertical && content) {
      if (touchMoved) {
        // Continuous sliding with simple momentum instead of page snapping
        var velocity = dx / Math.max(1, elapsed); // px per ms
        var amplitude = velocity * 150; // glide distance
        var targetOffset = currentVisualOffset + amplitude;
        var maxOffset = content.scrollWidth - reader.clientWidth;
        
        targetOffset = Math.max(0, Math.min(maxOffset, targetOffset));
        
        content.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        content.style.transform = 'translateX(' + targetOffset + 'px)';
        currentVisualOffset = targetOffset;
        
        // Update current page roughly based on offset
        var approxPage = Math.round(targetOffset / reader.clientWidth);
        currentPage = Math.max(0, Math.min(approxPage, totalPages - 1));
        sendPageInfo();
        return;
      }
    } else {
      // Horizontal mode native scrolling fallback
      if (absDx > 30 && absDx > absDy && elapsed < 800 && touchMoved) {
        if (Math.abs(dx) > containerW * 0.1 || (elapsed < 300 && absDx > 30)) {
            if (reverseDirection) {
              if (dx < 0) goPrevPage(); else goNextPage();
            } else {
              if (dx < 0) goNextPage(); else goPrevPage();
            }
        } else {
            goToPage(currentPage); 
        }
        return;
      }
    }

    // Tap detection — exactly left or right half
    if (!touchMoved && elapsed < 300) {
      // Menu toggle: Central 33% vertically and horizontally
      var isCenterHorizontal = endX > containerW * 0.33 && endX < containerW * 0.66;
      var isCenterVertical = endY > containerH * 0.33 && endY < containerH * 0.66;

      if (isCenterHorizontal && isCenterVertical) {
        // Center tap — toggle toolbar via RN
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggle-toolbar' }));
      } else if (reverseDirection) {
        if (endX > containerW * 0.5) goPrevPage(); else goNextPage();
      } else {
        if (endX > containerW * 0.5) goNextPage(); else goPrevPage();
      }
    } else if (touchMoved && !isVertical) {
        goToPage(currentPage);
    }
  }, { passive: false });

  // --- Initialize ---
  function init() {
    log('[Geometry] init() — viewW=' + containerW + ' isVertical=' + isVertical);
    recalcGeometry();
    calcPages();
    goToPage(startAtLast ? totalPages - 1 : 0);
  }

  window.addEventListener('load', function() {
    setTimeout(init, 100);
  });
})();
</script>
</body>
</html>`;
  }, [chapterText, readerTheme, loading, insets, containerLayout]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'page-info') {
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
        upsertReadingProgress(db, novelId, chapterIndex, data.progress);
      } else if (data.type === 'next') {
        goNextChapter();
      } else if (data.type === 'prev') {
        goPrevChapter(true);
      } else if (data.type === 'toggle-toolbar') {
        toggleToolbar();
      } else if (data.type === 'log') {
        console.log('[WebView]', data.message);
      }
    } catch { }
  }, [db, novelId, chapterIndex, goNextChapter, goPrevChapter, toggleToolbar]);


  const settingsTranslateY = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <View style={styles.container}>
      <StatusBar hidden={settings.fullscreen} />

      {/* Toolbar — in normal flow above WebView */}
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: readerTheme.bg,
            paddingTop: insets.top + 4,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.toolbarBtn}>
          <Ionicons name="arrow-back" size={20} color={readerTheme.fg} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goPrevChapter(false)} style={styles.toolbarBtn} disabled={chapterIndex <= 1}>
          <Ionicons name="chevron-back" size={18} color={chapterIndex > 1 ? readerTheme.fg : readerTheme.fg + '44'} />
        </TouchableOpacity>
        <Text style={[styles.chapterLabel, { color: readerTheme.fg }]} numberOfLines={1}>
          {chapterIndex}/{totalChapters} {chapterTitle}
        </Text>
        <Text style={[styles.pageLabel, { color: readerTheme.fg }]} numberOfLines={1}>
          {currentPage}/{totalPages}
        </Text>
        {loadError && (
          <TouchableOpacity onPress={handleRetry} style={styles.toolbarBtn}>
            <Ionicons name="refresh" size={18} color={readerTheme.fg} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={toggleSettings} style={styles.toolbarBtn}>
          <Ionicons name="settings-outline" size={18} color={readerTheme.fg} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextChapter} style={styles.toolbarBtn} disabled={chapterIndex >= totalChapters}>
          <Ionicons name="chevron-forward" size={18} color={chapterIndex < totalChapters ? readerTheme.fg : readerTheme.fg + '44'} />
        </TouchableOpacity>
      </View>

      {/* WebView fills remaining space — onLayout measures final size */}
      <View style={styles.webviewFull} onLayout={onLayout}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={{ flex: 1, backgroundColor: readerTheme.bg }}
          onMessage={handleMessage}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          textZoom={100}
          javaScriptEnabled
        />
      </View>

      {/* Settings Panel */}
      {isSettingsVisible && (
        <TouchableOpacity
          style={styles.settingsOverlay}
          activeOpacity={1}
          onPress={toggleSettings}
        />
      )}
      {isSettingsVisible && (
        <Animated.View
          style={[
            styles.settingsPanel,
            { backgroundColor: readerTheme.bg, transform: [{ translateY: settingsTranslateY }] },
          ]}
        >
          <View style={styles.settingsHandle} />

          {/* Font Family */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>フォント</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.fontFamily === 'serif' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('fontFamily', 'serif')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>明朝</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.fontFamily === 'sans-serif' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('fontFamily', 'sans-serif')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>ゴシック</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.settingRow}>
            <View style={[styles.settingControls, { flexWrap: 'wrap', gap: 8 }]}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  { paddingHorizontal: 12 },
                  settings.fontFamily === 'shippori-mincho' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('fontFamily', 'shippori-mincho')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg, fontSize: 11 }]}>しっぽり明朝</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  { paddingHorizontal: 12 },
                  settings.fontFamily === 'zen-kaku-gothic' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('fontFamily', 'zen-kaku-gothic')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg, fontSize: 11 }]}>Zen角ゴシック</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  { paddingHorizontal: 12 },
                  settings.fontFamily === 'klee-one' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('fontFamily', 'klee-one')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg, fontSize: 11 }]}>クレーOne</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Font Size */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>文字サイズ</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('fontSize', Math.max(12, settings.fontSize - 1))}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>A-</Text>
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>{settings.fontSize}px</Text>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('fontSize', Math.min(32, settings.fontSize + 1))}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>A+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Side Margins (left/right) */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>左右余白</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('margin', Math.max(4, settings.margin - 4))}
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>{settings.margin}px</Text>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('margin', Math.min(48, settings.margin + 4))}
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Top Margin */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>上余白</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('marginTop', Math.max(0, settings.marginTop - 4))}
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>{settings.marginTop}px</Text>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('marginTop', Math.min(60, settings.marginTop + 4))}
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Margin */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>下余白</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('marginBottom', Math.max(0, settings.marginBottom - 4))}
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>{settings.marginBottom}px</Text>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('marginBottom', Math.min(80, settings.marginBottom + 4))}
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Line Height */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>行間</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('lineHeight', Math.max(1.0, Math.round((settings.lineHeight - 0.1) * 10) / 10))}
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>{settings.lineHeight.toFixed(1)}</Text>
              <TouchableOpacity
                style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
                onPress={() => updateSetting('lineHeight', Math.min(2.5, Math.round((settings.lineHeight + 0.1) * 10) / 10))}
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Paragraph Spacing */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>段落間隔</Text>
            <View style={styles.settingControls}>
              {[{ label: '詰める', value: 0.3 }, { label: '標準', value: 0.5 }, { label: '広め', value: 1.0 }].map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.modeBtn,
                    settings.paragraphSpacing === opt.value && { backgroundColor: readerTheme.fg + '15' },
                    { borderColor: readerTheme.fg + '30' },
                  ]}
                  onPress={() => updateSetting('paragraphSpacing', opt.value)}
                >
                  <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Writing Mode Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>組方向</Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.writingMode === 'vertical' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('writingMode', 'vertical')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>縦書き</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.writingMode === 'horizontal' && { backgroundColor: readerTheme.fg + '15' },
                  { borderColor: readerTheme.fg + '30' },
                ]}
                onPress={() => updateSetting('writingMode', 'horizontal')}
              >
                <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>横書き</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reverse Page Direction Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>ページ送り 左右反転</Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                { backgroundColor: settings.reversePageDirection ? readerTheme.fg + '20' : 'transparent', borderColor: readerTheme.fg + '30' },
              ]}
              onPress={() => updateSetting('reversePageDirection', !settings.reversePageDirection)}
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.reversePageDirection ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fullscreen Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>全画面 (時計非表示)</Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                { backgroundColor: settings.fullscreen ? readerTheme.fg + '20' : 'transparent', borderColor: readerTheme.fg + '30' },
              ]}
              onPress={() => updateSetting('fullscreen', !settings.fullscreen)}
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.fullscreen ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webviewFull: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: Spacing.xs,
  },
  toolbarBtn: {
    width: 36, height: 36,
    justifyContent: 'center', alignItems: 'center',
  },
  chapterLabel: {
    flex: 1, textAlign: 'center',
    ...Typography.caption, fontWeight: '600',
  },
  pageLabel: {
    textAlign: 'center',
    ...Typography.caption,
    fontWeight: '500',
    opacity: 0.6,
    minWidth: 44,
  },

  // Settings overlay
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  settingsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 40,
    zIndex: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  settingsHandle: {
    width: 40, height: 4,
    backgroundColor: 'rgba(128,128,128,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  settingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingBtn: {
    width: 34, height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  settingValue: {
    fontSize: 13,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
});
