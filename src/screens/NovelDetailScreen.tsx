import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ToastAndroid,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeContext";
import { Spacing, Typography, Radius } from "../theme/colors";
import type { RootStackScreenProps } from "../navigation/types";
import type { Novel, Chapter } from "../types/novel";
import {
  getNovelById,
  getChaptersByNovelId,
  getReadingProgress,
  deleteNovel,
  countDownloadedChapters,
  updateNovel,
  upsertReadingProgress,
  upsertChapter,
} from "../database/repository";
import {
  deleteNovelData,
  downloadSingleChapter,
} from "../services/downloadManager";
import { getAdapter } from "../services/siteAdapter";
import {
  useBulkDownloadProgress,
  startDownload as startGlobalDownload,
  cancelDownload as cancelGlobalDownload,
  type BulkDownloadState,
} from "../services/bulkDownloadStore";
import { syncService } from "../services/syncService";

export default function NovelDetailScreen({
  route,
  navigation,
}: RootStackScreenProps<"NovelDetail">) {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const novelId = route.params.novelId;

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [fetchingChapters, setFetchingChapters] = useState(false);

  const storeProgress = useBulkDownloadProgress(novelId);
  const bulkState: BulkDownloadState = storeProgress?.state ?? "idle";
  const bulkProgress = storeProgress
    ? { downloaded: storeProgress.downloaded, total: storeProgress.total }
    : { downloaded: 0, total: 0 };
  const bulkPercent = useMemo(() => {
    if (!bulkProgress.total) return 0;
    return Math.max(
      0,
      Math.min(100, (bulkProgress.downloaded / bulkProgress.total) * 100),
    );
  }, [bulkProgress.downloaded, bulkProgress.total]);

  const showToast = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert("", msg);
    }
  };

  const fetchChapterList = useCallback(
    async (n: Novel) => {
      const adapter = getAdapter(n.siteType);
      if (!adapter) return;

      setFetchingChapters(true);
      try {
        const chapterList = await adapter.getChapterList(n.siteNovelId);
        db.withTransactionSync(() => {
          for (const ch of chapterList) {
            upsertChapter(db, {
              novelId: n.id,
              index: ch.index,
              title: ch.title,
              localPath: null,
              isDownloaded: false,
              url: ch.url,
              publishedAt: ch.publishedAt,
              revisedAt: ch.revisedAt,
            });
          }
        });
        updateNovel(db, n.id, {
          totalEpisodes: chapterList.length,
          lastCheckedAt: new Date().toISOString(),
        });
        setChapters(getChaptersByNovelId(db, n.id));
        setNovel(getNovelById(db, n.id));
      } catch (err: any) {
        console.error("Failed to fetch chapter list", err);
        Alert.alert(
          "目次取得失敗",
          `作品情報の更新に失敗しました。\n${err?.message || "ネットワークエラー"}`
        );
      } finally {
        setFetchingChapters(false);
      }
    },
    [db],
  );

  const loadData = useCallback(() => {
    const n = getNovelById(db, novelId);
    setNovel(n);
    if (!n) return;

    const localChapters = getChaptersByNovelId(db, novelId);
    setChapters(localChapters);
    if (n.url) {
      fetchChapterList(n);
    }

    const progress = getReadingProgress(db, novelId);
    if (progress) setCurrentChapter(progress.currentChapter);

    if (syncService.isSignedIn()) {
      syncService
        .downloadProgress(n.siteNovelId, n.siteType)
        .then((remoteProgress) => {
          if (!remoteProgress) return;
          const localTime = progress ? new Date(progress.lastReadAt).getTime() : 0;
          const remoteTime = new Date(remoteProgress.lastReadAt).getTime();
          if (remoteTime > localTime) {
            setCurrentChapter(remoteProgress.currentChapter);
            upsertReadingProgress(
              db,
              novelId,
              remoteProgress.currentChapter,
              remoteProgress.scrollPercentage,
            );
          }
        })
        .catch((err) => {
          console.error("Failed to download cloud progress", err);
        });
    }
  }, [db, novelId, fetchChapterList]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleBulkDownload = async () => {
    if (!novel || bulkState === "running") return;
    try {
      // Always fetch the latest chapter list before starting bulk download
      if (novel.url) {
        await fetchChapterList(novel);
      }
      // Re-read latest chapter data from DB after fetch
      const freshNovel = getNovelById(db, novel.id);
      if (!freshNovel) return;

      const networkState = await Network.getNetworkStateAsync();
      const freshChapters = getChaptersByNovelId(db, novel.id);
      const end = Math.min(freshChapters.length, currentChapter + 50);
      const pending = freshChapters.filter(
        (ch) =>
          ch.index > currentChapter &&
          ch.index <= end &&
          !ch.isDownloaded &&
          Boolean(ch.url),
      );

      if (
        networkState.type !== Network.NetworkStateType.WIFI &&
        pending.length > 20
      ) {
        Alert.alert(
          "モバイル通信での一括DL",
          `${pending.length}話のダウンロードを開始します。続行しますか？`,
          [
            { text: "キャンセル", style: "cancel" },
            {
              text: "続行",
              style: "destructive",
              onPress: () => startGlobalDownload(db, freshNovel),
            },
          ],
        );
        return;
      }
      startGlobalDownload(db, freshNovel);
    } catch (err) {
      console.error("Failed to start bulk download", err);
    }
  };

  const handleCancelBulk = () => {
    if (!novel) return;
    cancelGlobalDownload(novel.id);
    showToast("一括ダウンロードを中止しました");
  };

  const handleToggleArchive = () => {
    if (!novel) return;
    const isArchived = !novel.isArchived;
    updateNovel(db, novel.id, { isArchived });
    showToast(isArchived ? "アーカイブに移動しました" : "本棚に戻しました");
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert("作品を削除", "この作品を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          if (!novel) return;
          cancelGlobalDownload(novel.id);
          deleteNovelData(novel.siteNovelId);
          deleteNovel(db, novel.id);
          if (syncService.isSignedIn()) {
            syncService
              .deleteNovelFromLibrary(novel.siteType, novel.siteNovelId)
              .catch(console.error);
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const handleOpenWeb = () => {
    if (!novel?.url) return;
    let domain = `${novel.siteType}.syosetu.com`;
    if (novel.siteType === "syosetu") domain = "ncode.syosetu.com";
    else if (
      novel.siteType === "nocturne" ||
      novel.siteType === "moonlight" ||
      novel.siteType === "midnight"
    ) {
      domain = "novel18.syosetu.com";
    } else if (novel.siteType === "kakuyomu") domain = "kakuyomu.jp";
    else if (novel.siteType === "hameln") domain = "syosetu.org";

    navigation.navigate("SiteBrowser", {
      siteDomain: domain,
      siteName: "Web",
      url: novel.url,
    });
  };

  const handleContinueReading = () => {
    navigation.navigate("Reader", { novelId, chapterIndex: currentChapter });
  };

  const handleDownloadChapter = async (chapter: Chapter) => {
    if (!novel || downloadingIndex !== null) return;
    setDownloadingIndex(chapter.index);
    try {
      await downloadSingleChapter(db, chapter, novel.siteNovelId, novel.siteType);
      const downloaded = countDownloadedChapters(db, novel.id);
      updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
      loadData();
    } catch (err: any) {
      Alert.alert("ダウンロード失敗", err?.message || "通信エラー");
    } finally {
      setDownloadingIndex(null);
    }
  };

  const displayChapters = useMemo(
    () => (sortOrder === "desc" ? [...chapters].reverse() : chapters),
    [chapters, sortOrder],
  );

  if (!novel) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text.disabled }]}>
          作品が見つかりません
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, paddingTop: insets.top + Spacing.xs },
        ]}
      >
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>
          {novel.title}
        </Text>
        <View style={styles.authorRow}>
          <Text style={[styles.author, { color: colors.text.secondary }]} numberOfLines={1}>
            {novel.author}
          </Text>
          <Text style={[styles.meta, { color: colors.text.disabled }]}>
            {novel.downloadedEpisodes}/{novel.totalEpisodes}話 DL
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: colors.ui.primary }]}
            onPress={handleContinueReading}
            activeOpacity={0.8}
          >
            <Ionicons name="book" size={14} color="#FFF" />
            <Text style={styles.continueText}>
              {currentChapter > 1 ? `第${currentChapter}話から` : "読む"}
            </Text>
          </TouchableOpacity>
          <View style={styles.actionIcons}>
            {novel.url ? (
              <TouchableOpacity
                style={[styles.iconButton, { borderColor: colors.ui.primary }]}
                onPress={handleOpenWeb}
              >
                <Ionicons name="globe-outline" size={14} color={colors.ui.primary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.iconButton,
                {
                  borderColor: novel.isArchived
                    ? colors.ui.success
                    : colors.text.secondary,
                },
              ]}
              onPress={handleToggleArchive}
            >
              <Ionicons
                name={novel.isArchived ? "folder-open-outline" : "archive-outline"}
                size={14}
                color={novel.isArchived ? colors.ui.success : colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { borderColor: colors.ui.error }]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={14} color={colors.ui.error} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {bulkState === "running" && (
        <View style={[styles.bulkFixedBar, { backgroundColor: colors.surface }]}>
          <View style={styles.bulkFixedInfo}>
            <ActivityIndicator size="small" color={colors.ui.primary} />
            <Text style={[styles.bulkFixedText, { color: colors.text.primary }]}>
              一括DL中 {bulkProgress.downloaded}/{bulkProgress.total}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.bulkCancelBtn, { borderColor: colors.ui.error }]}
            onPress={handleCancelBulk}
          >
            <Text style={[styles.bulkCancelText, { color: colors.ui.error }]}>中止</Text>
          </TouchableOpacity>
          <View style={[styles.bulkTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.bulkFill,
                { backgroundColor: colors.ui.primary, width: `${bulkPercent}%` },
              ]}
            />
          </View>
        </View>
      )}

      {novel.synopsis ? (
        <TouchableOpacity
          style={styles.synopsisSection}
          onPress={() => setIsSynopsisExpanded((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.synopsisHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              あらすじ
            </Text>
            <Ionicons
              name={isSynopsisExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.text.secondary}
            />
          </View>
          <Text
            style={[styles.synopsis, { color: colors.text.secondary }]}
            numberOfLines={isSynopsisExpanded ? undefined : 3}
          >
            {novel.synopsis}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.chapterHeader}>
        <View style={styles.chapterHeaderLeft}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
            目次 ({fetchingChapters ? "取得中..." : `${chapters.length}話`})
          </Text>
          {fetchingChapters && (
            <ActivityIndicator size="small" color={colors.ui.primary} />
          )}
          <TouchableOpacity
            style={[styles.sortBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
          >
            <Ionicons
              name="swap-vertical"
              size={12}
              color={colors.text.secondary}
            />
            <Text style={[styles.sortBtnText, { color: colors.text.secondary }]}>
              {sortOrder === "desc" ? "降順" : "昇順"}
            </Text>
          </TouchableOpacity>
        </View>
        {bulkState !== "running" && (
          <TouchableOpacity
            style={[styles.bulkBtn, { backgroundColor: colors.ui.primary }]}
            onPress={handleBulkDownload}
          >
            <Ionicons name="download-outline" size={14} color="#FFF" />
            <Text style={[styles.bulkBtnText, { color: "#FFF" }]}>一括DL</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={displayChapters}
        keyExtractor={(item) => String(item.id ?? item.index)}
        contentContainerStyle={styles.chapterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.chapterRow,
              {
                backgroundColor:
                  item.index === currentChapter ? colors.surfaceAlt : "transparent",
              },
            ]}
            onPress={() =>
              navigation.navigate("Reader", {
                novelId,
                chapterIndex: item.index,
              })
            }
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chapterIndex,
                {
                  color: item.isDownloaded
                    ? colors.text.disabled
                    : colors.text.disabled + "66",
                },
              ]}
            >
              {item.index}
            </Text>
            <Text
              style={[
                styles.chapterTitle,
                {
                  color: item.isDownloaded
                    ? colors.text.primary
                    : colors.text.disabled,
                },
              ]}
              numberOfLines={1}
            >
              {item.title || `第${item.index}話`}
            </Text>
            <View style={styles.chapterDates}>
              {item.publishedAt && (
                <Text style={[styles.chapterDate, { color: colors.text.disabled + "99" }]}>
                  {new Date(item.publishedAt).toLocaleDateString("ja-JP")}
                </Text>
              )}
            </View>
            {!item.isDownloaded &&
              (downloadingIndex === item.index ? (
                <ActivityIndicator size="small" color={colors.ui.primary} />
              ) : (
                <TouchableOpacity
                  onPress={() => handleDownloadChapter(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="cloud-download-outline"
                    size={18}
                    color={colors.ui.primary}
                  />
                </TouchableOpacity>
              ))}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontFamily: "NotoSansJP_700Bold",
    letterSpacing: 0.2,
    marginBottom: 2,
    lineHeight: 22,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 8,
  },
  author: { ...Typography.caption, flexShrink: 1 },
  meta: { ...Typography.caption },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 4,
    flex: 1,
    justifyContent: "center",
  },
  continueText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  actionIcons: { flexDirection: "row", gap: Spacing.xs },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  bulkFixedBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
    gap: 6,
  },
  bulkFixedInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bulkFixedText: {
    ...Typography.caption,
    flex: 1,
    marginLeft: Spacing.xs,
    fontWeight: "700",
  },
  bulkCancelBtn: {
    alignSelf: "flex-end",
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bulkCancelText: { fontSize: 11, fontWeight: "700" },
  bulkTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  bulkFill: {
    height: "100%",
  },
  synopsisSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: Spacing.xs,
  },
  synopsisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "NotoSansJP_600SemiBold",
    letterSpacing: 0.2,
  },
  synopsis: { ...Typography.caption, lineHeight: 18, marginTop: 4 },
  chapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: 2,
  },
  chapterHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  bulkBtnText: { fontSize: 11, fontWeight: "700" },
  chapterList: { paddingHorizontal: Spacing.sm, paddingBottom: 100 },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    gap: Spacing.xs,
  },
  chapterIndex: {
    width: 32,
    textAlign: "right",
    fontSize: 12,
    fontFamily: "NotoSansJP_400Regular",
    fontWeight: "600",
  },
  chapterTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "NotoSansJP_400Regular",
    lineHeight: 18,
  },
  chapterDates: {
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "center",
    marginRight: 4,
  },
  chapterDate: {
    fontSize: 10,
    fontFamily: "NotoSansJP_400Regular",
  },
  errorText: { ...Typography.body, textAlign: "center", marginTop: 100 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.full,
  },
  sortBtnText: { fontSize: 10, fontWeight: "700" },
});
