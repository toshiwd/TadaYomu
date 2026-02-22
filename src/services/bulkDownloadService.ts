/**
 * Bulk download service — manages queued downloads with parallel execution,
 * retry with exponential backoff, and cancellation support.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Novel, Chapter } from '../types/novel';
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

    // Filter to chapter after the current read position that need downloading, limit to 50
    const pending = chapters
        .filter((ch) => ch.index > r && !ch.isDownloaded && ch.url)
        .slice(0, 50);
    const total = chapters.length;
    let downloaded = countDownloadedChapters(db, novel.id);

    if (pending.length === 0) {
        onProgress({ state: 'idle', downloaded, total });
        activeJobs.delete(novel.id);
        return;
    }

    onProgress({ state: 'running', downloaded, total });

    // Create a queue and process with limited parallelism
    const queue = [...pending];
    let errorOccurred = false;
    let errorMessage = '';

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
                downloaded = countDownloadedChapters(db, novel.id);
                updateNovel(db, novel.id, { downloadedEpisodes: downloaded });
                onProgress({ state: 'running', downloaded, total });
            }
        }
    }

    // Run workers in parallel
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(MAX_PARALLEL, pending.length); i++) {
        workers.push(processOne());
    }
    await Promise.all(workers);

    activeJobs.delete(novel.id);

    // Final state
    downloaded = countDownloadedChapters(db, novel.id);
    updateNovel(db, novel.id, { downloadedEpisodes: downloaded });

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
