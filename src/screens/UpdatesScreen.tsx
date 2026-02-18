import React, { useCallback, useState } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography, Radius } from '../theme/colors';
import type { MainTabScreenProps } from '../navigation/types';
import type { Novel } from '../types/novel';
import { getAllNovels } from '../database/repository';
import { checkNovelUpdates } from '../services/downloadManager';

interface UpdateItem {
    novel: Novel;
    newCount: number;
    checkedAt: string;
}

export default function UpdatesScreen({ navigation }: MainTabScreenProps<'Updates'>) {
    const { colors } = useTheme();
    const db = useSQLiteContext();
    const [checking, setChecking] = useState(false);
    const [updates, setUpdates] = useState<UpdateItem[]>([]);
    const [lastCheck, setLastCheck] = useState<string | null>(null);

    const checkAll = useCallback(async () => {
        setChecking(true);
        const novels = getAllNovels(db);
        const found: UpdateItem[] = [];

        for (const novel of novels) {
            const newCount = await checkNovelUpdates(db, novel);
            if (newCount > 0) {
                found.push({ novel, newCount, checkedAt: new Date().toISOString() });
            }
        }

        setUpdates(found);
        setLastCheck(new Date().toLocaleString('ja-JP'));
        setChecking(false);
    }, [db]);

    useFocusEffect(
        useCallback(() => {
            // Auto-check on first focus only
            if (!lastCheck) {
                // Don't auto-check — user must press button
            }
        }, [lastCheck])
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.text.primary }]}>更新</Text>
            </View>

            <TouchableOpacity
                style={[styles.checkButton, { backgroundColor: colors.ui.primary }]}
                onPress={checkAll}
                disabled={checking}
                activeOpacity={0.7}
            >
                <Ionicons name="refresh" size={18} color="#FFF" />
                <Text style={styles.checkButtonText}>
                    {checking ? '確認中...' : '更新を確認'}
                </Text>
            </TouchableOpacity>

            {lastCheck && (
                <Text style={[styles.lastCheck, { color: colors.text.disabled }]}>
                    最終確認: {lastCheck}
                </Text>
            )}

            {updates.length > 0 ? (
                <FlatList
                    data={updates}
                    keyExtractor={(item) => String(item.novel.id)}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.updateCard, { backgroundColor: colors.surface }]}
                            onPress={() => navigation.navigate('NovelDetail' as any, { novelId: item.novel.id })}
                        >
                            <View style={styles.updateInfo}>
                                <Text style={[styles.updateTitle, { color: colors.text.primary }]} numberOfLines={1}>
                                    {item.novel.title}
                                </Text>
                                <Text style={[styles.updateMeta, { color: colors.ui.success }]}>
                                    +{item.newCount}話 更新
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.text.disabled} />
                        </TouchableOpacity>
                    )}
                />
            ) : (
                <View style={styles.emptyState}>
                    <Ionicons name="checkmark-circle-outline" size={48} color={colors.text.disabled} />
                    <Text style={[styles.emptyText, { color: colors.text.disabled }]}>
                        {lastCheck ? '新しい更新はありません' : '更新を確認するにはボタンを押してください'}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    headerTitle: { ...Typography.displaySmall },
    checkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        gap: 6,
        marginBottom: Spacing.sm,
    },
    checkButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    lastCheck: { ...Typography.caption, textAlign: 'center', marginBottom: Spacing.md },
    list: { paddingHorizontal: Spacing.md },
    updateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Radius.md,
        marginBottom: Spacing.sm,
    },
    updateInfo: { flex: 1 },
    updateTitle: { ...Typography.subtitle },
    updateMeta: { ...Typography.caption, marginTop: 2 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    emptyText: { ...Typography.body, textAlign: 'center', marginTop: Spacing.md },
});
