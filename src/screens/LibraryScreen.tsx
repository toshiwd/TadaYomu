import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ToastAndroid,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import auth from "@react-native-firebase/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeContext";
import { Spacing, Typography, Radius } from "../theme/colors";
import type { MainTabScreenProps } from "../navigation/types";
import type { Novel } from "../types/novel";
import {
  getAllNovels,
  getSetting,
  setSetting,
  type LibrarySortBy,
  getNovelBySiteId,
  insertNovel,
  updateNovel,
  deleteNovel,
} from "../database/repository";
import { deleteNovelData } from "../services/downloadManager";
import { syncService } from "../services/syncService";
import { getAdapter } from "../services/siteAdapter";
import { normalizeReaderChapterIndex } from "../services/readerEntry";
import {
  getLibraryProgressPercentage,
  hasNovelMetadataUpdate,
} from "../services/runtimeGuards";

type ThemeColorMap = ReturnType<typeof useTheme>["colors"];

const NovelItem = memo(
  ({
    item,
    progressText,
    progressPercentage,
    colors,
    sortBy,
    onPress,
    onResumePress,
  }: {
    item: Novel;
    progressText: string | null;
    progressPercentage: number | null;
    colors: ThemeColorMap;
    sortBy: LibrarySortBy;
    onPress: (id: number) => void;
    onResumePress: (novel: Novel) => void;
  }) => {
    const dateText = React.useMemo(() => {
      const d =
        sortBy === "updatedAt"
          ? item.siteUpdatedAt || item.lastCheckedAt || item.addedAt
          : item.addedAt;
      if (!d) return "";
      return new Date(d).toLocaleDateString("ja-JP");
    }, [item.addedAt, item.lastCheckedAt, item.siteUpdatedAt, sortBy]);

    return (
      <View
        style={[styles.card, { backgroundColor: colors.surface }]}
      >
        <TouchableOpacity
          style={styles.cardMainAction}
          onPress={() => onPress(item.id)}
          activeOpacity={0.7}
          delayPressIn={0}
        >
          <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text
              style={[styles.cardTitle, { color: colors.text.primary }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: item.isComplete
                    ? colors.ui.success + "20"
                    : colors.surfaceAlt,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: item.isComplete
                      ? colors.ui.success
                      : colors.text.secondary,
                  },
                ]}
              >
                {item.isComplete ? "完結" : "連載"}
              </Text>
            </View>
          </View>
          <View style={styles.cardMeta}>
            <Text
              style={[styles.cardAuthor, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {item.author}
            </Text>
            <Text style={[styles.dot, { color: colors.text.disabled }]}>•</Text>
            <Text style={[styles.cardEpisodes, { color: colors.text.disabled }]}>
              {progressText ?? `${item.totalEpisodes}話`}
            </Text>
            {dateText ? (
              <>
                <Text style={[styles.dot, { color: colors.text.disabled }]}>•</Text>
                <Text style={[styles.cardDate, { color: colors.text.disabled }]}>
                  {dateText}
                </Text>
              </>
            ) : null}
          </View>
          {progressPercentage !== null && (
            <View
              style={[
                styles.progressBar,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.ui.success,
                    width: `${progressPercentage}%`,
                  },
                ]}
              />
            </View>
          )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.resumeButton}
          onPress={() => onResumePress(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}を続きから開く`}
        >
          <Ionicons name="book-outline" size={24} color={colors.ui.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.detailChevronButton}
          onPress={() => onPress(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}の詳細を開く`}
        >
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.text.disabled}
          />
        </TouchableOpacity>
      </View>
    );
  },
);

NovelItem.displayName = "NovelItem";

export default function LibraryScreen({
  navigation,
}: MainTabScreenProps<"Library">) {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [novels, setNovels] = useState<Novel[]>([]);
  const openingReaderRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'連載' | '完結' | '短編' | 'アーカイブ'>('連載');
  const [sortBy, setSortBy] = useState<LibrarySortBy>(() => {
    const saved = getSetting(db, "library_sort");
    return saved === "updatedAt" || saved === "lastRead" ? saved : "updatedAt";
  });

  const isArchivedTab = activeTab === 'アーカイブ';

  const filteredNovels = React.useMemo(() => {
    if (isArchivedTab) return novels;
    return novels.filter(n => {
      if (activeTab === '短編') return n.totalEpisodes === 1;
      if (activeTab === '完結') return n.totalEpisodes !== 1 && n.isComplete;
      if (activeTab === '連載') return n.totalEpisodes !== 1 && !n.isComplete;
      return true;
    });
  }, [novels, activeTab, isArchivedTab]);

  const mountedRef = useRef(true);
  const refreshRunningRef = useRef(false);
  const refreshRunIdRef = useRef(0);
  const onRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const lastAutoRefreshUidRef = useRef<string | null>(null);

  const loadNovels = useCallback(() => {
    setNovels(getAllNovels(db, sortBy, isArchivedTab));
  }, [db, sortBy, isArchivedTab]);

  useFocusEffect(
    useCallback(() => {
      openingReaderRef.current = false;
      loadNovels();
    }, [loadNovels]),
  );

  const openReaderFromLibrary = useCallback(
    (novel: Novel) => {
      if (openingReaderRef.current) return;
      openingReaderRef.current = true;
      navigation.navigate("Reader", {
        novelId: novel.id,
        chapterIndex: normalizeReaderChapterIndex(novel.currentChapter),
      });
    },
    [navigation],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      refreshRunIdRef.current += 1;
    };
  }, []);

  const isRefreshRunActive = useCallback((runId: number) => {
    return mountedRef.current && refreshRunIdRef.current === runId;
  }, []);

  const onRefresh = useCallback(async () => {
    if (refreshRunningRef.current) return;

    refreshRunningRef.current = true;
    const runId = refreshRunIdRef.current + 1;
    refreshRunIdRef.current = runId;

    if (mountedRef.current) {
      setRefreshing(true);
    }

    try {
      let hasSyncUpdates = false;
      if (syncService.isSignedIn()) {
        try {
          const remoteData = await syncService.downloadLibrary();
          if (!isRefreshRunActive(runId)) return;

          if (remoteData) {
            const { novels: remoteNovels, deletedAt } = remoteData;
            if (remoteNovels && remoteNovels.length > 0) {
              for (const remote of remoteNovels) {
                if (!isRefreshRunActive(runId)) return;
                if (!remote.siteNovelId || !remote.siteType) continue;

                const docKey = `${remote.siteType}_${remote.siteNovelId}`;
                const remoteAddedAt = remote.addedAt
                  ? new Date(remote.addedAt).getTime()
                  : 0;

                if (
                  deletedAt &&
                  deletedAt[docKey] &&
                  deletedAt[docKey] > remoteAddedAt
                ) {
                  continue;
                }

                const local = getNovelBySiteId(
                  db,
                  remote.siteNovelId,
                  remote.siteType,
                );
                if (!local) {
                  insertNovel(db, {
                    siteNovelId: remote.siteNovelId,
                    siteType: remote.siteType as any,
                    title: remote.title || "Unknown",
                    author: remote.author || "Unknown",
                    synopsis: remote.synopsis || "",
                    totalEpisodes: remote.totalEpisodes || 0,
                    downloadedEpisodes: 0,
                    url: remote.url || "",
                    coverPath: remote.coverPath || null,
                    tags: [],
                    isComplete: remote.isComplete || false,
                    isArchived: false,
                    siteUpdatedAt: remote.siteUpdatedAt
                      ? String(remote.siteUpdatedAt)
                      : new Date().toISOString(),
                    lastCheckedAt: new Date().toISOString(),
                    addedAt: remote.addedAt
                      ? String(remote.addedAt)
                      : new Date().toISOString(),
                  });
                  hasSyncUpdates = true;
                }
              }
            }

            let localListModified = false;
            const currentLocal = getAllNovels(db, sortBy);
            for (const local of currentLocal) {
              if (!isRefreshRunActive(runId)) return;
              const docKey = `${local.siteType}_${local.siteNovelId}`;
              if (deletedAt && deletedAt[docKey]) {
                const localAddedAt = new Date(local.addedAt).getTime();
                if (deletedAt[docKey] > localAddedAt) {
                  deleteNovelData(local.siteNovelId);
                  deleteNovel(db, local.id);
                  localListModified = true;
                }
              }
            }

            if (localListModified) {
              hasSyncUpdates = true;
            }

            const freshLocal = getAllNovels(db, sortBy);
            await syncService.uploadLibrary(freshLocal);
          }
        } catch (error) {
          console.error("Library sync failed", error);
        }
      }

      let updatedCount = 0;
      const localNovels = getAllNovels(db, sortBy, isArchivedTab);
      const novelsBySite: Record<string, typeof localNovels> = {};
      for (const novel of localNovels) {
        if (!novelsBySite[novel.siteType]) novelsBySite[novel.siteType] = [];
        novelsBySite[novel.siteType].push(novel);
      }

      for (const siteType of Object.keys(novelsBySite)) {
        if (!isRefreshRunActive(runId)) return;
        const adapter = getAdapter(siteType as any);
        if (!adapter) continue;
        const siteNovels = novelsBySite[siteType];

        if (adapter.getNovelInfoBulk) {
          for (let i = 0; i < siteNovels.length; i += 100) {
            if (!isRefreshRunActive(runId)) return;
            const chunk = siteNovels.slice(i, i + 100);
            const ids = chunk.map((n) => n.siteNovelId);

            try {
              const bulkInfoList = await adapter.getNovelInfoBulk(ids);
              if (!isRefreshRunActive(runId)) return;

              const infoMap = new Map<string, (typeof bulkInfoList)[number]>();
              for (const info of bulkInfoList) {
                infoMap.set(info.siteNovelId, info);
              }

              let localUpdated = false;
              db.withTransactionSync(() => {
                for (const novel of chunk) {
                  const info = infoMap.get(novel.siteNovelId);
                  if (!info) {
                    updateNovel(db, novel.id, {
                      lastCheckedAt: new Date().toISOString(),
                    });
                    continue;
                  }

                  const needsUpdate = hasNovelMetadataUpdate(novel, info);

                  if (needsUpdate) {
                    updateNovel(db, novel.id, {
                      totalEpisodes: info.totalEpisodes,
                      siteUpdatedAt: info.lastUpdatedAt || novel.siteUpdatedAt,
                      isComplete: info.isComplete,
                      lastCheckedAt: new Date().toISOString(),
                    });
                    updatedCount += 1;
                    localUpdated = true;
                  } else {
                    updateNovel(db, novel.id, {
                      lastCheckedAt: new Date().toISOString(),
                    });
                  }
                }
              });

              if (localUpdated && isRefreshRunActive(runId)) {
                loadNovels();
              }
            } catch (err) {
              console.warn(
                `[Library Refresh] Bulk update failed for ${siteType}:`,
                err,
              );
            }
          }
        } else {
          for (let i = 0; i < siteNovels.length; i += 3) {
            if (!isRefreshRunActive(runId)) return;
            const chunk = siteNovels.slice(i, i + 3);
            let localUpdated = false;

            await Promise.all(
              chunk.map(async (novel) => {
                try {
                  const info = await adapter.getNovelInfo(novel.siteNovelId);
                  const needsUpdate = hasNovelMetadataUpdate(novel, info);

                  if (needsUpdate) {
                    updateNovel(db, novel.id, {
                      totalEpisodes: info.totalEpisodes,
                      siteUpdatedAt: info.lastUpdatedAt || novel.siteUpdatedAt,
                      isComplete: info.isComplete,
                      lastCheckedAt: new Date().toISOString(),
                    });
                    updatedCount += 1;
                    localUpdated = true;
                  } else {
                    updateNovel(db, novel.id, {
                      lastCheckedAt: new Date().toISOString(),
                    });
                  }
                } catch (err) {
                  console.warn(`[Library Refresh] Failed for ${novel.id}:`, err);
                }
              }),
            );

            if (localUpdated && isRefreshRunActive(runId)) {
              loadNovels();
            }
          }
        }
      }

      if (updatedCount > 0) {
        ToastAndroid.show(`${updatedCount}件の作品を更新しました`, ToastAndroid.LONG);
      }

      if (hasSyncUpdates && isRefreshRunActive(runId)) {
        loadNovels();
      }
    } catch (error) {
      console.error("Library refresh failed", error);
    } finally {
      if (isRefreshRunActive(runId)) {
        setRefreshing(false);
      }
      refreshRunningRef.current = false;
    }
  }, [db, sortBy, isArchivedTab, loadNovels, isRefreshRunActive]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((user) => {
      if (!user) {
        lastAutoRefreshUidRef.current = null;
        return;
      }
      if (lastAutoRefreshUidRef.current === user.uid) return;
      lastAutoRefreshUidRef.current = user.uid;
      void onRefreshRef.current?.();
    });
    return unsubscribe;
  }, []);

  const renderNovel = useCallback(
    ({ item }: { item: Novel }) => {
      const progressText =
        item.currentChapter !== undefined
          ? `${item.currentChapter} / ${item.totalEpisodes}話`
          : null;
      const progressPercentage = getLibraryProgressPercentage(
        item.currentChapter,
        item.totalEpisodes,
      );

      return (
        <NovelItem
          item={item}
          progressText={progressText}
          progressPercentage={progressPercentage}
          colors={colors}
          sortBy={sortBy}
          onPress={(id) => navigation.navigate("NovelDetail", { novelId: id })}
          onResumePress={openReaderFromLibrary}
        />
      );
    },
    [navigation, colors, sortBy, openReaderFromLibrary],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 2,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.tabContainer, { backgroundColor: colors.surfaceAlt }]}>
            {(['連載', '完結', '短編', 'アーカイブ'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && [styles.tabButtonActive, { backgroundColor: colors.surface }]]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab
                      ? { color: colors.text.primary, fontWeight: "700" }
                      : { color: colors.text.disabled },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.headerCount, { color: colors.text.secondary }]}>
            {filteredNovels.length}件
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.sortBtn, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => {
            const next: LibrarySortBy =
              sortBy === "updatedAt" ? "lastRead" : "updatedAt";
            setSortBy(next);
            setSetting(db, "library_sort", next);
          }}
        >
          <Ionicons
            name="swap-vertical"
            size={13}
            color={colors.text.secondary}
          />
          <Text style={[styles.sortBtnText, { color: colors.text.secondary }]}>
            {sortBy === "updatedAt" ? "更新順" : "読書順"}
          </Text>
        </TouchableOpacity>
      </View>

      {filteredNovels.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="book-outline"
            size={64}
            color={colors.text.disabled}
          />
          <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
            作品がありません
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.text.disabled }]}>
            「追加」タブから作品URLを登録してください。
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.ui.primary }]}
            onPress={() => navigation.navigate("Search")}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.addButtonText}>作品を追加</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredNovels}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderNovel}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingBottom: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: Radius.full,
    padding: 1,
  },
  tabButton: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  tabButtonActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 11,
    fontFamily: "NotoSansJP_400Regular",
  },
  headerCount: { ...Typography.caption, fontSize: 11 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  sortBtnText: { fontSize: 9, fontWeight: "700" },
  list: { paddingHorizontal: 2, paddingBottom: 82 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    marginBottom: 4,
  },
  cardMainAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingLeft: 3,
  },
  cardContent: { flex: 1, marginRight: 2 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 3,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "NotoSansJP_600SemiBold",
    includeFontPadding: false,
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: 3,
    paddingVertical: 0,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  cardAuthor: {
    fontSize: 12,
    fontFamily: "NotoSansJP_400Regular",
    includeFontPadding: false,
    lineHeight: 18,
    flexShrink: 1,
  },
  dot: {
    fontSize: 12,
    marginHorizontal: 2,
    includeFontPadding: false,
    lineHeight: 14,
  },
  cardEpisodes: {
    fontSize: 12,
    fontFamily: "NotoSansJP_400Regular",
    includeFontPadding: false,
    lineHeight: 14,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: "NotoSansJP_400Regular",
    includeFontPadding: false,
    lineHeight: 14,
  },
  progressBar: {
    height: 3,
    borderRadius: 1.5,
    marginTop: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 1.5 },
  resumeButton: {
    paddingVertical: 11,
    paddingHorizontal: 5,
    marginRight: 2,
    marginLeft: 4,
  },
  detailChevronButton: {
    paddingVertical: 14,
    paddingLeft: 2,
    paddingRight: 3,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: { ...Typography.title, marginTop: Spacing.md },
  emptySubtitle: {
    ...Typography.body,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.lg,
    gap: 4,
  },
  addButtonText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
