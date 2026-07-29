import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
    countDownloadedChapters,
    getAllNovels,
    getNovelById,
    getSetting,
    setSetting,
} from '../database/repository';
import { initDatabase } from '../database/schema';
import { checkNovelUpdates } from './downloadManager';
import { startBulkDownload } from './bulkDownloadService';

const BACKGROUND_FETCH_TASK = 'tadayomu-background-fetch';

/**
 * Check if the current time is within the allowed window (e.g., 3:00 to 8:00).
 */
function isWithinTimeWindow(): boolean {
    const hour = new Date().getHours();
    return hour >= 3 && hour < 8;
}

/**
 * Formats a date string to just YYYY-MM-DD for simple daily checks.
 */
function getTodayString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Register the background task. Should be called in index.ts/App.tsx.
 */
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
        console.log('[BackgroundTask] Starting background fetch execution...');

        const db = openDatabaseSync('tadayomu.db');
        initDatabase(db);

        if (getSetting(db, 'background_enabled') === '0') {
            console.log('[BackgroundTask] Skipped: Background processing is disabled.');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // 1. Time Constraint
        if (!isWithinTimeWindow()) {
            console.log('[BackgroundTask] Skipped: Outside of time window (3:00 - 8:00).');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // 2. Battery Constraint (Must be charging)
        const batteryState = await Battery.getBatteryStateAsync();
        if (batteryState !== Battery.BatteryState.CHARGING && batteryState !== Battery.BatteryState.FULL) {
            console.log('[BackgroundTask] Skipped: Device is not charging.');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // 3. Network Constraint (Must be Wi-Fi / Unmetered)
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isConnected || !networkState.isInternetReachable) {
            console.log('[BackgroundTask] Skipped: No internet connection.');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }
        if (networkState.type !== Network.NetworkStateType.WIFI) {
            console.log('[BackgroundTask] Skipped: Not connected to Wi-Fi (Metered).');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Verify if we already ran today to prevent multiple large runs
        const todayStr = getTodayString();
        const novels = getAllNovels(db);

        if (novels.length === 0) {
            console.log('[BackgroundTask] Skipped: No novels in library.');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Find novels that haven't been checked today. Pending pre-downloads are still
        // handled for every novel below, even if the metadata check was already done.
        const shouldCheckToday = new Set<number>();
        for (const novel of novels) {
            if (!novel.lastCheckedAt || !novel.lastCheckedAt.startsWith(todayStr)) {
                shouldCheckToday.add(novel.id);
            }
        }

        let newDataFound = false;

        // Process sequentially to be safe with DB/Network
        for (const novel of novels) {
            let newChaptersCount = 0;
            if (shouldCheckToday.has(novel.id)) {
                console.log(`[BackgroundTask] Checking updates for novel: ${novel.title}`);
                newChaptersCount = await checkNovelUpdates(db, novel);
                if (newChaptersCount > 0) {
                    newDataFound = true;
                    console.log(`[BackgroundTask] Found ${newChaptersCount} new chapters.`);
                } else {
                    console.log(`[BackgroundTask] No new chapters for novel: ${novel.title}`);
                }
            } else {
                console.log(`[BackgroundTask] Skipping update check already done today: ${novel.title}`);
            }

            const downloadNovel = getNovelById(db, novel.id) ?? novel;
            const beforeDownloaded = countDownloadedChapters(db, novel.id);
            let bulkError: string | undefined;

            await startBulkDownload(db, downloadNovel, (progress) => {
                if (progress.state === 'error') {
                    bulkError = progress.errorMessage || 'unknown error';
                }
            });

            const afterDownloaded = countDownloadedChapters(db, novel.id);
            const downloadedNow = Math.max(0, afterDownloaded - beforeDownloaded);
            if (downloadedNow > 0) {
                newDataFound = true;
                console.log(`[BackgroundTask] Downloaded ${downloadedNow} chapters for novel: ${novel.title}`);
            }
            if (bulkError) {
                console.warn(`[BackgroundTask] Bulk download failed for ${novel.title}: ${bulkError}`);
            }
        }

        console.log('[BackgroundTask] Background fetch execution completed.');
        return newDataFound ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
        console.error('[BackgroundTask] Error during background fetch:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

/**
 * Register the task with the OS explicitly.
 */
export async function registerBackgroundTask(): Promise<boolean> {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
                minimumInterval: 60 * 60, // 1 hour (OS will ultimately decide)
                stopOnTerminate: false,   // Android only
                startOnBoot: true,        // Android only
            });
            console.log('[BackgroundTask] Registered successfully.');
        } else {
            console.log('[BackgroundTask] Task already registered.');
        }
        return true;
    } catch (err) {
        console.error('[BackgroundTask] Registration failed:', err);
        return false;
    }
}

/**
 * Unregister the background task from the OS.
 */
export async function unregisterBackgroundTask(): Promise<boolean> {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
        if (isRegistered) {
            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
            console.log('[BackgroundTask] Unregistered successfully.');
        }
        return true;
    } catch (err) {
        console.error('[BackgroundTask] Unregistration failed:', err);
        return false;
    }
}

/**
 * Toggle background task on/off and persist the setting.
 */
export async function toggleBackgroundTask(db: SQLiteDatabase, enabled: boolean): Promise<boolean> {
    const changed = enabled
        ? await registerBackgroundTask()
        : await unregisterBackgroundTask();

    if (changed) {
        setSetting(db, 'background_enabled', enabled ? '1' : '0');
    }

    return changed;
}
