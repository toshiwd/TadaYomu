import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import { getAllNovels } from '../database/repository';
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

        const db = openDatabaseSync('tadayomu.db');

        // Verify if we already ran today to prevent multiple large runs
        const todayStr = getTodayString();
        const novels = getAllNovels(db);

        // Find novels that haven't been checked today
        const novelsToCheck = novels.filter(n => {
            if (!n.lastCheckedAt) return true;
            return !n.lastCheckedAt.startsWith(todayStr);
        });

        if (novelsToCheck.length === 0) {
            console.log('[BackgroundTask] Skipped: All novels already checked today.');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        let newDataFound = false;

        // Process sequentially to be safe with DB/Network
        for (const novel of novelsToCheck) {
            console.log(`[BackgroundTask] Checking updates for novel: ${novel.title}`);
            const newChaptersCount = await checkNovelUpdates(db, novel);

            if (newChaptersCount > 0) {
                newDataFound = true;
                console.log(`[BackgroundTask] Found ${newChaptersCount} new chapters. Starting bulk download.`);

                // We need to wait for startBulkDownload to finish before moving to the next.
                // startBulkDownload takes a callback, so we wrap it in a Promise.
                await new Promise<void>((resolve) => {
                    startBulkDownload(db, novel, (progress) => {
                        if (progress.state === 'idle' || progress.state === 'error' || progress.state === 'paused') {
                            resolve();
                        }
                    });
                });
            } else {
                console.log(`[BackgroundTask] No new chapters for novel: ${novel.title}`);
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
export async function registerBackgroundTask() {
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
    } catch (err) {
        console.error('[BackgroundTask] Registration failed:', err);
    }
}
