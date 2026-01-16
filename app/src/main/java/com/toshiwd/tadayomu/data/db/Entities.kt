package com.toshiwd.tadayomu.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

@Entity(tableName = "works")
data class Work(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
    val lastOpenedAt: Long?
)

@Entity(
    tableName = "chapters",
    foreignKeys = [
        ForeignKey(entity = Work::class, parentColumns = ["id"], childColumns = ["workId"], onDelete = ForeignKey.CASCADE)
    ]
)
data class Chapter(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val workId: Long,
    val chapterIndex: Int,
    val title: String,
    val contentPath: String, // 端末内のファイルパス
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "reading_states")
data class ReadingState(
    @PrimaryKey val chapterId: Long,
    val scrollPosition: Int, // WebViewのスクロール位置
    val scrollPercent: Float,
    val updatedAt: Long
)