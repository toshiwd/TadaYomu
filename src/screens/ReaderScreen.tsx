import React, {
  useMemo,
  useRef,
  useCallback,
  useState,
  useEffect,
} from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Animated,
  AppState,
  Alert,
  Modal,
  Image,
  TouchableWithoutFeedback,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import type { Novel, ReaderSettings } from "../types/novel";
import { useSQLiteContext } from "expo-sqlite";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeContext";
import { Spacing, Typography } from "../theme/colors";
import type { RootStackScreenProps } from "../navigation/types";
import {
  getNovelById,
  getChapter,
  getReaderSettings,
  upsertReadingProgressIfChanged,
  saveReaderSettings,
  upsertChapter,
  updateNovel,
  getReadingProgress,
} from "../database/repository";
import { readChapterText } from "../services/downloadManager";
import { getAdapter } from "../services/siteAdapter";
import { rubyTextToHtml } from "../services/textFormatter";
import { syncService } from "../services/syncService";
import { generateReaderHtml } from "../services/readerHtmlGenerator";
import { reportNonFatal } from "../services/crashReporter";
import {
  normalizeReaderChapterIndex,
  resolveReaderChapterList,
  resolveReaderNextChapter,
} from "../services/readerEntry";
import { getNextChapterIndexToPrefetch } from "../services/readerPrefetch";
import {
  addVolumePageTurnListener,
  setVolumePagingEnabled,
} from "../services/readerControls";

function clampProgress(progress: unknown): number {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

export default function ReaderScreen({
  navigation,
  route,
}: RootStackScreenProps<"Reader">) {
  const { mode } = useTheme();
  const db = useSQLiteContext();
  const webViewRef = useRef<WebView>(null);
  const loadRequestIdRef = useRef(0);
  const nextChapterRequestIdRef = useRef(0);
  const nextChapterCheckingRef = useRef(false);
  const insets = useSafeAreaInsets();
  useKeepAwake("tadayomu-reader");

  const novelId = route.params.novelId;
  const initialChapter = normalizeReaderChapterIndex(route.params.chapterIndex);

  const [chapterIndex, setChapterIndex] = useState(initialChapter);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterText, setChapterText] = useState("");
  const [totalChapters, setTotalChapters] = useState(0);
  const [loading, setLoading] = useState(true);
  const [novel, setNovel] = useState<Novel | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [initialProgress, setInitialProgress] = useState(0);
  const [settings, setSettings] = useState<ReaderSettings>(() =>
    getReaderSettings(db),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [containerLayout, setContainerLayout] = useState({
    width: 0,
    height: 0,
  });
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [startAtLastPage, setStartAtLastPage] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [webViewRenderFailed, setWebViewRenderFailed] = useState(false);
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const [checkingNextChapter, setCheckingNextChapter] = useState(false);
  const readerTargetRef = useRef({ novelId, chapterIndex });

  readerTargetRef.current = { novelId, chapterIndex };

  useEffect(() => {
    return () => {
      nextChapterRequestIdRef.current += 1;
      nextChapterCheckingRef.current = false;
    };
  }, []);

  // Keep a ref to settings so htmlContent doesn't depend on it
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const onLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerLayout((prev) => {
      if (
        Math.abs(prev.width - width) < 2 &&
        Math.abs(prev.height - height) < 2
      )
        return prev;
      return { width, height };
    });
  }, []);

  const settingsAnim = useRef(new Animated.Value(0)).current;
  const toolbarAnim = useRef(new Animated.Value(1)).current;
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestProgressRef = useRef<{ progress: number; page: number } | null>(null);
  const pendingRestoreProgressRef = useRef<number | null>(null);
  const lastSyncedProgressRef = useRef<{
    novelId: number;
    chapterIndex: number;
    progress: number;
  } | null>(null);

  useEffect(() => {
    const subscription = addVolumePageTurnListener((direction) => {
      webViewRef.current?.injectJavaScript(`
        if (window.__tadayomuTurnPage) {
          window.__tadayomuTurnPage(${JSON.stringify(direction)});
        }
        true;
      `);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const enabled =
      !loading &&
      !isSettingsVisible &&
      zoomedImage === null &&
      !webViewRenderFailed;
    setVolumePagingEnabled(enabled);

    return () => setVolumePagingEnabled(false);
  }, [loading, isSettingsVisible, zoomedImage, webViewRenderFailed]);

  const flushLatestProgress = useCallback(() => {
    const latest = latestProgressRef.current;
    if (!latest) return;
    upsertReadingProgressIfChanged(db, novelId, chapterIndex, latest.progress, {
      force: true,
    });
  }, [db, novelId, chapterIndex]);

  const handleCloseReader = useCallback(() => {
    flushLatestProgress();
    navigation.goBack();
  }, [flushLatestProgress, navigation]);

  // Load novel info
  useEffect(() => {
    const n = getNovelById(db, novelId);
    if (!n) {
      setChapterText("作品情報が見つかりません。書庫に戻って再読み込みしてください");
      setLoadError(true);
      setLoading(false);
      return;
    }
    const normalizedChapterIndex = normalizeReaderChapterIndex(
      route.params.chapterIndex,
      n.totalEpisodes,
    );
    console.log("[ReaderInit]", {
      novelId,
      routeChapterIndex: route.params.chapterIndex,
      normalizedChapterIndex,
      totalEpisodes: n.totalEpisodes,
    });
    setTotalChapters(n.totalEpisodes);
    if (n.totalEpisodes <= 0) {
      setNovel(null);
      setChapterText("話一覧を取得できませんでした。再読み込みしてください");
      setLoadError(true);
      setLoading(false);
      return;
    }
    setNovel(n);
    setChapterIndex((current) =>
      current === normalizedChapterIndex ? current : normalizedChapterIndex,
    );
  }, [db, novelId, route.params.chapterIndex, retryCount]);

  // Load chapter text
  useEffect(() => {
    if (!novel) return;
    const requestId = ++loadRequestIdRef.current;
    let cancelled = false;
    const isCurrentRequest = () =>
      !cancelled && loadRequestIdRef.current === requestId;
    setLoading(true);
    setLoadError(false);

    void (async () => {
      let availableChapterCount = novel.totalEpisodes;
      let ch = getChapter(db, novelId, chapterIndex);

      // チャプターがDBに存在しない場合（同期済みだが未取得）
      if (!ch && novel) {
        const adapter = getAdapter(novel.siteType);
        if (adapter) {
          try {
            console.log(`[Reader] No chapter in DB, fetching chapter list from site...`);
            const chapterList = await adapter.getChapterList(novel.siteNovelId);
            if (!isCurrentRequest()) return;
            console.log("[ReaderChapterList]", {
              novelId,
              requestedChapter: chapterIndex,
              chapterCount: chapterList.length,
            });
            const chapterListResolution = resolveReaderChapterList(
              chapterIndex,
              chapterList.length,
            );
            if (chapterListResolution.kind === "empty") {
              setTotalChapters(0);
              setChapterText("話一覧を取得できませんでした。再読み込みしてください");
              setLoadError(true);
              setLoading(false);
              return;
            }
            db.withTransactionSync(() => {
              for (const c of chapterList) {
                upsertChapter(db, {
                  novelId: novel.id,
                  index: c.index,
                  title: c.title,
                  localPath: null,
                  isDownloaded: false,
                  url: c.url,
                  publishedAt: c.publishedAt,
                  revisedAt: c.revisedAt,
                });
              }
            });
            updateNovel(db, novel.id, {
              totalEpisodes: chapterList.length,
              lastCheckedAt: new Date().toISOString(),
            });
            availableChapterCount = chapterList.length;
            setTotalChapters(chapterList.length);
            setNovel((current) =>
              current?.id === novel.id
                ? { ...current, totalEpisodes: chapterList.length }
                : current,
            );
            if (chapterListResolution.changed) {
              setChapterIndex(chapterListResolution.chapterIndex);
              return;
            }
            ch = getChapter(db, novelId, chapterListResolution.chapterIndex);
          } catch (err) {
            console.error(`[Reader] Failed to fetch chapter list:`, err);
          }
        }
      }

      if (ch && ch.url) {
        try {
          const rawText = await readChapterText(
            ch,
            novel.siteNovelId,
            db,
            novel.siteType,
          );
          if (isCurrentRequest()) {
            const savedProgress = getReadingProgress(db, novelId);
            const openedChapterProgress =
              savedProgress?.currentChapter === chapterIndex
                ? clampProgress(savedProgress.scrollPercentage)
                : 0;
            upsertReadingProgressIfChanged(
              db,
              novelId,
              chapterIndex,
              openedChapterProgress,
              { force: true },
            );
            setChapterText(rawText);

            const nextChapterIndex = getNextChapterIndexToPrefetch(
              chapterIndex,
              availableChapterCount,
            );
            const nextChapter = nextChapterIndex
              ? getChapter(db, novelId, nextChapterIndex)
              : null;
            if (nextChapter?.url) {
              void readChapterText(
                nextChapter,
                novel.siteNovelId,
                db,
                novel.siteType,
              )
                .then(() => {
                  console.log(
                    `[Reader] Prefetched chapter ${nextChapter.index}`,
                  );
                })
                .catch((err) => {
                  console.warn(
                    `[Reader] Failed to prefetch chapter ${nextChapter.index}:`,
                    err,
                  );
                });
            }
            setChapterTitle(ch.title || `第${chapterIndex}話`);
          }
        } catch (err: any) {
          console.error(`[Reader] Failed to load chapter:`, err);
          if (isCurrentRequest()) {
            setChapterText(
              `テキストの読み込みに失敗しました\n${err?.message || ""}`,
            );
            setLoadError(true);
          }
        }
      } else {
        if (isCurrentRequest())
          setChapterText("この話はまだダウンロードされていません");
      }

      if (isCurrentRequest()) {
        // Load initial progress for this chapter if available
        const progress = getReadingProgress(db, novelId);
        if (progress && progress.currentChapter === chapterIndex) {
          const savedProgress = clampProgress(progress.scrollPercentage);
          pendingRestoreProgressRef.current = savedProgress;
          setInitialProgress(savedProgress);
        } else {
          pendingRestoreProgressRef.current = 0;
          setInitialProgress(0);
        }
        setLoading(false);
      }
    })().catch((err: any) => {
      console.error("[Reader] Failed to initialize chapter:", err);
      if (isCurrentRequest()) {
        setChapterText(
          `テキストの読み込みに失敗しました\n${err?.message || ""}`,
        );
        setLoadError(true);
        setLoading(false);
      }
      void reportNonFatal(err, {
        feature: "reader_entry",
        operationType: "initialize_chapter",
        errorCategory: "reader_initialization_failure",
        screenName: "reader",
        internalWorkId: novelId,
        retryCount,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [db, novelId, chapterIndex, novel, retryCount]);

  useEffect(() => {
    if (settingsSaveTimeoutRef.current) {
      clearTimeout(settingsSaveTimeoutRef.current);
    }
    settingsSaveTimeoutRef.current = setTimeout(() => {
      saveReaderSettings(db, settings);
    }, 320);
    return () => {
      if (settingsSaveTimeoutRef.current) {
        clearTimeout(settingsSaveTimeoutRef.current);
        settingsSaveTimeoutRef.current = null;
      }
    };
  }, [db, settings]);

  useEffect(() => {
    latestProgressRef.current = null;
    if (progressSaveTimeoutRef.current) {
      clearTimeout(progressSaveTimeoutRef.current);
      progressSaveTimeoutRef.current = null;
    }
  }, [chapterIndex]);

  const readerTheme = useMemo(() => {
    const themes = {
      light: { bg: "#FAF7F2", fg: "#2C2C2C", selection: "rgba(45,95,79,0.2)" },
      dark: { bg: "#1A1A2E", fg: "#E0E0E0", selection: "rgba(45,95,79,0.4)" },
      sepia: {
        bg: "#F5E6C8",
        fg: "#3E2F1C",
        selection: "rgba(194,149,107,0.3)",
      },
    };
    return themes[mode];
  }, [mode]);

  const goNextChapter = useCallback(() => {
    if (chapterIndex < totalChapters) {
      setStartAtLastPage(false);
      setChapterIndex((i) => i + 1);
      return;
    }
    if (!novel || nextChapterCheckingRef.current) return;

    const adapter = getAdapter(novel.siteType);
    if (!adapter) {
      Alert.alert("次の話を確認できません", "この作品のサイトに対応していません");
      return;
    }

    const requestId = ++nextChapterRequestIdRef.current;
    const requestedTarget = { novelId, chapterIndex };
    nextChapterCheckingRef.current = true;
    setCheckingNextChapter(true);
    void adapter
      .getChapterList(novel.siteNovelId)
      .then((chapterList) => {
        const currentTarget = readerTargetRef.current;
        if (
          nextChapterRequestIdRef.current !== requestId ||
          currentTarget.novelId !== requestedTarget.novelId ||
          currentTarget.chapterIndex !== requestedTarget.chapterIndex
        ) {
          return;
        }
        console.log("[ReaderChapterList]", {
          novelId,
          requestedChapter: chapterIndex,
          chapterCount: chapterList.length,
          reason: "next_chapter_boundary",
        });
        const resolution = resolveReaderNextChapter(
          chapterIndex,
          chapterList.length,
        );
        if (resolution.kind === "empty") {
          Alert.alert(
            "話一覧を取得できませんでした",
            "通信状態を確認して、もう一度お試しください",
          );
          return;
        }

        db.withTransactionSync(() => {
          for (const c of chapterList) {
            upsertChapter(db, {
              novelId: novel.id,
              index: c.index,
              title: c.title,
              localPath: null,
              isDownloaded: false,
              url: c.url,
              publishedAt: c.publishedAt,
              revisedAt: c.revisedAt,
            });
          }
        });
        updateNovel(db, novel.id, {
          totalEpisodes: resolution.totalChapters,
          lastCheckedAt: new Date().toISOString(),
        });
        setTotalChapters(resolution.totalChapters);
        setNovel((current) =>
          current?.id === novel.id
            ? { ...current, totalEpisodes: resolution.totalChapters }
            : current,
        );
        if (resolution.kind === "latest") {
          Alert.alert("最新話です", "現在表示している話が最新です");
          return;
        }
        setStartAtLastPage(false);
        setChapterIndex(resolution.chapterIndex);
      })
      .catch((error) => {
        if (nextChapterRequestIdRef.current !== requestId) return;
        console.error("[Reader] Failed to refresh next chapter boundary", error);
        Alert.alert(
          "次の話を確認できませんでした",
          "通信状態を確認して、もう一度お試しください",
        );
      })
      .finally(() => {
        if (nextChapterRequestIdRef.current === requestId) {
          nextChapterCheckingRef.current = false;
          setCheckingNextChapter(false);
        }
      });
  }, [chapterIndex, totalChapters, novel, novelId, db]);

  const goPrevChapter = useCallback(
    (startAtLast = false) => {
      if (chapterIndex > 1) {
        setStartAtLastPage(startAtLast === true);
        setChapterIndex((i) => i - 1);
      }
    },
    [chapterIndex],
  );

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const retryWebViewAfterRendererExit = useCallback(() => {
    setWebViewRenderFailed(false);
    setWebViewInstanceKey((key) => key + 1);
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
      }).start(({ finished }) => {
        if (finished) {
          setIsSettingsVisible(false);
        }
      });
    }
  }, [showSettings, settingsAnim]);

  const updateSetting = useCallback(
    (key: keyof ReaderSettings, value: any) => {
      setSettings((prev) => {
        const updated = { ...prev, [key]: value };

        // Send style update to WebView via postMessage (no reload)
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "update-style",
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
              pageTurnAnimation: updated.pageTurnAnimation,
              showImages: updated.showImages,
            },
          }),
        );

        return updated;
      });
    },
    [],
  );

  // ========================================================
  // HTML content — generated using external service
  // ========================================================
  const htmlContent = useMemo(() => {
    if (loading)
      return '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;"><p>読み込み中...</p></body></html>';
    if (containerLayout.width === 0 || containerLayout.height === 0) return "";

    return generateReaderHtml({
      chapterText: chapterText,
      settings: settingsRef.current,
      containerLayout,
      insets,
      readerTheme,
      startAtLastPage,
      initialProgress,
      rubyTextToHtml,
    });
  }, [
    chapterText,
    readerTheme,
    loading,
    insets,
    containerLayout,
    startAtLastPage,
    initialProgress,
  ]);

  const webViewSource = useMemo(
    () => ({ html: htmlContent, baseUrl: "file:///" }),
    [htmlContent],
  );

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "page-info") {
          const nextPage =
            typeof data.currentPage === "number" ? data.currentPage : 1;
          const nextTotalPages =
            typeof data.totalPages === "number" ? data.totalPages : 1;
          const nextProgress = clampProgress(data.progress);

          const pendingRestore = pendingRestoreProgressRef.current;
          if (pendingRestore !== null) {
            const normalizedRestore = clampProgress(pendingRestore);
            const expectedPage =
              Math.round(
                normalizedRestore * Math.max(0, nextTotalPages - 1),
              ) + 1;
            const restoredProgressMatches =
              Math.abs(nextProgress - normalizedRestore) < 0.000001;

            if (nextPage !== expectedPage || !restoredProgressMatches) {
              webViewRef.current?.injectJavaScript(`
                if (window.__tadayomuRestoreProgress) {
                  window.__tadayomuRestoreProgress(${normalizedRestore});
                }
                true;
              `);
              return;
            }
            pendingRestoreProgressRef.current = null;
          }

          setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
          setTotalPages((prev) =>
            prev === nextTotalPages ? prev : nextTotalPages,
          );

          const flushProgress = (force: boolean) => {
            const latest = latestProgressRef.current;
            if (!latest) return;
            upsertReadingProgressIfChanged(db, novelId, chapterIndex, latest.progress, {
              minIntervalMs: 800,
              minProgressDelta: 0.01,
              force,
            });
          };

          const prevPage = latestProgressRef.current?.page ?? null;
          latestProgressRef.current = { progress: nextProgress, page: nextPage };

          if (prevPage !== null && prevPage !== nextPage) {
            if (progressSaveTimeoutRef.current) {
              clearTimeout(progressSaveTimeoutRef.current);
              progressSaveTimeoutRef.current = null;
            }
            flushProgress(true);
          } else if (!progressSaveTimeoutRef.current) {
            progressSaveTimeoutRef.current = setTimeout(() => {
              progressSaveTimeoutRef.current = null;
              flushProgress(false);
            }, 800);
          }

          if (syncService.isSignedIn() && novel) {
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
            }
            const payload = {
              novelId: novel.id,
              siteNovelId: novel.siteNovelId,
              siteType: novel.siteType,
              currentChapter: chapterIndex,
              scrollPercentage: nextProgress,
              lastReadAt: new Date().toISOString(),
            };
            syncTimeoutRef.current = setTimeout(() => {
              const lastSynced = lastSyncedProgressRef.current;
              if (
                lastSynced &&
                lastSynced.novelId === payload.novelId &&
                lastSynced.chapterIndex === payload.currentChapter &&
                Math.abs(lastSynced.progress - payload.scrollPercentage) < 0.0001
              ) {
                return;
              }

              syncService
                .uploadProgress(payload)
                .then(() => {
                  lastSyncedProgressRef.current = {
                    novelId: payload.novelId,
                    chapterIndex: payload.currentChapter,
                    progress: payload.scrollPercentage,
                  };
                })
                .catch((err) => {
                  console.error("[Sync] uploadProgress failed", err);
                });
            }, 5000);
          }
        } else if (data.type === "next") {
          goNextChapter();
        } else if (data.type === "prev") {
          goPrevChapter(true);
        } else if (data.type === "toggle-toolbar") {
          toggleToolbar();
        } else if (data.type === "expand-image") {
          setZoomedImage(data.url);
        } else if (data.type === "log") {
          console.log("[WebView]", data.message);
        }
      } catch (err) {
        console.warn("[Reader] Failed to handle WebView message", err);
      }
    },
    [db, novelId, chapterIndex, goNextChapter, goPrevChapter, toggleToolbar, novel],
  );

  const getLatestRestorableProgress = useCallback(() => {
    const latest = latestProgressRef.current;
    if (latest) return clampProgress(latest.progress);

    const saved = getReadingProgress(db, novelId);
    if (saved && saved.currentChapter === chapterIndex) {
      return clampProgress(saved.scrollPercentage);
    }
    return 0;
  }, [db, novelId, chapterIndex]);

  const restoreWebViewProgress = useCallback((progress: number) => {
    const normalizedProgress = clampProgress(progress);
    pendingRestoreProgressRef.current = normalizedProgress;
    webViewRef.current?.injectJavaScript(`
      if (window.__tadayomuRestoreProgress) {
        window.__tadayomuRestoreProgress(${normalizedProgress});
      }
      true;
    `);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        flushLatestProgress();
        return;
      }

      restoreWebViewProgress(getLatestRestorableProgress());
    });

    return () => {
      flushLatestProgress();
      subscription.remove();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      if (settingsSaveTimeoutRef.current) {
        clearTimeout(settingsSaveTimeoutRef.current);
      }
      if (progressSaveTimeoutRef.current) {
        clearTimeout(progressSaveTimeoutRef.current);
      }
    };
  }, [
    flushLatestProgress,
    getLatestRestorableProgress,
    restoreWebViewProgress,
  ]);

  const settingsTranslateY = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <View style={styles.container}>
      <StatusBar hidden={settings.fullscreen} style={mode === 'dark' ? 'light' : 'dark'} />

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
        <TouchableOpacity
          onPress={handleCloseReader}
          style={styles.toolbarBtn}
        >
          <Ionicons name="arrow-back" size={20} color={readerTheme.fg} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => goPrevChapter(false)}
          style={styles.toolbarBtn}
          disabled={chapterIndex <= 1}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={chapterIndex > 1 ? readerTheme.fg : readerTheme.fg + "44"}
          />
        </TouchableOpacity>
        <Text
          style={[styles.chapterLabel, { color: readerTheme.fg }]}
          numberOfLines={1}
        >
          {chapterIndex} / {totalChapters}
          {chapterTitle ? `　${chapterTitle}` : ""}
        </Text>
        <Text
          style={[styles.pageLabel, { color: readerTheme.fg }]}
          numberOfLines={1}
        >
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
        <TouchableOpacity
          onPress={goNextChapter}
          style={styles.toolbarBtn}
          disabled={checkingNextChapter}
        >
          <Ionicons
            name={checkingNextChapter ? "sync" : "chevron-forward"}
            size={18}
            color={
              !checkingNextChapter
                ? readerTheme.fg
                : readerTheme.fg + "44"
            }
          />
        </TouchableOpacity>
      </View>

      {/* WebView fills remaining space — onLayout measures final size */}
      <View style={styles.webviewFull} onLayout={onLayout}>
        {webViewRenderFailed ? (
          <View
            style={[
              styles.webViewError,
              { backgroundColor: readerTheme.bg },
            ]}
          >
            <Ionicons
              name="warning-outline"
              size={28}
              color={readerTheme.fg}
            />
            <Text style={[styles.webViewErrorText, { color: readerTheme.fg }]}>
              表示処理が終了しました。再読み込みしてください。
            </Text>
            <TouchableOpacity
              style={[
                styles.webViewRetryButton,
                { borderColor: readerTheme.fg + "40" },
              ]}
              onPress={retryWebViewAfterRendererExit}
            >
              <Text style={{ color: readerTheme.fg }}>再読み込み</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            key={webViewInstanceKey}
            ref={webViewRef}
            originWhitelist={["*"]}
            source={webViewSource}
            style={{ flex: 1, backgroundColor: readerTheme.bg }}
            onLoadStart={() => {
              pendingRestoreProgressRef.current = getLatestRestorableProgress();
            }}
            onLoadEnd={() => {
              restoreWebViewProgress(getLatestRestorableProgress());
            }}
            onMessage={handleMessage}
            onRenderProcessGone={(event) => {
              const didCrash = event.nativeEvent.didCrash;
              setWebViewRenderFailed(true);
              void reportNonFatal(
                new Error(
                  didCrash
                    ? "Android WebView render process crashed"
                    : "Android WebView render process was killed by the OS",
                ),
                {
                  feature: "reader_webview",
                  operationType: "render_process_exit",
                  errorCategory: didCrash
                    ? "webview_renderer_crash"
                    : "webview_renderer_os_kill",
                  screenName: "reader",
                  internalWorkId: novelId,
                  didCrash,
                  retryCount,
                },
              );
            }}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            textZoom={100}
            javaScriptEnabled
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
          />
        )}
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
            {
              backgroundColor: readerTheme.bg,
              transform: [{ translateY: settingsTranslateY }],
            },
          ]}
        >
          <View style={styles.settingsHandle} />

          {/* Font Family */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              フォント
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.fontFamily === "serif" && {
                    backgroundColor: readerTheme.fg + "15",
                  },
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() => updateSetting("fontFamily", "serif")}
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  明朝
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.fontFamily === "sans-serif" && {
                    backgroundColor: readerTheme.fg + "15",
                  },
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() => updateSetting("fontFamily", "sans-serif")}
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  ゴシック
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Font Size */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              文字サイズ
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting("fontSize", Math.max(12, settings.fontSize - 1))
                }
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  A-
                </Text>
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>
                {settings.fontSize}px
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting("fontSize", Math.min(32, settings.fontSize + 1))
                }
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  A+
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Side Margins (left/right) */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              左右余白
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting("margin", Math.max(4, settings.margin - 4))
                }
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>
                {settings.margin}px
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting("margin", Math.min(48, settings.margin + 4))
                }
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Top Margin */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              上余白
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "marginTop",
                    Math.max(0, settings.marginTop - 4),
                  )
                }
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>
                {settings.marginTop}px
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "marginTop",
                    Math.min(60, settings.marginTop + 4),
                  )
                }
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Margin */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              下余白
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "marginBottom",
                    Math.max(0, settings.marginBottom - 4),
                  )
                }
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>
                {settings.marginBottom}px
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "marginBottom",
                    Math.min(80, settings.marginBottom + 4),
                  )
                }
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Line Height */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              行間
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "lineHeight",
                    Math.max(
                      1.0,
                      Math.round((settings.lineHeight - 0.1) * 10) / 10,
                    ),
                  )
                }
              >
                <Ionicons name="remove" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
              <Text style={[styles.settingValue, { color: readerTheme.fg }]}>
                {settings.lineHeight.toFixed(1)}
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingBtn,
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() =>
                  updateSetting(
                    "lineHeight",
                    Math.min(
                      2.5,
                      Math.round((settings.lineHeight + 0.1) * 10) / 10,
                    ),
                  )
                }
              >
                <Ionicons name="add" size={16} color={readerTheme.fg} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Paragraph Spacing */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              段落間隔
            </Text>
            <View style={styles.settingControls}>
              {[
                { label: "詰める", value: 0.3 },
                { label: "標準", value: 0.5 },
                { label: "広め", value: 1.0 },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.modeBtn,
                    settings.paragraphSpacing === opt.value && {
                      backgroundColor: readerTheme.fg + "15",
                    },
                    { borderColor: readerTheme.fg + "30" },
                  ]}
                  onPress={() => updateSetting("paragraphSpacing", opt.value)}
                >
                  <Text
                    style={[styles.settingBtnText, { color: readerTheme.fg }]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Writing Mode Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              組方向
            </Text>
            <View style={styles.settingControls}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.writingMode === "vertical" && {
                    backgroundColor: readerTheme.fg + "15",
                  },
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() => updateSetting("writingMode", "vertical")}
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  縦書き
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  settings.writingMode === "horizontal" && {
                    backgroundColor: readerTheme.fg + "15",
                  },
                  { borderColor: readerTheme.fg + "30" },
                ]}
                onPress={() => updateSetting("writingMode", "horizontal")}
              >
                <Text
                  style={[styles.settingBtnText, { color: readerTheme.fg }]}
                >
                  横書き
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reverse Page Direction Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              ページ送り 左右反転
            </Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: settings.reversePageDirection
                    ? readerTheme.fg + "20"
                    : "transparent",
                  borderColor: readerTheme.fg + "30",
                },
              ]}
              onPress={() =>
                updateSetting(
                  "reversePageDirection",
                  !settings.reversePageDirection,
                )
              }
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.reversePageDirection ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Page Turn Animation Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              ページ送りアニメーション
            </Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: settings.pageTurnAnimation
                    ? readerTheme.fg + "20"
                    : "transparent",
                  borderColor: readerTheme.fg + "30",
                },
              ]}
              onPress={() =>
                updateSetting("pageTurnAnimation", !settings.pageTurnAnimation)
              }
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.pageTurnAnimation ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Show Images Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              挿絵表示
            </Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: settings.showImages
                    ? readerTheme.fg + "20"
                    : "transparent",
                  borderColor: readerTheme.fg + "30",
                },
              ]}
              onPress={() => updateSetting("showImages", !settings.showImages)}
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.showImages ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fullscreen Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: readerTheme.fg }]}>
              全画面 (時計非表示)
            </Text>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: settings.fullscreen
                    ? readerTheme.fg + "20"
                    : "transparent",
                  borderColor: readerTheme.fg + "30",
                },
              ]}
              onPress={() => updateSetting("fullscreen", !settings.fullscreen)}
            >
              <Text style={[styles.settingBtnText, { color: readerTheme.fg }]}>
                {settings.fullscreen ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Image Zoom Modal */}
      <Modal
        visible={!!zoomedImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomedImage(null)}
      >
        <TouchableWithoutFeedback onPress={() => setZoomedImage(null)}>
          <View style={styles.zoomedImageContainer}>
            {zoomedImage && (
              <Image
                source={{ uri: zoomedImage }}
                style={styles.zoomedImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.closeZoomBtn}
              onPress={() => setZoomedImage(null)}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webviewFull: { flex: 1 },
  webViewError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  webViewErrorText: {
    fontSize: 14,
    textAlign: "center",
  },
  webViewRetryButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
    paddingHorizontal: Spacing.xs,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  chapterLabel: {
    flex: 1,
    textAlign: "center",
    ...Typography.caption,
    fontWeight: "600",
  },
  pageLabel: {
    textAlign: "center",
    ...Typography.caption,
    fontWeight: "500",
    opacity: 0.6,
    minWidth: 44,
  },

  // Settings overlay
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  settingsPanel: {
    position: "absolute",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  settingsHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(128,128,128,0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  settingControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settingBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  settingBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  settingValue: {
    fontSize: 13,
    fontWeight: "500",
    minWidth: 40,
    textAlign: "center",
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
  // Fullscreen Zoom
  zoomedImageContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomedImage: {
    width: "100%",
    height: "100%",
  },
  closeZoomBtn: {
    position: "absolute",
    top: 40,
    right: 20,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 24,
  },
});
