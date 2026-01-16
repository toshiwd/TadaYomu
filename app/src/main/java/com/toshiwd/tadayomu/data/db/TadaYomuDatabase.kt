package com.toshiwd.tadayomu.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [Work::class, Chapter::class, ReadingState::class], version = 1, exportSchema = false)
abstract class TadaYomuDatabase : RoomDatabase() {

    abstract fun tadaYomuDao(): TadaYomuDao

    companion object {
        @Volatile
        private var INSTANCE: TadaYomuDatabase? = null

        fun getDatabase(context: Context): TadaYomuDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    TadaYomuDatabase::class.java,
                    "tadayomu_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
