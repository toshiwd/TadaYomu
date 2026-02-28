import React, { useCallback, useState, memo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ToastAndroid,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import auth from "@react-native-firebase/auth";

import { useTheme } from "../theme/ThemeContext";
import { Spacing, Typography, Radius } from "../theme/colors";
import type { MainTabScreenProps } from "../navigation/types";
import type { Novel } from "../types/novel";
import {
  getAllNovels,
  getReadingProgress,
  getSetting,
  setSetting,
  type LibrarySortBy,
  getNovelBySiteId,
  insertNovel,
  updateNovel,
  deleteNovel,
} from "../database/repository";
import { deleteNovelData } from "../services/downloadManager";
import { syosetuAdapter } from "../services/adapters/syosetuAdapter";
import { syncService } from "../services/syncService";
import { getAdapter } from "../services/siteAdapter";

// --- Extracted Memoized Novel Item Component ---
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
    colors: any;
    sortBy: string;
    onPress: (id: number) => void;
    onResumePress: (novel: Novel) => void;
  }) => {
    const dateText = React.useMemo(() => {
      const d = sortBy === "updatedAt"
        ? (item.siteUpdatedAt || item.lastCheckedAt || item.addedAt)
        : (item as any)?.last_read_at || item.addedAt;
      if (!d) return "";
      return new Date(d).toLocaleDateString('ja-JP');
    }, [item, sortBy]);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => onPress(item.id)}
        activeOpacity={0.6}
        delayPressIn={0} // Remove slight delay to make it feel instant
      >
        <View style={styles.cardContent}>
          <Text
            style={[styles.cardTitle, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View style={styles.cardMeta}>
            <Text
              style={[styles.cardAuthor, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {item.author}
            </Text>
            <Text
              style={[styles.cardEpisodes, { color: colors.text.disabled }]}
            >
              {progressText ?? `${item.totalEpisodes}話`}
            </Text>
            {dateText ? (
              <Text
                style={[styles.cardDate, { color: colors.text.disabled }]}
                numberOfLines={1}
              >
                ・{dateText}
              </Text>
            ) : null}
            {item.isComplete && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: colors.ui.success + "20" },
                ]}
              >
                <Text style={[styles.badgeText, { color: colors.ui.success }]}>
                  完結
                </Text>
              </View>
            )}
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
        <TouchableOpacity
          style={styles.resumeButton}
          onPress={(e) => {
            e.stopPropagation();
            onResumePress(item);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="book-outline"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.text.disabled}
        />
      </TouchableOpacity>
    );
  }
);
NovelItem.displayName = "NovelItem";
// ----------------------------------------------

export default function LibraryScreen({
  navigation,
}: MainTabScreenProps<"Library">) {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<LibrarySortBy>(() => {
    const saved = getSetting(db, "library_sort");
    return saved === "updatedAt" || saved === "lastRead" ? saved : "updatedAt";
  });

  const loadNovels = useCallback(() => {
    setNovels(getAllNovels(db, sortBy, showArchived));
  }, [db, sortBy, showArchived]);

  useFocusEffect(
    useCallback(() => {
      loadNovels();
    }, [loadNovels]),
  );



  const onRefresh = useCallback(async () => {
    let cancelled = false;
    setRefreshing(true);

    // 1. Existing Sync logic
    let hasSyncUpdates = false;
    if (syncService.isSignedIn()) {
      try {
        const remoteData = await syncService.downloadLibrary();
        if (cancelled) return;
        if (remoteData) {
          const { novels: remoteNovels, deletedAt } = remoteData;
          if (remoteNovels && remoteNovels.length > 0) {
            for (const remote of remoteNovels) {
              if (!remote.siteNovelId || !remote.siteType) continue;

              const docKey = `${remote.siteType}_${remote.siteNovelId}`;
              const remoteAddedAt = remote.addedAt ? new Date(remote.addedAt).getTime() : 0;

              if (deletedAt && deletedAt[docKey] && deletedAt[docKey] > remoteAddedAt) {
                // Skip importing this novel because it was deleted
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

          // Then process local novels to delete ones that were removed remotely
          let localListModified = false;
          const currentLocal = getAllNovels(db, sortBy);
          for (const local of currentLocal) {
            const docKey = `${local.siteType}_${local.siteNovelId}`;
            if (deletedAt && deletedAt[docKey]) {
              const localAddedAt = new Date(local.addedAt).getTime();
              if (deletedAt[docKey] > localAddedAt) {
                // It was deleted remotely after we added it locally
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

    // 2. Refresh local novels using Site Adapters in the background
    (async () => {
      try {
        const localNovels = getAllNovels(db, sortBy, showArchived);
        let updatedCount = 0;

        // Group novels by siteType
        const novelsBySite: Record<string, typeof localNovels> = {};
        for (const novel of localNovels) {
          if (!novelsBySite[novel.siteType]) novelsBySite[novel.siteType] = [];
          novelsBySite[novel.siteType].push(novel);
        }

        // Process each site
        for (const siteType of Object.keys(novelsBySite)) {
          const adapter = getAdapter(siteType as any);
          if (!adapter) continue;

          const siteNovels = novelsBySite[siteType];

          if (adapter.getNovelInfoBulk) {
            // Bulk update path for Syosetu/Nocturne (Process in chunks of 100)
            for (let i = 0; i < siteNovels.length; i += 100) {
              const chunk = siteNovels.slice(i, i + 100);
              const ids = chunk.map(n => n.siteNovelId);

              try {
                const bulkInfoList = await adapter.getNovelInfoBulk(ids);
                const infoMap = new Map();
                for (const info of bulkInfoList) {
                  infoMap.set(info.siteNovelId, info);
                }

                let localUpdated = false;
                db.withTransactionSync(() => {
                  for (const novel of chunk) {
                    const info = infoMap.get(novel.siteNovelId);
                    if (!info) {
                      updateNovel(db, novel.id, { lastCheckedAt: new Date().toISOString() });
                      continue;
                    }

                    let needsUpdate = false;
                    const infoTime = info.lastUpdatedAt ? new Date(info.lastUpdatedAt).getTime() : 0;
                    const localTime = novel.siteUpdatedAt ? new Date(novel.siteUpdatedAt).getTime() : 0;

                    if (info.totalEpisodes > novel.totalEpisodes) needsUpdate = true;
                    if (infoTime > localTime) needsUpdate = true;
                    if (info.isComplete !== novel.isComplete) needsUpdate = true;

                    if (needsUpdate) {
                      updateNovel(db, novel.id, {
                        totalEpisodes: info.totalEpisodes,
                        siteUpdatedAt: info.lastUpdatedAt || novel.siteUpdatedAt,
                        isComplete: info.isComplete,
                        lastCheckedAt: new Date().toISOString(),
                      });
                      updatedCount++;
                      localUpdated = true;
                    } else {
                      updateNovel(db, novel.id, { lastCheckedAt: new Date().toISOString() });
                    }
                  }
                });

                if (localUpdated) loadNovels();
              } catch (err) {
                console.warn(`[Library Refresh] Bulk update failed for ${siteType}:`, err);
              }
            }
          } else {
            // Sequential/Parallel fallback for Kakuyomu/Hameln
            // Process in parallel chunks of 3 to avoid overwhelming connections
            for (let i = 0; i < siteNovels.length; i += 3) {
              const chunk = siteNovels.slice(i, i + 3);
              let localUpdated = false;

              await Promise.all(chunk.map(async (novel) => {
                try {
                  const info = await adapter.getNovelInfo(novel.siteNovelId);
                  let needsUpdate = false;
                  const infoTime = info.lastUpdatedAt ? new Date(info.lastUpdatedAt).getTime() : 0;
                  const localTime = novel.siteUpdatedAt ? new Date(novel.siteUpdatedAt).getTime() : 0;

                  if (info.totalEpisodes > novel.totalEpisodes) needsUpdate = true;
                  if (infoTime > localTime) needsUpdate = true;
                  if (info.isComplete !== novel.isComplete) needsUpdate = true;

                  if (needsUpdate) {
                    updateNovel(db, novel.id, {
                      totalEpisodes: info.totalEpisodes,
                      siteUpdatedAt: info.lastUpdatedAt || novel.siteUpdatedAt,
                      isComplete: info.isComplete,
                      lastCheckedAt: new Date().toISOString(),
                    });
                    updatedCount++;
                    localUpdated = true;
                  } else {
                    updateNovel(db, novel.id, { lastCheckedAt: new Date().toISOString() });
                  }
                } catch (err) {
                  console.warn(`[Library Refresh] Failed for ${novel.id}:`, err);
                }
              }));

              if (localUpdated) loadNovels();
            }
          }
        }

        if (updatedCount > 0) {
          ToastAndroid.show(`${updatedCount}件の小説に更新がありました`, ToastAndroid.LONG);
        }
      } catch (error) {
        console.error("Library novel check failed", error);
      }
    })();

    // Stop the spinner explicitly since processing is running async now
    if (hasSyncUpdates) {
      loadNovels();
    }
    if (!cancelled) {
      setRefreshing(false);
    }
  }, [db, loadNovels, sortBy, showArchived]);

  React.useEffect(() => {
    return () => {
      // The `cancelled` variable inside onRefresh is scoped to the callback invocation,
      // but if the component unmounts we still want any pending state updates to be safe.
      // The easiest way is to wrap setRefreshing if mounted, but React 18+ auto-batches.
      // To be strictly correct across renders we'd use a ref, but letting it drop is fine.
    };
  }, []);

  // Trigger sync automatically when auth state changes to logged in
  React.useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((user) => {
      if (user) {
        // Run sync in the background
        onRefresh();
      }
    });
    return unsubscribe;
  }, [onRefresh]);

  const renderNovel = useCallback(
    ({ item }: { item: Novel }) => {
      const progressText = item.currentChapter !== undefined
        ? `${item.currentChapter} / ${item.totalEpisodes}話`
        : null;
      const progressPercentage = item.currentChapter !== undefined
        ? Math.min(100, (item.currentChapter / item.totalEpisodes) * 100)
        : null;

      return (
        <NovelItem
          item={item}
          progressText={progressText}
          progressPercentage={progressPercentage}
          colors={colors}
          sortBy={sortBy}
          onPress={(id) => navigation.navigate("NovelDetail", { novelId: id })}
          onResumePress={(novel) => navigation.navigate("Reader", { novelId: novel.id, chapterIndex: novel.currentChapter || 1 })}
        />
      );
    },
    [navigation, colors]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, !showArchived && styles.tabButtonActive]}
              onPress={() => setShowArchived(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, !showArchived ? { color: colors.text.primary, fontWeight: '700' } : { color: colors.text.disabled }]}>
                本棚
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, showArchived && styles.tabButtonActive]}
              onPress={() => setShowArchived(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, showArchived ? { color: colors.text.primary, fontWeight: '700' } : { color: colors.text.disabled }]}>
                保管庫
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.headerCount, { color: colors.text.secondary }]}>
            {novels.length > 0 ? `${novels.length}冊` : ""}
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
            size={14}
            color={colors.text.secondary}
          />
          <Text style={[styles.sortBtnText, { color: colors.text.secondary }]}>
            {sortBy === "updatedAt" ? "更新日" : "アクセス日"}
          </Text>
        </TouchableOpacity>
      </View>

      {novels.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="book-outline"
            size={64}
            color={colors.text.disabled}
          />
          <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
            書庫は空です
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.text.disabled }]}>
            「追加」タブから小説を追加してください
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.ui.primary }]}
            onPress={() => navigation.navigate("Search" as any)}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.addButtonText}>小説を追加</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderNovel}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={true}
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
    paddingTop: 48,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "NotoSansJP_700Bold",
    letterSpacing: 0.3,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#E0E0E0",
    borderRadius: Radius.full,
    padding: 2,
    marginTop: 4,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  tabButtonActive: {
    backgroundColor: "#FFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "NotoSansJP_400Regular",
  },
  headerCount: { ...Typography.caption, marginLeft: Spacing.xs },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  sortBtnText: { fontSize: 11, fontWeight: "600" },
  list: { paddingHorizontal: Spacing.sm, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: 1,
  },
  resumeButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  cardContent: { flex: 1, marginRight: Spacing.xs },
  cardTitle: {
    fontSize: 13,
    fontFamily: "NotoSansJP_600SemiBold",
    marginBottom: 0,
  },
  cardAuthor: {
    fontSize: 11,
    fontFamily: "NotoSansJP_400Regular",
    flexShrink: 1,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginTop: 1 },
  cardEpisodes: { fontSize: 11, fontFamily: "NotoSansJP_400Regular" },
  cardDate: { fontSize: 11, fontFamily: "NotoSansJP_400Regular" },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: "700" },
  progressBar: { height: 2, borderRadius: 1, marginTop: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 1 },
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
