/** In-app APK update flow backed by the latest GitHub Release manifest. */
import { Alert, Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import {
  compareSemver,
  parseVersionManifest,
  type VersionManifest,
} from "./updateManifest";

export { compareSemver, parseVersionManifest, type VersionManifest } from "./updateManifest";

export type UpdateProgress =
  | { phase: "checking" }
  | { phase: "downloading"; progress: number | null }
  | { phase: "installing" }
  | { phase: "idle" };

const MANIFEST_URL =
  "https://github.com/toshiwd/TadaYomu/releases/latest/download/version.json";
const APK_MIME_TYPE = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;
let activeUpdatePromise: Promise<void> | null = null;

export function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

async function fetchManifest(): Promise<VersionManifest> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseVersionManifest(await response.text());
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadAndOpenInstaller(
  manifest: VersionManifest,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!FileSystem.cacheDirectory) throw new Error("APKの保存先を利用できません");
  const destination = `${FileSystem.cacheDirectory}TadaYomu-${manifest.version}.apk`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  onProgress?.({ phase: "downloading", progress: 0 });

  const download = FileSystem.createDownloadResumable(
    manifest.apkUrl,
    destination,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onProgress?.({
        phase: "downloading",
        progress: totalBytesExpectedToWrite > 0
          ? Math.max(0, Math.min(1, totalBytesWritten / totalBytesExpectedToWrite))
          : null,
      });
    },
  );
  const result = await download.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`APKのダウンロードに失敗しました (${result?.status ?? "unknown"})`);
  }

  onProgress?.({ phase: "installing" });
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

function startAvailableUpdate(
  manifest: VersionManifest,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  if (activeUpdatePromise) return activeUpdatePromise;
  const task = downloadAndOpenInstaller(manifest, onProgress)
    .catch((error: any) => {
      console.error("[UpdateChecker] In-app update failed", error);
      Alert.alert(
        "アップデート失敗",
        `APKを準備できませんでした。通信状態と「不明なアプリのインストール」許可を確認してください。\n\n${error?.message ?? "不明なエラー"}`,
      );
    })
    .finally(() => {
      activeUpdatePromise = null;
      onProgress?.({ phase: "idle" });
    });
  activeUpdatePromise = task;
  return task;
}

export async function checkForUpdates(
  silent = false,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  onProgress?.({ phase: "checking" });
  try {
    const manifest = await fetchManifest();
    const current = getCurrentVersion();
    if (compareSemver(manifest.version, current) <= 0) {
      onProgress?.({ phase: "idle" });
      if (!silent) Alert.alert("最新版です", `現在のバージョン ${current} は最新です`);
      return false;
    }

    if (!silent) {
      await startAvailableUpdate(manifest, onProgress);
    } else {
      onProgress?.({ phase: "idle" });
      Alert.alert(
        "アップデートあり",
        `新しいバージョン ${manifest.version} が利用可能です。\n\n${manifest.releaseNotes}`,
        [
          { text: "あとで", style: "cancel" },
          { text: "アップデート", onPress: () => void startAvailableUpdate(manifest, onProgress) },
        ],
      );
    }
    return true;
  } catch (error: any) {
    onProgress?.({ phase: "idle" });
    console.error("[UpdateChecker] Update check failed", error);
    if (!silent) {
      Alert.alert(
        "確認失敗",
        error?.name === "AbortError"
          ? "接続がタイムアウトしました。ネットワーク接続を確認してください。"
          : `更新情報を確認できませんでした。\n\n${error?.message ?? "通信エラー"}`,
      );
    }
    return false;
  }
}
