import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
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
import { isSameLocalCalendarDay, normalizeBackgroundCursor } from './runtimeGuards';

const BACKGROUND_FETCH_TASK = 'tadayomu-background-fetch';
const BACKGROUND_INTERVAL_SECONDS = 30 * 60;
const BACKGROUND_DOWNLOAD_LIMIT = 5;
let executionInProgress = false;

export interface BackgroundTaskDiagnostics {
    registered: boolean;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastResult: string | null;
    lastMessage: string | null;
    lastSource: string | null;
}

interface BackgroundOutcome {
    result: BackgroundFetch.BackgroundFetchResult;
    label: string;
    message: string;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function recordBackgroundResult(
    db: SQLiteDatabase,
    label: string,
    message: string,
): void {
    setSetting(db, 'background_last_finished_at', new Date().toISOString());
    setSetting(db, 'background_last_result', label);
    setSetting(db, 'background_last_message', message);
}

async function executeBackgroundUpdate(manual: boolean): Promise<BackgroundOutcome> {
    if (executionInProgress) {
        return {
            result: BackgroundFetch.BackgroundFetchResult.NoData,
            label: 'already_running',
            message: '別のバックグラウンド更新が実行中です。',
        };
    }

    executionInProgress = true;
    let db: SQLiteDatabase | null = null;

    const finish = (
        result: BackgroundFetch.BackgroundFetchResult,
        label: string,
        message: string,
    ): BackgroundOutcome => {
        if (db) recordBackgroundResult(db, label, message);
        return { result, label, message };
    };

    try {
        db = openDatabaseSync('tadayomu.db');
        initDatabase(db);
        setSetting(db, 'background_last_started_at', new Date().toISOString());
        setSetting(db, 'background_last_source', manual ? 'manual' : 'automatic');

        if (getSetting(db, 'background_enabled') === '0') {
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'disabled', '自動更新は無効です。');
        }

        if (!manual) {
            const batteryState = await Battery.getBatteryStateAsync();
            if (batteryState !== Battery.BatteryState.CHARGING && batteryState !== Battery.BatteryState.FULL) {
                return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'not_charging', '充電中ではないため延期しました。');
            }
        }

        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isConnected || networkState.isInternetReachable === false) {
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'offline', 'インターネットに接続されていません。');
        }
        if (networkState.type !== Network.NetworkStateType.WIFI) {
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'not_wifi', 'Wi-Fi接続ではないため延期しました。');
        }

        const novels = getAllNovels(db);
        if (novels.length === 0) {
            return finish(BackgroundFetch.BackgroundFetchResult.NoData, 'no_novels', '本棚に作品がありません。');
        }

        const cursor = normalizeBackgroundCursor(
            getSetting(db, 'background_novel_cursor'),
            novels.length,
        );
        const novel = novels[cursor];
        setSetting(db, 'background_novel_cursor', String((cursor + 1) % novels.length));

        if (isBulkDownloading(novel.id)) {
            return finish(
                BackgroundFetch.BackgroundFetchResult.NoData,
                'bulk_running',
                `「${novel.title}」はダウンロード中です。`,
            );
        }

        let updateError: string | undefined;
        let newChapters = 0;
        if (!isSameLocalCalendarDay(novel.lastCheckedAt)) {
            newChapters = await checkNovelUpdates(db, novel, (progress) => {
                if (progress.phase === 'error') updateError = progress.message;
            });
        }

        const downloadNovel = getNovelById(db, novel.id) ?? novel;
        const beforeDownloaded = countDownloadedChapters(db, novel.id);
        let bulkError: string | undefined;
        await startBulkDownload(
            db,
            downloadNovel,
            (progress) => {
                if (progress.state === 'error') {
                    bulkError = progress.errorMessage || '不明なダウンロードエラー';
                }
            },
            { limit: manual ? 1 : BACKGROUND_DOWNLOAD_LIMIT },
        );
        const downloadedNow = Math.max(0, countDownloadedChapters(db, novel.id) - beforeDownloaded);

        if (updateError || bulkError) {
            const details = [updateError, bulkError].filter(Boolean).join(' / ');
            return finish(
                BackgroundFetch.BackgroundFetchResult.Failed,
                'failed',
                `「${novel.title}」: ${details}`,
            );
        }

        const message = `「${novel.title}」: 新着${newChapters}話、保存${downloadedNow}話`;
        const hasNewData = newChapters > 0 || downloadedNow > 0;
        return finish(
            hasNewData ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData,
            hasNewData ? 'new_data' : 'no_data',
            message,
        );
    } catch (error) {
        console.error('[BackgroundTask] Execution failed:', error);
        return finish(
            BackgroundFetch.BackgroundFetchResult.Failed,
            'failed',
            errorMessage(error),
        );
    } finally {
        executionInProgress = false;
        try {
            db?.closeSync();
        } catch (error) {
            console.warn('[BackgroundTask] Failed to close database:', error);
        }
    }
}

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    const outcome = await executeBackgroundUpdate(false);
    console.log(`[BackgroundTask] ${outcome.label}: ${outcome.message}`);
    return outcome.result;
});

export async function runBackgroundUpdateNow(): Promise<string> {
    const outcome = await executeBackgroundUpdate(true);
    return outcome.message;
}

export async function getBackgroundTaskDiagnostics(
    db: SQLiteDatabase,
): Promise<BackgroundTaskDiagnostics> {
    return {
        registered: await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK),
        lastStartedAt: getSetting(db, 'background_last_started_at'),
        lastFinishedAt: getSetting(db, 'background_last_finished_at'),
        lastResult: getSetting(db, 'background_last_result'),
        lastMessage: getSetting(db, 'background_last_message'),
        lastSource: getSetting(db, 'background_last_source'),
    };
}

export async function registerBackgroundTask(db?: SQLiteDatabase): Promise<boolean> {
    try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
            minimumInterval: BACKGROUND_INTERVAL_SECONDS,
            stopOnTerminate: false,
            startOnBoot: true,
        });
        if (db) {
            setSetting(db, 'background_registration_result', 'registered');
            setSetting(db, 'background_registration_message', 'OSへの登録を更新しました。');
        }
        return true;
    } catch (error) {
        console.error('[BackgroundTask] Registration failed:', error);
        if (db) {
            setSetting(db, 'background_registration_result', 'failed');
            setSetting(db, 'background_registration_message', errorMessage(error));
        }
        return false;
    }
}

export async function unregisterBackgroundTask(): Promise<boolean> {
    try {
        if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK)) {
            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
        }
        return true;
    } catch (error) {
        console.error('[BackgroundTask] Unregistration failed:', error);
        return false;
    }
}

export async function toggleBackgroundTask(db: SQLiteDatabase, enabled: boolean): Promise<boolean> {
    const changed = enabled
        ? await registerBackgroundTask(db)
        : await unregisterBackgroundTask();

    if (changed) setSetting(db, 'background_enabled', enabled ? '1' : '0');
    return changed;
}
