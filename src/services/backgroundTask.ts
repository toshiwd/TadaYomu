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
import { isBulkDownloading, startBulkDownload } from './bulkDownloadService';
import { logCrashEvent, reportNonFatal } from './crashReporter';
import { isSameLocalCalendarDay, normalizeBackgroundCursor } from './runtimeGuards';

const BACKGROUND_FETCH_TASK = 'tadayomu-background-fetch';
const BACKGROUND_INTERVAL_SECONDS = 30 * 60;
const BACKGROUND_DOWNLOAD_LIMIT = 5;
let backgroundExecutionInProgress = false;

export interface BackgroundTaskDiagnostics {
    enabled: boolean;
    registered: boolean;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastResult: string | null;
    lastMessage: string | null;
}

interface BackgroundRunOutcome {
    result: BackgroundFetch.BackgroundFetchResult;
    message: string;
}

function recordBackgroundResult(
    db: SQLiteDatabase,
    result: string,
    message: string,
): void {
    setSetting(db, 'background_last_finished_at', new Date().toISOString());
    setSetting(db, 'background_last_result', result);
    setSetting(db, 'background_last_message', message.slice(0, 300));
}

async function executeBackgroundUpdate(manual: boolean): Promise<BackgroundRunOutcome> {
    if (backgroundExecutionInProgress) {
        return {
            result: BackgroundFetch.BackgroundFetchResult.NoData,
            message: 'already_running',
        };
    }
    backgroundExecutionInProgress = true;
    let db: SQLiteDatabase | null = null;
    const finish = (
        result: BackgroundFetch.BackgroundFetchResult,
        resultLabel: string,
        message: string,
    ): BackgroundRunOutcome => {
        if (db) recordBackgroundResult(db, resultLabel, message);
        return { result, message };
    };

    try {
        console.log('[BackgroundTask] Starting background fetch execution...');
        logCrashEvent('background_fetch_started');

        db = openDatabaseSync('tadayomu.db');
        initDatabase(db);
        setSetting(db, 'background_last_started_at', new Date().toISOString());
        setSetting(db, 'background_last_source', manual ? 'manual' : 'automatic');

        if (getSetting(db, 'background_enabled') === '0') {
            console.log('[BackgroundTask] Skipped: Background processing is disabled.');
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'skipped', 'disabled');
        }

        if (!manual) {
            const batteryState = await Battery.getBatteryStateAsync();
            if (batteryState !== Battery.BatteryState.CHARGING && batteryState !== Battery.BatteryState.FULL) {
                console.log('[BackgroundTask] Skipped: Device is not charging.');
                return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'skipped', 'not_charging');
            }
        }

        // Automatic and manual checks both require Wi-Fi to avoid unexpected data use.
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isConnected || !networkState.isInternetReachable) {
            console.log('[BackgroundTask] Skipped: No internet connection.');
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'skipped', 'offline');
        }
        if (networkState.type !== Network.NetworkStateType.WIFI) {
            console.log('[BackgroundTask] Skipped: Not connected to Wi-Fi (Metered).');
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'skipped', 'not_wifi');
        }

        const novels = getAllNovels(db);
        if (novels.length === 0) {
            console.log('[BackgroundTask] Skipped: No novels in library.');
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'no_data', 'no_novels');
        }

        const cursor = normalizeBackgroundCursor(
            getSetting(db, 'background_novel_cursor'),
            novels.length,
        );
        const novel = novels[cursor];
        setSetting(db, 'background_novel_cursor', String((cursor + 1) % novels.length));
        logCrashEvent('background_fetch_work_started', novel.id);

        if (isBulkDownloading(novel.id)) {
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'skipped', 'download_already_running');
        }

        let updateError: string | undefined;
        let newChaptersCount = 0;
        if (!isSameLocalCalendarDay(novel.lastCheckedAt)) {
            newChaptersCount = await checkNovelUpdates(db, novel, (progress) => {
                if (progress.phase === 'error') updateError = progress.message;
            });
        }

        const downloadNovel = getNovelById(db, novel.id) ?? novel;
        const beforeDownloaded = countDownloadedChapters(db, novel.id);
        let bulkError: string | undefined;
        await startBulkDownload(db, downloadNovel, (progress) => {
            if (progress.state === 'error') {
                bulkError = progress.errorMessage || 'unknown error';
            }
        }, { limit: manual ? 1 : BACKGROUND_DOWNLOAD_LIMIT });

        const afterDownloaded = countDownloadedChapters(db, novel.id);
        const downloadedNow = Math.max(0, afterDownloaded - beforeDownloaded);

        if (updateError || bulkError) {
            const message = updateError || bulkError || 'unknown error';
            await reportNonFatal(new Error(message), {
                feature: 'background_download',
                operationType: 'background_update',
                errorCategory: 'background_update_failure',
                screenName: 'background_task',
                internalWorkId: novel.id,
            });
            return finish(BackgroundFetch.BackgroundFetchResult.Failed, 'failed', message);
        }

        const message = `novel=${novel.id};new=${newChaptersCount};downloaded=${downloadedNow}`;
        console.log('[BackgroundTask] Background fetch execution completed.');
        return finish(
            newChaptersCount > 0 || downloadedNow > 0
                ? BackgroundFetch.BackgroundFetchResult.NewData
                : BackgroundFetch.BackgroundFetchResult.NoData,
            newChaptersCount > 0 || downloadedNow > 0 ? 'new_data' : 'no_data',
            message,
        );
    } catch (error) {
        console.error('[BackgroundTask] Error during background fetch:', error);
        await reportNonFatal(error, {
            feature: 'background_update',
            operationType: 'background_fetch',
            errorCategory: 'background_fetch_failure',
            screenName: 'background_task',
        });
        return finish(
            BackgroundFetch.BackgroundFetchResult.Failed,
            'failed',
            error instanceof Error ? error.message : 'unknown error',
        );
    } finally {
        backgroundExecutionInProgress = false;
        try {
            db?.closeSync();
        } catch (closeError) {
            console.warn('[BackgroundTask] Failed to close database:', closeError);
        }
    }
}

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    const outcome = await executeBackgroundUpdate(false);
    return outcome.result;
});

export async function runBackgroundUpdateNow(): Promise<string> {
    const outcome = await executeBackgroundUpdate(true);
    return outcome.message;
}

export async function getBackgroundTaskDiagnostics(
    db: SQLiteDatabase,
): Promise<BackgroundTaskDiagnostics> {
    let registered = false;
    try {
        registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    } catch {
        registered = false;
    }
    return {
        enabled: getSetting(db, 'background_enabled') !== '0',
        registered,
        lastStartedAt: getSetting(db, 'background_last_started_at'),
        lastFinishedAt: getSetting(db, 'background_last_finished_at'),
        lastResult: getSetting(db, 'background_last_result'),
        lastMessage: getSetting(db, 'background_last_message'),
    };
}

/**
 * Register the task with the OS explicitly.
 */
export async function registerBackgroundTask(db?: SQLiteDatabase): Promise<boolean> {
    try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
            minimumInterval: BACKGROUND_INTERVAL_SECONDS,
            stopOnTerminate: false,
            startOnBoot: true,
        });
        db && setSetting(db, 'background_registration_result', 'registered');
        console.log('[BackgroundTask] Registered successfully.');
        return true;
    } catch (err) {
        console.error('[BackgroundTask] Registration failed:', err);
        if (db) {
            setSetting(db, 'background_registration_result', 'failed');
            setSetting(
                db,
                'background_registration_error',
                (err instanceof Error ? err.message : 'unknown error').slice(0, 300),
            );
        }
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
        ? await registerBackgroundTask(db)
        : await unregisterBackgroundTask();

    if (changed) {
        setSetting(db, 'background_enabled', enabled ? '1' : '0');
    }

    return changed;
}
