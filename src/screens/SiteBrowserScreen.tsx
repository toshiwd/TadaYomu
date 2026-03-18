import React, { useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { Spacing, Radius } from '../theme/colors';
import type { RootStackScreenProps } from '../navigation/types';

/**
 * Patterns that match a novel's top page (not chapter pages).
 * When the user navigates to one of these URLs, we show an "Add" button.
 */
const NOVEL_URL_PATTERNS = [
    // なろう: https://ncode.syosetu.com/nXXXXXX/
    /^https?:\/\/ncode\.syosetu\.com\/n\w+\/?$/i,
    // ノクターン: https://novel18.syosetu.com/nXXXXXX/
    /^https?:\/\/novel18\.syosetu\.com\/n\w+\/?$/i,
    // カクヨム: https://kakuyomu.jp/works/XXXX
    /^https?:\/\/kakuyomu\.jp\/works\/\d+\/?$/i,
    // ハ�Eメルン: https://syosetu.org/novel/XXXX/
    /^https?:\/\/syosetu\.org\/novel\/\d+\/?$/i,
];

function isNovelUrl(url: string): boolean {
    return NOVEL_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Default ranking / top pages for each site.
 */
const SITE_HOME_URLS: Record<string, string> = {
    'ncode.syosetu.com': 'https://yomou.syosetu.com/rank/top/',
    'novel18.syosetu.com': 'https://noc.syosetu.com/rank/top/',
    'kakuyomu.jp': 'https://kakuyomu.jp/rankings/all/weekly?work_variation=long',
    'syosetu.org': 'https://syosetu.org/?mode=rank',
    'mai-net.net': 'https://www.mai-net.net/',
    'akatsuki-novels.com': 'https://www.akatsuki-novels.com/',
};

export default function SiteBrowserScreen({ route, navigation }: RootStackScreenProps<'SiteBrowser'>) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const webViewRef = useRef<WebView>(null);

    const { siteDomain, url } = route.params;
    const startUrl = url || SITE_HOME_URLS[siteDomain] || `https://${siteDomain}`;

    const [currentUrl, setCurrentUrl] = useState(startUrl);
    const [canGoBack, setCanGoBack] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [showAddButton, setShowAddButton] = useState(false);

    const handleNavigationChange = useCallback((navState: any) => {
        setCurrentUrl(navState.url);
        setCanGoBack(navState.canGoBack);
        setPageLoading(navState.loading);
        setShowAddButton(isNovelUrl(navState.url));
    }, []);

    const handleAddNovel = useCallback(() => {
        navigation.navigate('AddNovel', { url: currentUrl });
    }, [navigation, currentUrl]);

    const handleGoBack = useCallback(() => {
        if (canGoBack) {
            webViewRef.current?.goBack();
        } else {
            navigation.goBack();
        }
    }, [canGoBack, navigation]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Browser toolbar */}
            <View
                style={[
                    styles.toolbar,
                    {
                        backgroundColor: colors.surface,
                        borderBottomColor: colors.border,
                        paddingTop: insets.top + 4,
                    },
                ]}
            >

                <View style={[styles.urlBar, { backgroundColor: colors.surfaceAlt }]}>
                    {pageLoading ? (
                        <ActivityIndicator size="small" color={colors.ui.primary} style={{ marginRight: 6 }} />
                    ) : (
                        <Ionicons name="globe-outline" size={14} color={colors.text.disabled} style={{ marginRight: 6 }} />
                    )}
                    <Text style={[styles.urlText, { color: colors.text.secondary }]} numberOfLines={1}>
                        {currentUrl}
                    </Text>
                </View>

                <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.toolbarBtn}>
                    <Ionicons name="refresh" size={20} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            {/* WebView */}
            <WebView
                ref={webViewRef}
                source={{ uri: startUrl }}
                style={styles.webview}
                onNavigationStateChange={handleNavigationChange}
                onShouldStartLoadWithRequest={(request) => {
                    // Keep ALL navigation inside the WebView  Enever open Chrome
                    setCurrentUrl(request.url);
                    setShowAddButton(isNovelUrl(request.url));
                    return true;
                }}
                setSupportMultipleWindows={false}
                javaScriptEnabled
                domStorageEnabled
                nestedScrollEnabled
                startInLoadingState
                userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                renderLoading={() => (
                    <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
                        <ActivityIndicator size="large" color={colors.ui.primary} />
                    </View>
                )}
            />

            {/* Floating Add button  Eappears when on a novel page */}
            {showAddButton && (
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: colors.ui.primary, bottom: insets.bottom + 16 }]}
                    onPress={handleAddNovel}
                    activeOpacity={0.8}
                >
                    <Ionicons name="add" size={20} color="#FFF" />
                    <Text style={styles.addButtonText}>この小説を追加する</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={[
                    styles.backButton,
                    {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        bottom: insets.bottom + 16,
                    },
                ]}
                onPress={handleGoBack}
                activeOpacity={0.8}
            >
                <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 8,
        paddingHorizontal: Spacing.xs,
        borderBottomWidth: 0.5,
        gap: 4,
    },
    toolbarBtn: {
        width: 40, height: 40,
        justifyContent: 'center', alignItems: 'center',
    },
    urlBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.sm,
    },
    urlText: {
        flex: 1,
        fontSize: 13,
    },
    webview: { flex: 1 },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: Radius.full,
        gap: 6,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    addButtonText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 15,
    },
    backButton: {
        position: 'absolute',
        left: 16,
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
});
