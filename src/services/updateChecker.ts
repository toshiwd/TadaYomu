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
export async function checkForUpdates(silent = false): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) {
            if (!silent) Alert.alert('確認失敗', 'バージョン情報を取得できませんでした');
            return false;
        }

        const manifest: VersionManifest = await res.json();
        const current = getCurrentVersion();

        if (compareSemver(manifest.version, current) > 0) {
            Alert.alert(
                'アップデートあり',
                `新しいバージョン ${manifest.version} が利用可能です。\n\n${manifest.releaseNotes}`,
                [
                    { text: 'あとで', style: 'cancel' },
                    {
                        text: 'ダウンロード',
                        onPress: () => Linking.openURL(manifest.apkUrl),
                    },
                ]
            );
            return true;
        } else if (!silent) {
            Alert.alert('最新版です', `現在のバージョン ${current} は最新です`);
        }
        return false;
    } catch {
        if (!silent) Alert.alert('確認失敗', 'ネットワークエラーが発生しました');
        return false;
    }
}
