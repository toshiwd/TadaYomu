import React, { useCallback, useState } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography, Radius } from '../theme/colors';
import type { MainTabScreenProps } from '../navigation/types';
import type { Novel } from '../types/novel';
import { getAllNovels, getReadingProgress, getSetting, setSetting, type LibrarySortBy } from '../database/repository';
import { syosetuAdapter } from '../services/adapters/syosetuAdapter';

export default function LibraryScreen({ navigation }: MainTabScreenProps<'Library'>) {
    const { colors } = useTheme();
    const db = useSQLiteContext();
    const [novels, setNovels] = useState<Novel[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState<LibrarySortBy>(() => {
        const saved = getSetting(db, 'library_sort');
        return (saved === 'updatedAt' || saved === 'lastRead') ? saved : 'updatedAt';
    });

    const loadNovels = useCallback(() => {
        setNovels(getAllNovels(db, sortBy));
    }, [db, sortBy]);

    useFocusEffect(
        useCallback(() => {
            loadNovels();
        }, [loadNovels])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadNovels();
        setRefreshing(false);
    }, [loadNovels]);



    const renderNovel = ({ item }: { item: Novel }) => {
        const progress = getReadingProgress(db, item.id);
        const progressText = progress
            ? `${progress.currentChapter} / ${item.totalEpisodes}話`
            : `${item.totalEpisodes}話`;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface }]}
                onPress={() => navigation.navigate('NovelDetail', { novelId: item.id })}
                activeOpacity={0.7}
            >
                <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <View style={styles.cardMeta}>
                        <Text style={[styles.cardAuthor, { color: colors.text.secondary }]} numberOfLines={1}>
                            {item.author}
                        </Text>
                        <Text style={[styles.cardEpisodes, { color: colors.text.disabled }]}>
                            {progressText}
                        </Text>
                        {item.isComplete && (
                            <View style={[styles.badge, { backgroundColor: colors.ui.success + '20' }]}>
                                <Text style={[styles.badgeText, { color: colors.ui.success }]}>完結</Text>
                            </View>
                        )}
                    </View>
                    {progress && (
                        <View style={[styles.progressBar, { backgroundColor: colors.surfaceAlt }]}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        backgroundColor: colors.ui.success,
                                        width: `${Math.min(100, (progress.currentChapter / item.totalEpisodes) * 100)}%`,
                                    },
                                ]}
                            />
                        </View>
                    )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.text.disabled} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={[styles.headerTitle, { color: colors.text.primary }]}>書庫</Text>
                    <Text style={[styles.headerCount, { color: colors.text.secondary }]}>
                        {novels.length > 0 ? `${novels.length}冊` : ''}
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.sortBtn, { backgroundColor: colors.surfaceAlt }]}
                    onPress={() => {
                        const next: LibrarySortBy = sortBy === 'updatedAt' ? 'lastRead' : 'updatedAt';
                        setSortBy(next);
                        setSetting(db, 'library_sort', next);
                    }}
                >
                    <Ionicons name="swap-vertical" size={14} color={colors.text.secondary} />
                    <Text style={[styles.sortBtnText, { color: colors.text.secondary }]}>
                        {sortBy === 'updatedAt' ? '更新日' : 'アクセス日'}
                    </Text>
                </TouchableOpacity>
            </View>

            {novels.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="book-outline" size={64} color={colors.text.disabled} />
                    <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
                        書庫は空です
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: colors.text.disabled }]}>
                        「追加」タブから小説を追加してください
                    </Text>
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: colors.ui.primary }]}
                        onPress={() => navigation.navigate('Search' as any)}
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 48,
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    headerTitle: { fontSize: 20, fontFamily: 'NotoSansJP_700Bold', letterSpacing: 0.3 },
    headerCount: { ...Typography.caption, marginLeft: Spacing.xs },
    sortBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: Radius.full,
    },
    sortBtnText: { fontSize: 11, fontWeight: '600' },
    list: { paddingHorizontal: Spacing.sm, paddingBottom: 100 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: Spacing.sm,
        borderRadius: Radius.md,
        marginBottom: 2,
    },
    cardContent: { flex: 1, marginRight: Spacing.xs },
    cardTitle: { fontSize: 14, fontFamily: 'NotoSansJP_600SemiBold', marginBottom: 1 },
    cardAuthor: { fontSize: 11, fontFamily: 'NotoSansJP_400Regular', flexShrink: 1 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    cardEpisodes: { fontSize: 11, fontFamily: 'NotoSansJP_400Regular' },
    badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
    badgeText: { fontSize: 9, fontWeight: '700' },
    progressBar: { height: 2, borderRadius: 1, marginTop: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 1 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl },
    emptyTitle: { ...Typography.title, marginTop: Spacing.md },
    emptySubtitle: { ...Typography.body, textAlign: 'center', marginTop: Spacing.xs },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        marginTop: Spacing.lg,
        gap: 4,
    },
    addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
