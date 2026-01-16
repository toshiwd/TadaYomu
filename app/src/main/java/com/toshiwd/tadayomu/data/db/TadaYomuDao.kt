package com.toshiwd.tadayomu.data.db

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TadaYomuDao {

    // --- Work --- //

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertWork(work: Work): Long

    @Query("SELECT * FROM works WHERE title = :title AND author = :author")
    suspend fun getWorkByTitleAndAuthor(title: String, author: String): Work?

    @Query("UPDATE works SET lastImportedDate = :lastImportedDate WHERE id = :workId")
    suspend fun updateWorkLastImportedDate(workId: Long, lastImportedDate: Long)

    // --- Chapter --- //

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertChapter(chapter: Chapter): Long

    @Query("SELECT EXISTS(SELECT 1 FROM chapters WHERE workId = :workId AND chapterNumber = :chapterNumber)")
    suspend fun existsChapter(workId: Long, chapterNumber: Int): Boolean

    @Query("SELECT * FROM chapters WHERE workId = :workId ORDER BY chapterNumber ASC")
    fun getChaptersForWork(workId: Long): Flow<List<Chapter>>

    // --- ReadingState --- //

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertReadingState(readingState: ReadingState)

    @Query("SELECT * FROM reading_states WHERE workId = :workId")
    suspend fun getReadingState(workId: Long): ReadingState?

    // --- Combined (for Bookshelf) --- //

    @Query("""
        SELECT
            w.id AS workId,
            w.title,
            w.author,
            w.lastImportedDate,
            (SELECT COUNT(id) FROM chapters WHERE workId = w.id) AS chapterCount,
            rs.chapterNumber AS lastReadChapterNumber,
            rs.progress AS lastReadProgress
        FROM works AS w
        LEFT JOIN reading_states AS rs ON w.id = rs.workId
        ORDER BY w.lastImportedDate DESC
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
