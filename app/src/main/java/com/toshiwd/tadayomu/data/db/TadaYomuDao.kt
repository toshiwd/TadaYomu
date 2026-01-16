package com.toshiwd.tadayomu.data.db

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TadaYomuDao {

    // --- Work --- //

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertWork(work: Work): Long

    @Query("UPDATE works SET lastOpenedAt = :timestamp WHERE id = :workId")
    suspend fun updateWorkLastOpened(workId: Long, timestamp: Long)

    // --- Chapter --- //

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertChapter(chapter: Chapter): Long

    @Query("SELECT * FROM chapters WHERE workId = :workId ORDER BY chapterIndex ASC")
    suspend fun getChaptersByWorkId(workId: Long): List<Chapter>

    @Query("SELECT * FROM chapters WHERE id = :chapterId")
    suspend fun getChapter(chapterId: Long): Chapter?

    // --- ReadingState --- //

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertReadingState(readingState: ReadingState)

    @Query("SELECT * FROM reading_states WHERE chapterId = :chapterId")
    suspend fun getReadingState(chapterId: Long): ReadingState?

    @Query("SELECT rs.* FROM reading_states rs INNER JOIN chapters c ON rs.chapterId = c.id WHERE c.workId = :workId ORDER BY rs.updatedAt DESC LIMIT 1")
    suspend fun getLastReadingStateForWork(workId: Long): ReadingState?

    // --- Combined (for Bookshelf) --- //

    @Query("""
        SELECT
            w.id AS workId,
            w.title,
            '' AS author, -- MVPでは著者なし
            w.createdAt AS lastImportedDate, -- 表示用マッピング
            0 AS chapterCount, -- MVPでは簡易化
            0 AS lastReadChapterNumber,
            0.0 AS lastReadProgress
        FROM works AS w
        ORDER BY w.lastOpenedAt DESC, w.createdAt DESC
    """)
    fun getWorkInfoList(): Flow<List<WorkInfo>>
}

/**
 * 本棚画面の表示に必要な情報をまとめたDTO (Data Transfer Object)
 */
data class WorkInfo(
    val workId: Long,
    val title: String,
    val author: String,
    val lastImportedDate: Long,
    val chapterCount: Int,
    val lastReadChapterNumber: Int?,
    val lastReadProgress: Float?
)
