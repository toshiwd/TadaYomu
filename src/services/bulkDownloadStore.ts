/**
 * Global bulk download store — singleton that persists across screen navigation.
 * Components subscribe to progress updates via useBulkDownloadProgress hook.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import type { Novel } from '../types/novel';
import {
    startBulkDownload as _startBulkDownload,
    cancelBulkDownload as _cancelBulkDownload,
    type BulkDownloadProgress,
    type BulkDownloadState,
} from './bulkDownloadService';

// ── Module-level state (survives screen navigation) ──

const progressMap = new Map<number, BulkDownloadProgress>();
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((fn) => fn());
}

// ── Public API ──

export function getProgress(novelId: number): BulkDownloadProgress | null {
    return progressMap.get(novelId) ?? null;
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function startDownload(db: SQLiteDatabase, novel: Novel): void {
    // Set initial state immediately BEFORE starting the download
    // This prevents race conditions if the download logic finishes synchronously
    progressMap.set(novel.id, { state: 'running', downloaded: 0, total: novel.totalEpisodes });
    notify();

    // Start the download — fire-and-forget (the promise resolves when done)
    console.log(`[BulkStore] Starting bulk download for novel ${novel.id} (${novel.title})`);
    _startBulkDownload(db, novel, (progress: BulkDownloadProgress) => {
        console.log(`[BulkStore] Progress: state=${progress.state} ${progress.downloaded}/${progress.total}`);
        progressMap.set(novel.id, progress);
        notify();

        // Clean up completed/idle entries after a delay
        if (progress.state === 'idle' || progress.state === 'error') {
            setTimeout(() => {
                const current = progressMap.get(novel.id);
                if (current && (current.state === 'idle' || current.state === 'error')) {
                    progressMap.delete(novel.id);
                    notify();
                }
            }, 5000);
        }
    }).catch((err: any) => {
        console.error(`[BulkStore] Bulk download failed for novel ${novel.id}:`, err);
        progressMap.set(novel.id, {
            state: 'error',
            downloaded: 0,
            total: novel.totalEpisodes,
            errorMessage: err?.message || '不明なエラー',
        });
        notify();
        setTimeout(() => {
            const current = progressMap.get(novel.id);
            if (current && current.state === 'error') {
                progressMap.delete(novel.id);
                notify();
            }
        }, 5000);
    });
}

export function cancelDownload(novelId: number): void {
    _cancelBulkDownload(novelId);
    const current = progressMap.get(novelId);
    if (current) {
        progressMap.set(novelId, { ...current, state: 'paused' });
        notify();
    }
}

// ── React hook ──

export function useBulkDownloadProgress(novelId: number): BulkDownloadProgress | null {
    return useSyncExternalStore(
        subscribe,
        () => getProgress(novelId),
    );
}

export type { BulkDownloadProgress, BulkDownloadState };
