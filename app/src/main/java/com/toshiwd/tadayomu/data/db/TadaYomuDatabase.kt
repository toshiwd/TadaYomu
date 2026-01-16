package com.toshiwd.tadayomu.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [Work::class, Chapter::class, ReadingState::class],
    version = 1,
    exportSchema = false
)
abstract class TadaYomuDatabase : RoomDatabase() {
    abstract fun tadaYomuDao(): TadaYomuDao

    companion object {
        @Volatile
        private var Instance: TadaYomuDatabase? = null

        fun getDatabase(context: Context): TadaYomuDatabase {
            return Instance ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    TadaYomuDatabase::class.java,
                    "tadayomu_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                .also { Instance = it }
            }
        }
    }
}