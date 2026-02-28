import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography, Radius } from '../theme/colors';
import type { RootStackScreenProps } from '../navigation/types';
import { addNovelByUrl, type DownloadProgress } from '../services/downloadManager';

export default function AddNovelScreen({ route, navigation }: RootStackScreenProps<'AddNovel'>) {
    const { colors } = useTheme();
    const db = useSQLiteContext();
    const url = route.params?.url ?? '';

    const [progress, setProgress] = useState<DownloadProgress>({
        phase: 'info',
        current: 0,
        total: 0,
        message: '開始中...',
    });
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!url) {
            setProgress({ phase: 'error', current: 0, total: 0, message: 'URLが指定されていません' });
            setDone(true);
            return;
        }

        let cancelled = false;

        (async () => {
            const result = await addNovelByUrl(db, url, (p) => {
                if (!cancelled) setProgress(p);
            });

            if (!cancelled) {
                setDone(true);
                if (result.status === 'success' && result.novel) {
                    const savedNovel = result.novel;
                    // Navigate to the novel detail after short delay
                    setTimeout(() => {
                        navigation.replace('NovelDetail', { novelId: savedNovel.id });
                    }, 800);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [url, db]); // eslint-disable-line react-hooks/exhaustive-deps

    const isError = progress.phase === 'error';
    const isDone = progress.phase === 'done';
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                {/* Icon */}
                {isError ? (
                    <Ionicons name="alert-circle" size={56} color={colors.ui.error} />
                ) : isDone ? (
                    <Ionicons name="checkmark-circle" size={56} color={colors.ui.success} />
                ) : (
                    <ActivityIndicator size="large" color={colors.ui.primary} />
                )}

                {/* Message */}
                <Text style={[styles.message, { color: isError ? colors.ui.error : colors.text.primary }]}>
                    {progress.message}
                </Text>

                {/* Actions */}
                {done && (
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.ui.primary }]}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.buttonText}>
                            {isError ? '戻る' : '書庫へ'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    message: {
        ...Typography.subtitle,
        textAlign: 'center',
        marginTop: Spacing.lg,
        marginBottom: Spacing.md,
    },
    progressSection: { width: '100%', alignItems: 'center' },
    progressBar: {
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: Spacing.xs,
    },
    progressFill: { height: '100%', borderRadius: 3 },
    progressText: { ...Typography.caption },
    button: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        marginTop: Spacing.lg,
    },
    buttonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
