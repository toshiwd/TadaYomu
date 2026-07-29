/**
 * Bulk download service — manages queued downloads with parallel execution,
 * retry with exponential backoff, and cancellation support.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Novel } from '../types/novel';
import {
    getChaptersByNovelId, countDownloadedChapters, updateNovel, getReadingProgress
} from '../database/repository';
import { downloadSingleChapter } from './downloadManager';

export type BulkDownloadState = 'idle' | 'running' | 'paused' | 'error';

export interface BulkDownloadProgress {
    state: BulkDownloadState;
    downloaded: number;
    total: number;
    errorMessage?: string;
}

type ProgressCallback = (progress: BulkDownloadProgress) => void;

const MAX_PARALLEL = 2;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const PERSIST_EVERY = 5;

/** Active jobs keyed by novelId */
const activeJobs = new Map<number, { cancelled: boolean }>();

/**
 * Start bulk downloading all un-downloaded chapters for a novel within R+1 ~ R+50.
 * Returns a promise that resolves when all downloads complete or are cancelled.
 */
export async function startBulkDownload(
    db: SQLiteDatabase,
    novel: Novel,
    onProgress: ProgressCallback,
): Promise<void> {
    // Cancel any existing job for this novel
    cancelBulkDownload(novel.id);

    const job = { cancelled: false };
    activeJobs.set(novel.id, job);

    const chapters = getChaptersByNovelId(db, novel.id);
    const progress = getReadingProgress(db, novel.id);
    const r = progress ? progress.currentChapter : 0;

    console.log(`[BulkDL] novel=${novel.id} totalChapters=${chapters.length} currentChapter=${r}`);

    // Filter to chapters after the current read position that need downloading, limit to 50
    const pending = chapters
        .filter((ch) => ch.index > r && !ch.isDownloaded && ch.url)
        .slice(0, 50);
    const total = chapters.length;
    let downloaded = countDownloadedChapters(db, novel.id);

    console.log(`[BulkDL] pending=${pending.length} downloaded=${downloaded} total=${total}`);

    if (pending.length === 0) {
        console.log(`[BulkDL] No pending chapters — returning idle immediately`);
        onProgress({ state: 'idle', downloaded, total });
        activeJobs.delete(novel.id);
        return;
    }

    onProgress({ state: 'running', downloaded, total });

    // Create a queue and process with limited parallelism
    const queue = [...pending];
    let errorOccurred = false;
    let errorMessage = '';
    let completedSincePersist = 0;

    const isStrictRateLimit = novel.siteType === 'kakuyomu' || novel.siteType === 'syosetu';
    const activeMaxParallel = isStrictRateLimit ? 1 : MAX_PARALLEL;
    const workerDelayMs = isStrictRateLimit ? 2000 : 0;

    async function processOne(): Promise<void> {
        while (queue.length > 0 && !job.cancelled && !errorOccurred) {
            const chapter = queue.shift()!;
            let success = false;

            for (let attempt = 0; attempt < MAX_RETRIES && !job.cancelled; attempt++) {
                try {
                    await downloadSingleChapter(db, chapter, novel.siteNovelId, novel.siteType);
                    success = true;
                    break;
                } catch (err: any) {
                    const msg = err?.message || '不明なエラー';

                    // Storage error — stop immediately
                    if (msg.includes('ENOSPC') || msg.includes('No space')) {
                        errorOccurred = true;
                        errorMessage = 'ストレージ容量が不足しています';
                        return;
                    }

                    // Network error — retry with backoff
                    if (attempt < MAX_RETRIES - 1 && !job.cancelled) {
                        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                        await new Promise((r) => setTimeout(r, delay));
                    } else {
                        errorOccurred = true;
                        errorMessage = `第${chapter.index}話のDLに失敗: ${msg}`;
                        return;
                    }
                }
            }

            if (success && !job.cancelled) {
                downloaded += 1;
                completedSincePersist += 1;
                if (completedSincePersist >= PERSIST_EVERY) {
                    updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
                    completedSincePersist = 0;
                }
                onProgress({ state: 'running', downloaded, total });

                if (workerDelayMs > 0 && queue.length > 0 && !job.cancelled) {
                    await new Promise((r) => setTimeout(r, workerDelayMs));
                }
            }
        }
    }

    // Run workers in parallel
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(activeMaxParallel, pending.length); i++) {
        workers.push(processOne());
    }
    await Promise.all(workers);

    activeJobs.delete(novel.id);

    // Final state
    if (completedSincePersist > 0) {
        updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
        completedSincePersist = 0;
    } else {
        downloaded = countDownloadedChapters(db, novel.id);
        updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
    }

    if (job.cancelled) {
        onProgress({ state: 'paused', downloaded, total });
    } else if (errorOccurred) {
        onProgress({ state: 'error', downloaded, total, errorMessage });
    } else {
        onProgress({ state: 'idle', downloaded, total });
    }
}

/** Cancel an active bulk download for a novel. */
export function cancelBulkDownload(novelId: number): void {
    const job = activeJobs.get(novelId);
    if (job) {
        job.cancelled = true;
        activeJobs.delete(novelId);
    }
}

/** Check if a bulk download is running for a novel. */
export function isBulkDownloading(novelId: number): boolean {
    return activeJobs.has(novelId);
}
