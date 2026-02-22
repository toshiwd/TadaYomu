/**
 * App self-update checker.
 * Checks a JSON manifest hosted on GitHub Releases.
 */
import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

/** Version manifest hosted on GitHub Pages / Releases */
interface VersionManifest {
    version: string;
    apkUrl: string;
    releaseNotes: string;
}

const MANIFEST_URL = 'https://github.com/toshiwd/TadaYomu/releases/latest/download/version.json';

/** Get the current app version */
export function getCurrentVersion(): string {
    return Constants.expoConfig?.version ?? '1.0.0';
}

/** Compare semver strings: returns 1 if a > b, -1 if a < b, 0 if equal */
function compareSemver(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

/**
 * Check for app updates and prompt user if available.
 * Returns true if an update was found.
 */
export async function checkForUpdates(
    silent = false,
    onStartDownload?: (manifest: VersionManifest) => void
): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
        // Fetch with 10 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            if (!silent) Alert.alert('確認失敗', `サーバーエラー (${res.status})\nしばらくしてからお試しください。`);
            return false;
        }

        let text = await res.text();
        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.substring(1);
        }
        text = text.trim();

        // Validate JSON format before parsing
        if (!text.startsWith('{') && !text.startsWith('[')) {
            console.warn('[UpdateChecker] Non-JSON response:', text.substring(0, 200));
            if (!silent) Alert.alert('確認失敗', '更新情報の形式が不正です。\nGitHubリリースの version.json を確認してください。');
            return false;
        }

        let manifest: VersionManifest;
        try {
            manifest = JSON.parse(text);
        } catch (e: any) {
            console.warn('[UpdateChecker] JSON parse error:', e.message, 'Content:', text.substring(0, 200));
            if (!silent) Alert.alert('確認失敗', `更新情報の解析に失敗しました。\nしばらくしてからお試しください。`);
            return false;
        }

        const current = getCurrentVersion();

        if (compareSemver(manifest.version, current) > 0) {
            Alert.alert(
                'アップデートあり',
                `新しいバージョン ${manifest.version} が利用可能です。\n\n${manifest.releaseNotes}`,
                [
                    { text: 'あとで', style: 'cancel' },
                    {
                        text: 'ダウンロード',
                        onPress: () => {
                            if (onStartDownload) {
                                onStartDownload(manifest);
                            } else {
                                Linking.openURL(manifest.apkUrl);
                            }
                        },
                    },
                ]
            );
            return true;
        } else if (!silent) {
            Alert.alert('最新版です', `現在のバージョン ${current} は最新です`);
        }
        return false;
    } catch (e: any) {
        if (!silent) {
            const msg = e.name === 'AbortError'
                ? '接続がタイムアウトしました。\nネットワーク接続を確認してください。'
                : `ネットワークエラーが発生しました。\nWi-Fiまたはモバイルデータの接続を確認してください。\n\n詳細: ${e.message}`;
            Alert.alert('確認失敗', msg);
        }
        console.error(e);
        return false;
    }
}

/**
 * Download the APK and trigger the Android package installer intent
 */
export async function downloadAndInstallUpdate(apkUrl: string) {
    if (Platform.OS !== 'android') return;

    try {
        // Force open in Chrome (Brave has issues with APK install prompts)
        // Uses Android intent:// URI to target com.android.chrome explicitly
        const strippedUrl = apkUrl.replace('https://', '');
        const chromeIntent = `intent://${strippedUrl}#Intent;scheme=https;package=com.android.chrome;end`;

        const canOpen = await Linking.canOpenURL(chromeIntent);
        if (canOpen) {
            await Linking.openURL(chromeIntent);
        } else {
            // Chrome not installed, fall back to default browser
            await Linking.openURL(apkUrl);
        }
    } catch (e: any) {
        // If intent fails, fall back to default browser
        try {
            await Linking.openURL(apkUrl);
        } catch (e2: any) {
            console.error('[Updater] Error:', e2);
            Alert.alert('インストール失敗', 'ブラウザを開けませんでした。\n\n詳細: ' + e2.message);
        }
    }
}
