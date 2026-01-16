package com.toshiwd.tadayomu.data.repository

import android.content.Context
import android.net.Uri
import com.toshiwd.tadayomu.data.db.Chapter
import com.toshiwd.tadayomu.data.db.ReadingState
import com.toshiwd.tadayomu.data.db.TadaYomuDao
import com.toshiwd.tadayomu.data.db.Work
import com.toshiwd.tadayomu.data.db.WorkInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class WorkRepository(
    private val tadaYomuDao: TadaYomuDao,
    private val context: Context
) {

    fun getLibraryWorks(): Flow<List<WorkInfo>> {
        return tadaYomuDao.getWorkInfoList()
    }

    suspend fun getChapter(chapterId: Long): Chapter? = tadaYomuDao.getChapter(chapterId)
    
    suspend fun getReadingState(chapterId: Long): ReadingState? = tadaYomuDao.getReadingState(chapterId)

    suspend fun saveReadingProgress(chapterId: Long, scrollPosition: Int, scrollPercent: Float) {
        val state = ReadingState(
            chapterId = chapterId,
            scrollPosition = scrollPosition,
            scrollPercent = scrollPercent,
            updatedAt = System.currentTimeMillis()
        )
        tadaYomuDao.upsertReadingState(state)
        // 親WorkのLastOpenedも更新（簡易実装：ChapterからWorkIdを引くのが理想だが、ここでは省略または別途対応）
    }

    suspend fun getLastReadChapterId(workId: Long): Long? {
        val lastState = tadaYomuDao.getLastReadingStateForWork(workId)
        if (lastState != null) return lastState.chapterId
        
        val chapters = tadaYomuDao.getChaptersByWorkId(workId)
        return chapters.firstOrNull()?.id
    }

    suspend fun importFile(uri: Uri) = withContext(Dispatchers.IO) {
        val contentResolver = context.contentResolver
        val mimeType = contentResolver.getType(uri) ?: "text/plain"
        val isHtml = mimeType.contains("html")

        // 1. コンテンツ読み込み
        val content = contentResolver.openInputStream(uri)?.use { stream ->
            stream.bufferedReader().readText()
        } ?: return@withContext

        // 2. HTML整形（テキストならラップする）
        val htmlContent = if (isHtml) content else """
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="UTF-8">
            <style>
                body {
                    writing-mode: vertical-rl;
                    text-orientation: upright;
                    font-family: serif;
                    line-height: 1.8;
                    margin: 0;
                    padding: 2rem;
                    height: 100vh;
                    overflow-x: auto;
                    overflow-y: hidden;
                }
            </style>
            </head>
            <body>
            <p>${content.replace("\n", "<br>")}</p>
            </body>
            </html>
        """.trimIndent()

        // 3. ファイル保存
        val fileName = "${UUID.randomUUID()}.html"
        val file = File(context.filesDir, fileName)
        file.writeText(htmlContent)

        // 4. DB登録
        val now = System.currentTimeMillis()
        val workId = tadaYomuDao.insertWork(Work(title = "新規取込作品", createdAt = now, updatedAt = now, lastOpenedAt = now))
        tadaYomuDao.insertChapter(Chapter(workId = workId, chapterIndex = 1, title = "第1章", contentPath = file.absolutePath, createdAt = now, updatedAt = now))
    }
}