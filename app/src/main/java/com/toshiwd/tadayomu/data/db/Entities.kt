package com.toshiwd.tadayomu.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

@Entity(tableName = "works")
data class Work(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val author: String,
    val lastImportedDate: Long
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
    val chapterNumber: Int,
    val title: String = ""
)

@Entity(tableName = "reading_states")
data class ReadingState(
    @PrimaryKey val workId: Long,
    val chapterNumber: Int,
    val progress: Float
)