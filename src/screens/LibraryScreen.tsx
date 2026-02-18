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

    const testFetch = async () => {
        try {
            const url = 'https://ncode.syosetu.com/n9669bk/1/';
            const content = await syosetuAdapter.getChapterContent('n9669bk', url);

            Alert.alert(
                'Adapter Success',
                `Title: ${content.title}\nBody Length: ${content.bodyText.length}\n\nPreview:\n${content.bodyText.substring(0, 200)}`
            );
        } catch (e) {
            Alert.alert('Adapter Error', `${e}`);
        }
    };

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
                    <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text style={[styles.cardAuthor, { color: colors.text.secondary }]} numberOfLines={1}>
                        {item.author}
                    </Text>
                    <View style={styles.cardMeta}>
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
                <Ionicons name="chevron-forward" size={18} color={colors.text.disabled} />
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

                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: '#FF5722', marginTop: 20 }]}
                        onPress={testFetch}
                    >
                        <Text style={styles.addButtonText}>Test Fetch n9669bk/1/</Text>
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
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    headerTitle: { ...Typography.displaySmall },
    headerCount: { ...Typography.caption, marginLeft: Spacing.sm },
    sortBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: Radius.full,
    },
    sortBtnText: { fontSize: 12, fontWeight: '600' },
    list: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Radius.md,
        marginBottom: Spacing.sm,
    },
    cardContent: { flex: 1, marginRight: Spacing.sm },
    cardTitle: { ...Typography.subtitle, marginBottom: 2 },
    cardAuthor: { ...Typography.caption, marginBottom: Spacing.xs },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    cardEpisodes: { ...Typography.caption },
    badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    progressBar: { height: 3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },
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
