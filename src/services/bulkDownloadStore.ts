/**
 * Global bulk download store — singleton that persists across screen navigation.
 * Components subscribe to progress updates via useBulkDownloadProgress hook.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
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
    // Start the download — fire-and-forget (the promise resolves when done)
    _startBulkDownload(db, novel, (progress: BulkDownloadProgress) => {
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
    });

    // Set initial state immediately
    progressMap.set(novel.id, { state: 'running', downloaded: 0, total: novel.totalEpisodes });
    notify();
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

import { useSyncExternalStore } from 'react';

export function useBulkDownloadProgress(novelId: number): BulkDownloadProgress | null {
    return useSyncExternalStore(
        subscribe,
        () => getProgress(novelId),
    );
}

export type { BulkDownloadProgress, BulkDownloadState };
