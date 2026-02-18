import React, { useCallback, useState, useRef } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
    ToastAndroid, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography, Radius } from '../theme/colors';
import type { RootStackScreenProps } from '../navigation/types';
import type { Novel, Chapter } from '../types/novel';
import {
    getNovelById, getChaptersByNovelId, getReadingProgress, deleteNovel,
    countDownloadedChapters, updateNovel,
} from '../database/repository';
import { deleteNovelData, downloadSingleChapter } from '../services/downloadManager';
import {
    startBulkDownload, cancelBulkDownload, isBulkDownloading,
    type BulkDownloadState, type BulkDownloadProgress,
} from '../services/bulkDownloadService';

export default function NovelDetailScreen({ route, navigation }: RootStackScreenProps<'NovelDetail'>) {
    const { colors } = useTheme();
    const db = useSQLiteContext();
    const novelId = route.params.novelId;

    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [currentChapter, setCurrentChapter] = useState(1);
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const [bulkState, setBulkState] = useState<BulkDownloadState>('idle');
    const [bulkProgress, setBulkProgress] = useState({ downloaded: 0, total: 0 });

    const loadData = useCallback(() => {
        const n = getNovelById(db, novelId);
        setNovel(n);
        if (n) {
            setChapters(getChaptersByNovelId(db, novelId));
            const progress = getReadingProgress(db, novelId);
            if (progress) setCurrentChapter(progress.currentChapter);
        }
    }, [db, novelId]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const showToast = (msg: string) => {
        if (Platform.OS === 'android') {
            ToastAndroid.show(msg, ToastAndroid.SHORT);
        } else {
            Alert.alert('', msg);
        }
    };

    const handleBulkDownload = async () => {
        if (!novel || bulkState === 'running') return;
        setBulkState('running');
        await startBulkDownload(db, novel, (progress: BulkDownloadProgress) => {
            setBulkState(progress.state);
            setBulkProgress({ downloaded: progress.downloaded, total: progress.total });
            if (progress.state === 'error' && progress.errorMessage) {
                showToast(progress.errorMessage);
            }
            // Refresh data
            loadData();
        });
    };

    const handleCancelBulk = () => {
        if (novel) {
            cancelBulkDownload(novel.id);
            setBulkState('paused');
            showToast('ダウンロードを中断しました');
        }
    };

    const handleDelete = () => {
        Alert.alert('削除確認', 'この小説を書庫から削除しますか？', [
            { text: 'キャンセル', style: 'cancel' },
            {
                text: '削除',
                style: 'destructive',
                onPress: () => {
                    if (novel) {
                        cancelBulkDownload(novel.id);
                        deleteNovelData(novel.siteNovelId);
                        deleteNovel(db, novel.id);
                    }
                    navigation.goBack();
                },
            },
        ]);
    };

    const handleContinueReading = () => {
        navigation.navigate('Reader', { novelId, chapterIndex: currentChapter });
    };

    const handleDownloadChapter = async (chapter: Chapter) => {
        if (!novel || downloadingIndex !== null) return;
        setDownloadingIndex(chapter.index);
        try {
            await downloadSingleChapter(db, chapter, novel.siteNovelId, novel.siteType);
            // Update download count
            const downloaded = countDownloadedChapters(db, novel.id);
            updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
            loadData();
        } catch (err: any) {
            Alert.alert('ダウンロード失敗', err?.message || '不明なエラー');
        } finally {
            setDownloadingIndex(null);
        }
    };

    if (!novel) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Text style={[styles.errorText, { color: colors.text.disabled }]}>小説が見つかりません</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Text style={[styles.title, { color: colors.text.primary }]}>{novel.title}</Text>
                <Text style={[styles.author, { color: colors.text.secondary }]}>{novel.author}</Text>
                <Text style={[styles.meta, { color: colors.text.disabled }]}>
                    {novel.downloadedEpisodes}/{novel.totalEpisodes}話 ダウンロード済
                    {novel.isComplete ? ' · 完結' : ' · 連載中'}
                </Text>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.continueButton, { backgroundColor: colors.ui.primary }]}
                        onPress={handleContinueReading}
                    >
                        <Ionicons name="book" size={16} color="#FFF" />
                        <Text style={styles.continueText}>
                            {currentChapter > 1 ? `第${currentChapter}話から` : '読む'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.deleteButton, { borderColor: colors.ui.error }]}
                        onPress={handleDelete}
                    >
                        <Ionicons name="trash-outline" size={16} color={colors.ui.error} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Synopsis */}
            {novel.synopsis ? (
                <View style={styles.synopsisSection}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>あらすじ</Text>
                    <Text style={[styles.synopsis, { color: colors.text.secondary }]} numberOfLines={5}>
                        {novel.synopsis}
                    </Text>
                </View>
            ) : null}

            {/* Chapter list header with bulk DL */}
            <View style={styles.chapterHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    目次 ({chapters.length}話)
                </Text>
                <View style={styles.bulkActions}>
                    {bulkState === 'running' ? (
                        <>
                            <View style={[styles.bulkBtn, styles.bulkBtnRunning, { backgroundColor: colors.ui.primary + '15' }]}>
                                <ActivityIndicator size="small" color={colors.ui.primary} />
                                <Text style={[styles.bulkBtnText, { color: colors.ui.primary }]}>
                                    {bulkProgress.downloaded}/{bulkProgress.total}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.bulkBtn, { borderColor: colors.ui.error, borderWidth: 1 }]}
                                onPress={handleCancelBulk}
                            >
                                <Text style={[styles.bulkBtnText, { color: colors.ui.error }]}>中断</Text>
                            </TouchableOpacity>
                        </>
                    ) : novel && novel.downloadedEpisodes >= novel.totalEpisodes ? (
                        <View style={[styles.bulkBtn, { backgroundColor: colors.ui.success + '15' }]}>
                            <Ionicons name="checkmark-circle" size={14} color={colors.ui.success} />
                            <Text style={[styles.bulkBtnText, { color: colors.ui.success }]}>DL済み</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.bulkBtn, { backgroundColor: colors.ui.primary }]}
                            onPress={handleBulkDownload}
                        >
                            <Ionicons name="download-outline" size={14} color="#FFF" />
                            <Text style={[styles.bulkBtnText, { color: '#FFF' }]}>一括DL</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            <FlatList
                data={chapters}
                keyExtractor={(item) => String(item.id ?? item.index)}
                contentContainerStyle={styles.chapterList}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[
                            styles.chapterRow,
                            { backgroundColor: item.index === currentChapter ? colors.surfaceAlt : 'transparent' },
                        ]}
                        onPress={() => navigation.navigate('Reader', { novelId, chapterIndex: item.index })}
                    >
                        <Text style={[
                            styles.chapterIndex,
                            { color: item.isDownloaded ? colors.text.disabled : colors.text.disabled + '66' },
                        ]}>
                            {item.index}
                        </Text>
                        <Text
                            style={[
                                styles.chapterTitle,
                                { color: item.isDownloaded ? colors.text.primary : colors.text.disabled },
                            ]}
                            numberOfLines={1}
                        >
                            {item.title || `第${item.index}話`}
                        </Text>
                        {!item.isDownloaded && (
                            downloadingIndex === item.index ? (
                                <ActivityIndicator size="small" color={colors.ui.primary} />
                            ) : (
                                <TouchableOpacity
                                    onPress={() => handleDownloadChapter(item)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="cloud-download-outline" size={18} color={colors.ui.primary} />
                                </TouchableOpacity>
                            )
                        )}
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
    title: { ...Typography.title, marginBottom: 4 },
    author: { ...Typography.body, marginBottom: 4 },
    meta: { ...Typography.caption, marginBottom: Spacing.md },
    actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        gap: 6,
        flex: 1,
        justifyContent: 'center',
    },
    continueText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    deleteButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    synopsisSection: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    sectionTitle: { ...Typography.subtitle },
    chapterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.xs,
    },
    bulkActions: { flexDirection: 'row', gap: 6 },
    bulkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: Radius.full,
        gap: 4,
    },
    bulkBtnRunning: {},
    bulkBtnText: { fontSize: 12, fontWeight: '700' },
    synopsis: { ...Typography.body, lineHeight: 22 },
    chapterList: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
    chapterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: Spacing.sm,
        borderRadius: Radius.sm,
        gap: Spacing.sm,
    },
    chapterIndex: { width: 32, textAlign: 'right', ...Typography.caption, fontWeight: '600' },
    chapterTitle: { flex: 1, ...Typography.body },
    errorText: { ...Typography.body, textAlign: 'center', marginTop: 100 },
});
