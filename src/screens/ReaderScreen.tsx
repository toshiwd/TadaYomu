import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text, Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { Novel } from '../types/novel';
import { useSQLiteContext } from 'expo-sqlite';
import { Dimensions } from 'react-native';

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
  const [settings, setSettings] = useState<ReaderSettings>(() => getReaderSettings(db));
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const settingsAnim = useRef(new Animated.Value(0)).current;

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
    if (chapterIndex < totalChapters) setChapterIndex((i) => i + 1);
  }, [chapterIndex, totalChapters]);

  const goPrevChapter = useCallback(() => {
    if (chapterIndex > 1) setChapterIndex((i) => i - 1);
  }, [chapterIndex]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const toggleSettings = useCallback(() => {
    const next = !showSettings;
    setShowSettings(next);
    Animated.spring(settingsAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [showSettings, settingsAnim]);

  const updateSetting = useCallback((key: keyof ReaderSettings, value: any) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      saveReaderSettings(db, updated);
      return updated;
    });
  }, [db]);

  const htmlContent = useMemo(() => {
    if (loading) return '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><p>読み込み中...</p></body></html>';

    const isVertical = settings.writingMode === 'vertical';
    const processedText = rubyTextToHtml(chapterText);
    const hasContent = processedText.trim().length > 0;

    // Google Fonts CDN for readable Japanese fonts
    const fontLink = isVertical
      ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">'
      : '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">';

    const contentHtml = hasContent ? processedText.split('\n').map((line) => {
      if (!line.trim()) return '<p class="blank">&nbsp;</p>';
      return `<p>${line}</p>`;
    }).join('\n') : '<div style="display:flex;justify-content:center;align-items:center;height:60vh;opacity:0.5;font-size:16px;"><p>テキストが見つかりませんでした。<br>小説を削除して再ダウンロードしてください。</p></div>';

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
${fontLink}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    overflow: hidden;
    background: ${readerTheme.bg};
    -webkit-tap-highlight-color: transparent;
    -webkit-text-size-adjust: 100%;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  ::selection { background: ${readerTheme.selection}; }

  #reader {
    width: 100%;
    height: 100%;
    padding: ${settings.margin}px;
    color: ${readerTheme.fg};
    font-family: ${isVertical
        ? '"Noto Serif JP", "游明朝", "YuMincho", "ヒラギノ明朝 ProN", serif'
        : '"Noto Sans JP", sans-serif'};
    font-size: ${settings.fontSize}px;
    line-height: ${settings.lineHeight};
    text-align: justify;
    word-break: break-all;
    -webkit-font-smoothing: antialiased;

    /* Hidden scrollbar but scrollable programmatically */
    scrollbar-width: none;
    -ms-overflow-style: none;

    ${isVertical ? `
      writing-mode: vertical-rl;
      -webkit-writing-mode: vertical-rl;
      text-orientation: mixed;
      overflow-x: scroll;
      overflow-y: hidden;
    ` : `
      writing-mode: horizontal-tb;
      overflow-x: hidden;
      overflow-y: scroll;
    `}
  }
  #reader::-webkit-scrollbar { display: none; }

  #reader p { text-indent: 1em; margin: 0; ${isVertical ? 'margin-left: 0.3em;' : 'margin-bottom: 0.5em;'} }
  p.blank { text-indent: 0; min-height: 0.5em; }
  ruby { ruby-align: center; }
  rt { font-size: 0.5em; color: ${readerTheme.fg}; opacity: 0.7; }
  .emphasis { text-emphasis: filled sesame; -webkit-text-emphasis: filled sesame; }
  .tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }

  /* Tap zones overlay */
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
  ${contentHtml}
</div>
<div id="tap-zone"></div>
<script>
  var reader = document.getElementById('reader');
  var tapZone = document.getElementById('tap-zone');
  var isVertical = ${isVertical};
  var reverseDirection = ${settings.reversePageDirection ? 'true' : 'false'};

  var currentPage = 0;
  var totalPages = 1;
  var pageSize = 0;

  function calcPages() {
    if (isVertical) {
      pageSize = reader.clientWidth;
      var total = reader.scrollWidth;
      totalPages = pageSize > 0 ? Math.max(1, Math.round(total / pageSize)) : 1;
    } else {
      pageSize = reader.clientHeight;
      var total = reader.scrollHeight;
      totalPages = pageSize > 0 ? Math.max(1, Math.round(total / pageSize)) : 1;
    }
  }

  function goToPage(page) {
    currentPage = page;
    if (isVertical) {
      // vertical-rl: scrollLeft starts at 0 (right edge). Going forward = scrolling left = negative scrollLeft.
      // But Chrome uses negative scrollLeft for RTL content.
      // We scroll by page * pageSize from the start.
      var target = page * pageSize;
      reader.scrollTo({ left: -target, behavior: 'smooth' });
    } else {
      var target = page * pageSize;
      reader.scrollTo({ top: target, behavior: 'smooth' });
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

  // --- Tap & swipe handling ---
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartTime = 0;
  var touchMoved = false;

  tapZone.addEventListener('touchstart', function(e) {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    touchMoved = false;
  }, { passive: false });

  tapZone.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var dx = Math.abs(e.touches[0].clientX - touchStartX);
    var dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 10 || dy > 10) touchMoved = true;
  }, { passive: false });

  tapZone.addEventListener('touchend', function(e) {
    e.preventDefault();
    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var dx = endX - touchStartX;
    var dy = endY - touchStartY;
    var elapsed = Date.now() - touchStartTime;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    // Swipe detection
    if (absDx > 50 && absDx > absDy && elapsed < 500) {
      if (reverseDirection) {
        if (dx < 0) goPrevPage(); else goNextPage();
      } else {
        if (dx < 0) goNextPage(); else goPrevPage();
      }
      return;
    }

    // Tap detection
    if (!touchMoved && elapsed < 300) {
      var screenW = window.innerWidth;
      if (reverseDirection) {
        if (endX > screenW * 0.5) goPrevPage(); else goNextPage();
      } else {
        if (endX > screenW * 0.5) goNextPage(); else goPrevPage();
      }
    }
  }, { passive: false });

  // --- Initialize ---
  function init() {
    calcPages();
    currentPage = 0;
    goToPage(0);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
      requestAnimationFrame(function() { requestAnimationFrame(init); });
    });
  } else {
    window.addEventListener('load', function() {
      requestAnimationFrame(function() { requestAnimationFrame(init); });
    });
  }

  window.addEventListener('resize', function() {
    calcPages();
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    goToPage(currentPage);
  });
</script>
</body>
</html>`;
  }, [chapterText, settings, readerTheme, loading]);

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
        goPrevChapter();
      }
    } catch { }
  }, [db, novelId, chapterIndex, goNextChapter, goPrevChapter]);

  const settingsTranslateY = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: readerTheme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.toolbarBtn}>
          <Ionicons name="arrow-back" size={22} color={readerTheme.fg} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goPrevChapter} style={styles.toolbarBtn} disabled={chapterIndex <= 1}>
          <Ionicons name="chevron-back" size={20} color={chapterIndex > 1 ? readerTheme.fg : readerTheme.fg + '44'} />
        </TouchableOpacity>
        <Text style={[styles.chapterLabel, { color: readerTheme.fg }]} numberOfLines={1}>
          {chapterIndex}/{totalChapters} {chapterTitle}
        </Text>
        <Text style={[styles.pageLabel, { color: readerTheme.fg }]} numberOfLines={1}>
          {currentPage}/{totalPages}
        </Text>
        {loadError && (
          <TouchableOpacity onPress={handleRetry} style={styles.toolbarBtn}>
            <Ionicons name="refresh" size={20} color={readerTheme.fg} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={toggleSettings} style={styles.toolbarBtn}>
          <Ionicons name="settings-outline" size={20} color={readerTheme.fg} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextChapter} style={styles.toolbarBtn} disabled={chapterIndex >= totalChapters}>
          <Ionicons name="chevron-forward" size={20} color={chapterIndex < totalChapters ? readerTheme.fg : readerTheme.fg + '44'} />
        </TouchableOpacity>
      </View>

      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={[styles.webview, { backgroundColor: readerTheme.bg }]}
        onMessage={handleMessage}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        textZoom={100}
        javaScriptEnabled
      />

      {/* Settings Panel */}
      {showSettings && (
        <TouchableOpacity
          style={styles.settingsOverlay}
          activeOpacity={1}
          onPress={toggleSettings}
        />
      )}
      <Animated.View
        style={[
          styles.settingsPanel,
          { backgroundColor: readerTheme.bg, transform: [{ translateY: settingsTranslateY }] },
        ]}
        pointerEvents={showSettings ? 'auto' : 'none'}
      >
        <View style={styles.settingsHandle} />

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

        {/* Margin */}
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>余白</Text>
          <View style={styles.settingControls}>
            <TouchableOpacity
              style={[styles.settingBtn, { borderColor: readerTheme.fg + '30' }]}
              onPress={() => updateSetting('margin', Math.max(8, settings.margin - 4))}
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 8,
    paddingHorizontal: Spacing.xs,
    elevation: 2,
  },
  toolbarBtn: {
    width: 40, height: 40,
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
    minWidth: 50,
  },
  webview: { flex: 1 },

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
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 44,
    textAlign: 'center',
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
});
