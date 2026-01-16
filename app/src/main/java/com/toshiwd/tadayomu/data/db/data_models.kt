package com.toshiwd.tadayomu.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 作品のメタデータを管理するエンティティ。
 * titleとauthorの組み合わせはユニーク。
 */
@Entity(
    tableName = "works",
    indices = [Index(value = ["title", "author"], unique = true)]
)
data class Work(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val author: String,
    val lastImportedDate: Long // 最終取り込み日時 (Unixタイムスタンプ)
)

/**
 * 各話の情報を管理するエンティティ。
 * workIdとchapterNumberの組み合わせはユニーク。
 */
@Entity(
    tableName = "chapters",
    foreignKeys = [ForeignKey(
        entity = Work::class,
        parentColumns = ["id"],
        childColumns = ["workId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index(value = ["workId", "chapterNumber"], unique = true)]
)
data class Chapter(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val workId: Long,
    val chapterNumber: Int,
    // 本文テキストが保存されている内部ストレージ上の相対パス。
    // 例: "tadayomu_data/{workId}/{chapterNumber}.txt"
    val contentPath: String,
    val importedDate: Long
)

/**
 * 作品ごとの読書状態を管理するエンティティ。
 * Workが削除されたら、このエンティティも自動的に削除される(onDelete = CASCADE)。
 */
@Entity(
    tableName = "reading_states",
    foreignKeys = [ForeignKey(
        entity = Work::class,
        parentColumns = ["id"],
        childColumns = ["workId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index(value = ["workId"])] // Foreign key index
)
data class ReadingState(
    @PrimaryKey val workId: Long, // Workエンティティへの外部キー
    var chapterNumber: Int,       // 現在読んでいる章番号
    var progress: Float,          // その章の進捗率 (0.0 ~ 1.0)
    var prevChapterNumber: Int,   // 直前に読んでいた章番号
    var prevProgress: Float       // 直前の章の進捗率
)
