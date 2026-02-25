import React, { useCallback, useState, useRef, useMemo } from "react";
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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";

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
  const novelId = route.params.novelId;

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [fetchingChapters, setFetchingChapters] = useState(false);

  // Subscribe to global bulk download store
  const storeProgress = useBulkDownloadProgress(novelId);
  const bulkState: BulkDownloadState = storeProgress?.state ?? "idle";
  const bulkProgress = storeProgress
    ? { downloaded: storeProgress.downloaded, total: storeProgress.total }
    : { downloaded: 0, total: 0 };

  const fetchChapterList = useCallback(async (n: Novel) => {
    const adapter = getAdapter(n.siteType);
    if (!adapter) return;
    setFetchingChapters(true);
    try {
      const chapterList = await adapter.getChapterList(n.siteNovelId);
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
      updateNovel(db, n.id, {
        totalEpisodes: chapterList.length,
        lastCheckedAt: new Date().toISOString(),
      });
      // Reload
      setChapters(getChaptersByNovelId(db, n.id));
      setNovel(getNovelById(db, n.id));
    } catch (err) {
      console.error("Failed to fetch chapter list", err);
    } finally {
      setFetchingChapters(false);
    }
  }, [db]);

  const loadData = useCallback(() => {
    const n = getNovelById(db, novelId);
    setNovel(n);
    if (n) {
      const localChapters = getChaptersByNovelId(db, novelId);
      setChapters(localChapters);

      // 同期で追加されたがチャプターが未取得の場合、サイトから取得
      if (localChapters.length === 0 && n.url) {
        fetchChapterList(n);
      }

      const progress = getReadingProgress(db, novelId);
      if (progress) setCurrentChapter(progress.currentChapter);

      // Check cloud for newer progress
      if (syncService.isSignedIn()) {
        syncService
          .downloadProgress(n.siteNovelId, n.siteType)
          .then((remoteProgress) => {
            if (remoteProgress) {
              const localTime = progress
                ? new Date(progress.lastReadAt).getTime()
                : 0;
              const remoteTime = new Date(remoteProgress.lastReadAt).getTime();

              // If remote is newer, use it
              if (remoteTime > localTime) {
                setCurrentChapter(remoteProgress.currentChapter);
                upsertReadingProgress(
                  db,
                  novelId,
                  remoteProgress.currentChapter,
                  remoteProgress.scrollPercentage,
                );
              }
            }
          })
          .catch(console.error);
      }
    }
  }, [db, novelId, fetchChapterList]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const showToast = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert("", msg);
    }
  };

  const handleBulkDownload = async () => {
    if (!novel || bulkState === "running") return;
    try {
      const networkState = await Network.getNetworkStateAsync();
      const r = currentChapter;
      const end = Math.min(chapters.length, r + 50);
      const start = r + 1;
      const pending = chapters.filter(
        (ch) =>
          ch.index >= start && ch.index <= end && !ch.isDownloaded && ch.url,
      );

      if (
        networkState.type !== Network.NetworkStateType.WIFI &&
        pending.length > 20
      ) {
        Alert.alert(
          "モバイル通信での一括ダウンロード",
          `対象: ${pending.length}話 (見込み約200MB以上)\n挿絵画像が含まれる場合、大量のデータ通信が発生します。\n\n続行しますか？`,
          [
            { text: "Wi-Fiを待つ", style: "cancel" },
            {
              text: "続行",
              style: "destructive",
              onPress: () => startGlobalDownload(db, novel),
            },
          ],
        );
        return;
      }
      startGlobalDownload(db, novel);
    } catch (err) {
      console.error(err);
      startGlobalDownload(db, novel);
    }
  };

  const handleCancelBulk = () => {
    if (novel) {
      cancelGlobalDownload(novel.id);
      showToast("ダウンロードを中断しました");
    }
  };

  const handleToggleArchive = () => {
    if (novel) {
      const isArchived = !novel.isArchived;
      updateNovel(db, novel.id, { isArchived });
      showToast(isArchived ? "保管庫に移動しました" : "本棚に戻しました");
      navigation.goBack();
    }
  };

  const handleDelete = () => {
    Alert.alert("削除確認", "この小説を書庫から削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          if (novel) {
            cancelGlobalDownload(novel.id);
            deleteNovelData(novel.siteNovelId);
            deleteNovel(db, novel.id);
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const handleContinueReading = () => {
    navigation.navigate("Reader", { novelId, chapterIndex: currentChapter });
  };

  const handleDownloadChapter = async (chapter: Chapter) => {
    if (!novel || downloadingIndex !== null) return;
    setDownloadingIndex(chapter.index);
    try {
      await downloadSingleChapter(
        db,
        chapter,
        novel.siteNovelId,
        novel.siteType,
      );
      // Update download count
      const downloaded = countDownloadedChapters(db, novel.id);
      updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
      loadData();
    } catch (err: any) {
      Alert.alert("ダウンロード失敗", err?.message || "不明なエラー");
    } finally {
      setDownloadingIndex(null);
    }
  };

  const displayChapters = useMemo(() => {
    return sortOrder === "desc" ? [...chapters].reverse() : chapters;
  }, [chapters, sortOrder]);

  if (!novel) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text.disabled }]}>
          小説が見つかりません
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text
          style={[styles.title, { color: colors.text.primary }]}
          numberOfLines={2}
        >
          {novel.title}
        </Text>
        <View style={styles.authorRow}>
          <Text
            style={[styles.author, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {novel.author}
          </Text>
          <Text style={[styles.meta, { color: colors.text.disabled }]}>
            {novel.downloadedEpisodes}/{novel.totalEpisodes}話 DL済
            {novel.isComplete ? " · 完結" : " · 連載中"}
            {novel.siteUpdatedAt ? ` · 更新: ${new Date(novel.siteUpdatedAt).toLocaleDateString('ja-JP')}` : ""}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: colors.ui.primary },
            ]}
            onPress={handleContinueReading}
          >
            <Ionicons name="book" size={14} color="#FFF" />
            <Text style={styles.continueText}>
              {currentChapter > 1 ? `第${currentChapter}話から` : "読む"}
            </Text>
          </TouchableOpacity>
          {novel.url ? (
            <TouchableOpacity
              style={[styles.archiveButton, { borderColor: colors.ui.primary }]}
              onPress={() => Linking.openURL(novel.url)}
            >
              <Ionicons name="globe-outline" size={14} color={colors.ui.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.archiveButton, { borderColor: novel.isArchived ? colors.ui.success : colors.text.secondary }]}
            onPress={handleToggleArchive}
          >
            <Ionicons name={novel.isArchived ? "folder-open-outline" : "archive-outline"} size={14} color={novel.isArchived ? colors.ui.success : colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, { borderColor: colors.ui.error }]}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={14} color={colors.ui.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Synopsis */}
      {novel.synopsis ? (
        <TouchableOpacity
          style={styles.synopsisSection}
          onPress={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
          activeOpacity={0.7}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
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
            style={[
              styles.synopsis,
              { color: colors.text.secondary, marginTop: 4 },
            ]}
            numberOfLines={isSynopsisExpanded ? undefined : 3}
          >
            {novel.synopsis}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Chapter list header with bulk DL */}
      <View style={styles.chapterHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
            <Text
              style={[styles.sortBtnText, { color: colors.text.secondary }]}
            >
              {sortOrder === "desc" ? "降順" : "昇順"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.bulkActions}>
          {bulkState === "running" ? (
            <>
              <View
                style={[
                  styles.bulkBtn,
                  styles.bulkBtnRunning,
                  { backgroundColor: colors.ui.primary + "15" },
                ]}
              >
                <ActivityIndicator size="small" color={colors.ui.primary} />
                <Text
                  style={[styles.bulkBtnText, { color: colors.ui.primary }]}
                >
                  {bulkProgress.downloaded}/{bulkProgress.total}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.bulkBtn,
                  { borderColor: colors.ui.error, borderWidth: 1 },
                ]}
                onPress={handleCancelBulk}
              >
                <Text style={[styles.bulkBtnText, { color: colors.ui.error }]}>
                  中断
                </Text>
              </TouchableOpacity>
            </>
          ) : novel && novel.downloadedEpisodes >= novel.totalEpisodes ? (
            <View
              style={[
                styles.bulkBtn,
                { backgroundColor: colors.ui.success + "15" },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={colors.ui.success}
              />
              <Text style={[styles.bulkBtnText, { color: colors.ui.success }]}>
                DL済み
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: colors.ui.primary }]}
              onPress={handleBulkDownload}
            >
              <Ionicons name="download-outline" size={14} color="#FFF" />
              <Text style={[styles.bulkBtnText, { color: "#FFF" }]}>
                一括DL
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
                  item.index === currentChapter
                    ? colors.surfaceAlt
                    : "transparent",
              },
            ]}
            onPress={() =>
              navigation.navigate("Reader", {
                novelId,
                chapterIndex: item.index,
              })
            }
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
                  {new Date(item.publishedAt).toLocaleDateString('ja-JP')}
                  {item.revisedAt && item.revisedAt !== item.publishedAt && (
                    <Text style={{ color: colors.ui.primary }}> (改稿)</Text>
                  )}
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
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: 4,
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
  actions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
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
  archiveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  synopsisSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "NotoSansJP_600SemiBold",
    letterSpacing: 0.2,
  },
  chapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: 2,
  },
  bulkActions: { flexDirection: "row", gap: 6 },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  bulkBtnRunning: {},
  bulkBtnText: { fontSize: 11, fontWeight: "700" },
  synopsis: { ...Typography.caption, lineHeight: 18 },
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
    borderRadius: Radius.full,
  },
  sortBtnText: { fontSize: 10, fontWeight: "700" },
});
