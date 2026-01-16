package com.toshiwd.tadayomu.data.repository

import com.toshiwd.tadayomu.data.db.TadaYomuDao
import com.toshiwd.tadayomu.data.db.Work
import com.toshiwd.tadayomu.data.db.WorkInfo
import kotlinx.coroutines.flow.Flow

class WorkRepository(private val tadaYomuDao: TadaYomuDao) {

    fun getLibraryWorks(): Flow<List<WorkInfo>> {
        return tadaYomuDao.getWorkInfoList()
    }

    suspend fun addDummyWork() {
        val dummyWork = Work(
            title = "ダミー作品 ${System.currentTimeMillis()}",
            author = "テスト著者",
            lastImportedDate = System.currentTimeMillis()
        )
        tadaYomuDao.insertWork(dummyWork)
    }
}