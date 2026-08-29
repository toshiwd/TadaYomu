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
import { getReaderFontFaces, type ReaderFontFace } from "../services/fontManager";
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
import {
  createReaderProgressSnapshot,
  isReaderProgressForChapter,
  normalizeReaderProgress,
  normalizeReaderPositionAnchor,
  shouldProcessReaderPageInfo,
  type ReaderPositionAnchor,
  type ReaderProgressSnapshot,
} from "../services/readerProgress";
export default function ReaderScreen({
  navigation,
  route,
}: RootStackScreenProps<"Reader">) {
  const { mode } = useTheme();
  const db = useSQLiteContext();
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  useKeepAwake("tadayomu-reader");

  const novelId = route.params.novelId;
  const initialChapter = normalizeReaderChapterIndex(route.params.chapterIndex);
  const loadRequestIdRef = useRef(0);
  const nextChapterRequestIdRef = useRef(0);
  const nextChapterCheckingRef = useRef(false);

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
  const [initialPositionAnchor, setInitialPositionAnchor] = useState<ReaderPositionAnchor | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(() =>
    getReaderSettings(db),
  );
  const [readerFontFaces, setReaderFontFaces] = useState<ReaderFontFace[]>(() =>
    getReaderFontFaces(getReaderSettings(db).fontFamily),
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

  useEffect(() => () => {
    nextChapterRequestIdRef.current += 1;
    nextChapterCheckingRef.current = false;
  }, []);

  // Keep a ref to settings so htmlContent doesn't depend on it
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    setReaderFontFaces(getReaderFontFaces(settings.fontFamily));
  }, [settings.fontFamily]);

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
  const appResumeRestoreTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const appStateRef = useRef(AppState.currentState);
  const latestProgressRef = useRef<ReaderProgressSnapshot | null>(null);
  const latestTotalPagesRef = useRef(1);
  const backgroundRestorePositionRef = useRef<{
    progress: number;
    positionAnchor: ReaderPositionAnchor | null;
    resumePage?: number;
    resumeTotalPages?: number;
  } | null>(null);
  const pendingRestoreRef = useRef<{
    progress: number;
    positionAnchor: ReaderPositionAnchor | null;
    resumePage?: number;
    resumeTotalPages?: number;
  } | null>(null);
  const lastSyncedProgressRef = useRef<{
    novelId: number;
    chapterIndex: number;
    progress: number;
    anchorKey: string;
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
    upsertReadingProgressIfChanged(
      db,
      latest.novelId,
      latest.chapterIndex,
      latest.progress,
      { force: true, positionAnchor: latest.positionAnchor },
    );
  }, [db]);

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
    setChapterIndex(normalizedChapterIndex);
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
            const resolution = resolveReaderChapterList(
              chapterIndex,
              chapterList.length,
            );
            if (resolution.kind === "empty") {
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
            if (resolution.changed) {
              setChapterIndex(resolution.chapterIndex);
              return;
            }
            ch = getChapter(db, novelId, resolution.chapterIndex);
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
            const openedChapterProgress = startAtLastPage
              ? 1
              : savedProgress?.currentChapter === chapterIndex
                ? savedProgress.scrollPercentage
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
        if (startAtLastPage) {
          pendingRestoreRef.current = { progress: 1, positionAnchor: null };
          setInitialProgress(1);
          setInitialPositionAnchor(null);
        } else if (progress && progress.currentChapter === chapterIndex) {
          const positionAnchor = normalizeReaderPositionAnchor(progress.positionAnchor);
          pendingRestoreRef.current = {
            progress: progress.scrollPercentage,
            positionAnchor,
          };
          setInitialProgress(progress.scrollPercentage);
          setInitialPositionAnchor(positionAnchor);
        } else {
          pendingRestoreRef.current = { progress: 0, positionAnchor: null };
          setInitialProgress(0);
          setInitialPositionAnchor(null);
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
    });

    return () => {
      cancelled = true;
    };
  }, [db, novelId, chapterIndex, novel, retryCount, startAtLastPage]);

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
      flushLatestProgress();
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
    void adapter.getChapterList(novel.siteNovelId).then((chapterList) => {
      const currentTarget = readerTargetRef.current;
      if (
        nextChapterRequestIdRef.current !== requestId ||
        currentTarget.novelId !== requestedTarget.novelId ||
        currentTarget.chapterIndex !== requestedTarget.chapterIndex
      ) return;

      console.log("[ReaderChapterList]", {
        novelId,
        requestedChapter: chapterIndex,
        chapterCount: chapterList.length,
        reason: "next_chapter_boundary",
      });
      const resolution = resolveReaderNextChapter(chapterIndex, chapterList.length);
      if (resolution.kind === "empty") {
        Alert.alert("話一覧を取得できませんでした", "通信状態を確認して、もう一度お試しください");
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
      setNovel((current) => current?.id === novel.id
        ? { ...current, totalEpisodes: resolution.totalChapters }
        : current);
      if (resolution.kind === "latest") {
        Alert.alert("最新話です", "現在表示している話が最新です");
        return;
      }
      flushLatestProgress();
      setStartAtLastPage(false);
      setChapterIndex(resolution.chapterIndex);
    }).catch((error) => {
      if (nextChapterRequestIdRef.current !== requestId) return;
      console.error("[Reader] Failed to refresh next chapter boundary", error);
      Alert.alert("次の話を確認できませんでした", "通信状態を確認して、もう一度お試しください");
    }).finally(() => {
      if (nextChapterRequestIdRef.current === requestId) {
        nextChapterCheckingRef.current = false;
        setCheckingNextChapter(false);
      }
    });
  }, [chapterIndex, db, flushLatestProgress, novel, novelId, totalChapters]);

  const goPrevChapter = useCallback(
    (startAtLast = false) => {
      if (chapterIndex > 1) {
        flushLatestProgress();
        setStartAtLastPage(startAtLast === true);
        setChapterIndex((i) => i - 1);
      }
    },
    [chapterIndex, flushLatestProgress],
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
      const updated = { ...settingsRef.current, [key]: value };
      settingsRef.current = updated;
      setSettings(updated);
      if (key === "fontFamily") {
        setReaderFontFaces(getReaderFontFaces(String(value)));
        setWebViewInstanceKey((current) => current + 1);
      }

      // Keep the WebView side effect outside the state updater. React may
      // evaluate an updater more than once, but posting a style update is not
      // a pure state calculation.
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
    },
    [],
  );

  // ========================================================
  // HTML content — generated using external service
  // ========================================================
  const readerDocumentId = `${novelId}:${chapterIndex}:${retryCount}:${webViewInstanceKey}:${Math.round(containerLayout.width)}x${Math.round(containerLayout.height)}`;

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
      documentId: readerDocumentId,
      startAtLastPage,
      initialProgress,
      initialPositionAnchor,
      fontFaces: readerFontFaces,
      rubyTextToHtml,
    });
  }, [
    chapterText,
    readerTheme,
    loading,
    insets,
    containerLayout,
    readerDocumentId,
    startAtLastPage,
    initialProgress,
    initialPositionAnchor,
    readerFontFaces,
  ]);

  const webViewSource = useMemo(
    () => ({ html: htmlContent, baseUrl: "file:///" }),
    [htmlContent],
  );

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.documentId !== readerDocumentId) return;
        if (data.type === "page-info") {
          if (!shouldProcessReaderPageInfo(appStateRef.current)) return;
          const nextPage =
            typeof data.currentPage === "number" ? data.currentPage : 1;
          const nextTotalPages =
            typeof data.totalPages === "number" ? data.totalPages : 1;
          const nextProgress = normalizeReaderProgress(data.progress);
          const nextPositionAnchor = normalizeReaderPositionAnchor(data.positionAnchor);
          latestTotalPagesRef.current = nextTotalPages;

          const pendingRestore = pendingRestoreRef.current;
          if (pendingRestore !== null) {
            const expectedPage =
              Math.round(
                Math.max(0, Math.min(pendingRestore.progress, 1)) *
                  Math.max(0, nextTotalPages - 1),
              ) + 1;
            const anchorRestored =
              pendingRestore.positionAnchor !== null &&
              data.restoreSource === "anchor" &&
              data.restoredAnchorHash === pendingRestore.positionAnchor.contextHash;
            const exactResumePageRestored =
              data.restoreSource === "resume-page" &&
              pendingRestore.resumePage === nextPage &&
              pendingRestore.resumeTotalPages === nextTotalPages;

            if (!anchorRestored && !exactResumePageRestored && nextPage !== expectedPage) {
              webViewRef.current?.injectJavaScript(`
                if (window.__tadayomuRestorePositionForResume) {
                  window.__tadayomuRestorePositionForResume(${JSON.stringify(pendingRestore.positionAnchor)}, ${pendingRestore.progress}, ${JSON.stringify(pendingRestore.resumePage)}, ${JSON.stringify(pendingRestore.resumeTotalPages)});
                }
                true;
              `);
              return;
            }
            pendingRestoreRef.current = null;
            backgroundRestorePositionRef.current = null;
          }

          setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
          setTotalPages((prev) =>
            prev === nextTotalPages ? prev : nextTotalPages,
          );

          const flushProgress = (force: boolean) => {
            const latest = latestProgressRef.current;
            if (!isReaderProgressForChapter(latest, novelId, chapterIndex)) return;
            upsertReadingProgressIfChanged(
              db,
              latest.novelId,
              latest.chapterIndex,
              latest.progress,
              {
                minIntervalMs: 800,
                minProgressDelta: 0.001,
                force,
                positionAnchor: latest.positionAnchor,
              },
            );
          };

          const previous = latestProgressRef.current;
          const prevPage = isReaderProgressForChapter(
            previous,
            novelId,
            chapterIndex,
          )
            ? previous.page
            : null;
          const nextSnapshot = createReaderProgressSnapshot(
            novelId,
            chapterIndex,
            nextProgress,
            nextPage,
            nextPositionAnchor,
          );
          if (!nextSnapshot) return;
          latestProgressRef.current = nextSnapshot;

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
              positionAnchor: nextPositionAnchor,
              lastReadAt: new Date().toISOString(),
            };
            syncTimeoutRef.current = setTimeout(() => {
              const lastSynced = lastSyncedProgressRef.current;
              if (
                lastSynced &&
                lastSynced.novelId === payload.novelId &&
                lastSynced.chapterIndex === payload.currentChapter &&
                Math.abs(lastSynced.progress - payload.scrollPercentage) < 0.0001 &&
                lastSynced.anchorKey === JSON.stringify(payload.positionAnchor)
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
                    anchorKey: JSON.stringify(payload.positionAnchor),
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
    [
      db,
      novelId,
      chapterIndex,
      goNextChapter,
      goPrevChapter,
      toggleToolbar,
      novel,
      readerDocumentId,
    ],
  );

  const getLatestRestorablePosition = useCallback(() => {
    const latest = latestProgressRef.current;
    if (isReaderProgressForChapter(latest, novelId, chapterIndex)) {
      return { progress: latest.progress, positionAnchor: latest.positionAnchor };
    }

    if (startAtLastPage) return { progress: 1, positionAnchor: null };

    const saved = getReadingProgress(db, novelId);
    if (saved && saved.currentChapter === chapterIndex) {
      return {
        progress: normalizeReaderProgress(saved.scrollPercentage),
        positionAnchor: normalizeReaderPositionAnchor(saved.positionAnchor),
      };
    }
    return { progress: 0, positionAnchor: null };
  }, [db, novelId, chapterIndex, startAtLastPage]);

  const restoreWebViewPosition = useCallback((position: {
    progress: number;
    positionAnchor: ReaderPositionAnchor | null;
    resumePage?: number;
    resumeTotalPages?: number;
  }) => {
    const normalizedProgress = normalizeReaderProgress(position.progress);
    const normalizedAnchor = normalizeReaderPositionAnchor(position.positionAnchor);
    pendingRestoreRef.current = {
      progress: normalizedProgress,
      positionAnchor: normalizedAnchor,
      resumePage: position.resumePage,
      resumeTotalPages: position.resumeTotalPages,
    };
    webViewRef.current?.injectJavaScript(`
      if (window.__tadayomuRestorePositionForResume) {
        window.__tadayomuRestorePositionForResume(${JSON.stringify(normalizedAnchor)}, ${normalizedProgress}, ${JSON.stringify(position.resumePage)}, ${JSON.stringify(position.resumeTotalPages)});
      }
      true;
    `);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        if (appStateRef.current === "active") {
          const positionBeforeScreenOff = getLatestRestorablePosition();
          const latest = latestProgressRef.current;
          const positionForResume = isReaderProgressForChapter(
            latest,
            novelId,
            chapterIndex,
          )
            ? {
                ...positionBeforeScreenOff,
                resumePage: latest.page,
                resumeTotalPages: latestTotalPagesRef.current,
              }
            : positionBeforeScreenOff;
          backgroundRestorePositionRef.current = positionForResume;
          pendingRestoreRef.current = positionForResume;
          flushLatestProgress();
        }
        appStateRef.current = nextState;
        return;
      }

      appStateRef.current = nextState;
      const positionToRestore =
        backgroundRestorePositionRef.current ?? getLatestRestorablePosition();
      backgroundRestorePositionRef.current = positionToRestore;
      restoreWebViewPosition(positionToRestore);

      for (const timeout of appResumeRestoreTimeoutsRef.current) {
        clearTimeout(timeout);
      }
      appResumeRestoreTimeoutsRef.current = [150, 500].map((delay) =>
        setTimeout(() => {
          const pendingPosition = backgroundRestorePositionRef.current;
          if (pendingPosition) restoreWebViewPosition(pendingPosition);
        }, delay),
      );
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
      for (const timeout of appResumeRestoreTimeoutsRef.current) {
        clearTimeout(timeout);
      }
      appResumeRestoreTimeoutsRef.current = [];
    };
  }, [
    chapterIndex,
    flushLatestProgress,
    getLatestRestorablePosition,
    novelId,
    restoreWebViewPosition,
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
          <View style={styles.webViewErrorState}>
            <Ionicons name="refresh-circle-outline" size={38} color={readerTheme.fg} />
            <Text style={[styles.webViewErrorText, { color: readerTheme.fg }]}>
              表示処理が終了しました。読書位置を保ったまま再読み込みできます。
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
              pendingRestoreRef.current = getLatestRestorablePosition();
            }}
            onLoadEnd={() => {
              restoreWebViewPosition(getLatestRestorablePosition());
            }}
            onMessage={handleMessage}
            onRenderProcessGone={() => {
              flushLatestProgress();
              setWebViewRenderFailed(true);
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
  webViewErrorState: {
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
