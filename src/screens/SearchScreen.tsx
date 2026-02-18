import React, { useState } from 'react';
import {
    View, Text, TextInput, StyleSheet, TouchableOpacity,
    ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Typography, Radius } from '../theme/colors';
import type { MainTabScreenProps } from '../navigation/types';

const SITE_PATTERNS: { label: string; domain: string; icon: string }[] = [
    { label: '小説家になろう', domain: 'ncode.syosetu.com', icon: 'book' },
    { label: 'ノクターンノベルズ', domain: 'novel18.syosetu.com', icon: 'moon' },
    { label: 'カクヨム', domain: 'kakuyomu.jp', icon: 'reader' },
    { label: 'ハーメルン', domain: 'syosetu.org', icon: 'library' },
    { label: 'アルカディア', domain: 'mai-net.net', icon: 'globe' },
    { label: '暁', domain: 'akatsuki-novels.com', icon: 'sunny' },
];

export default function SearchScreen({ navigation }: MainTabScreenProps<'Search'>) {
    const { colors } = useTheme();
    const [urlInput, setUrlInput] = useState('');
    const [error, setError] = useState('');

    const handleAddByUrl = () => {
        setError('');
        const url = urlInput.trim();

        if (!url) {
            setError('URLを入力してください');
            return;
        }

        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            const supported = SITE_PATTERNS.some((s) => parsed.hostname.includes(s.domain));
            if (!supported) {
                setError('対応していないサイトです');
                return;
            }
            navigation.navigate('AddNovel', { url: parsed.toString() });
        } catch {
            setError('有効なURLを入力してください');
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colors.text.primary }]}>追加</Text>
                </View>

                {/* URL input */}
                <View style={styles.inputSection}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                        URLから追加
                    </Text>
                    <View style={[styles.inputRow, { backgroundColor: colors.surface }]}>
                        <Ionicons name="link" size={18} color={colors.text.disabled} />
                        <TextInput
                            style={[styles.input, { color: colors.text.primary }]}
                            placeholder="小説のURLを入力..."
                            placeholderTextColor={colors.text.disabled}
                            value={urlInput}
                            onChangeText={(t) => { setUrlInput(t); setError(''); }}
                            keyboardType="url"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={handleAddByUrl}
                        />
                        <TouchableOpacity
                            style={[styles.goButton, { backgroundColor: colors.ui.primary }]}
                            onPress={handleAddByUrl}
                        >
                            <Ionicons name="arrow-forward" size={18} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    {error ? (
                        <Text style={[styles.errorText, { color: colors.ui.error }]}>{error}</Text>
                    ) : null}
                </View>

                {/* Supported sites */}
                <View style={styles.sitesSection}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>対応サイト</Text>
                    {SITE_PATTERNS.map((site) => (
                        <TouchableOpacity
                            key={site.domain}
                            style={[styles.siteRow, { backgroundColor: colors.surface }]}
                            onPress={() => navigation.navigate('SiteBrowser', { siteDomain: site.domain, siteName: site.label })}
                            activeOpacity={0.7}
                        >
                            <Ionicons name={site.icon as any} size={20} color={colors.text.secondary} />
                            <View style={styles.siteInfo}>
                                <Text style={[styles.siteName, { color: colors.text.primary }]}>{site.label}</Text>
                                <Text style={[styles.siteDomain, { color: colors.text.disabled }]}>{site.domain}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.text.disabled} />
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingBottom: 100 },
    header: {
        paddingTop: 56,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    headerTitle: { ...Typography.displaySmall },
    inputSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
    sectionTitle: { ...Typography.subtitle, marginBottom: Spacing.sm },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.sm,
        gap: Spacing.xs,
    },
    input: { flex: 1, paddingVertical: 12, fontSize: 15 },
    goButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: { ...Typography.caption, marginTop: 4 },
    sitesSection: { paddingHorizontal: Spacing.lg },
    siteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Radius.md,
        marginBottom: Spacing.xs,
        gap: Spacing.sm,
    },
    siteInfo: { flex: 1 },
    siteName: { ...Typography.body, fontWeight: '600' },
    siteDomain: { ...Typography.caption },
});
