package com.toshiwd.tadayomu.data.db;

import androidx.annotation.NonNull;
import androidx.room.DatabaseConfiguration;
import androidx.room.InvalidationTracker;
import androidx.room.RoomDatabase;
import androidx.room.RoomOpenHelper;
import androidx.room.migration.AutoMigrationSpec;
import androidx.room.migration.Migration;
import androidx.room.util.DBUtil;
import androidx.room.util.TableInfo;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import java.lang.Class;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class AppDatabase_Impl extends AppDatabase {
  private volatile TadaYomuDao _tadaYomuDao;

  @Override
  @NonNull
  protected SupportSQLiteOpenHelper createOpenHelper(@NonNull final DatabaseConfiguration config) {
    final SupportSQLiteOpenHelper.Callback _openCallback = new RoomOpenHelper(config, new RoomOpenHelper.Delegate(1) {
      @Override
      public void createAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `works` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `title` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `updatedAt` INTEGER NOT NULL, `lastOpenedAt` INTEGER)");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_works_lastOpenedAt` ON `works` (`lastOpenedAt`)");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_works_createdAt` ON `works` (`createdAt`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `chapters` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `workId` INTEGER NOT NULL, `chapterIndex` INTEGER NOT NULL, `title` TEXT NOT NULL, `contentPath` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `updatedAt` INTEGER NOT NULL, FOREIGN KEY(`workId`) REFERENCES `works`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_chapters_workId` ON `chapters` (`workId`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `reading_states` (`chapterId` INTEGER NOT NULL, `scrollPosition` INTEGER NOT NULL, `scrollPercent` REAL NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`chapterId`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)");
        db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, '61efad2bd49894e8e7d8546473c0129d')");
      }

      @Override
      public void dropAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("DROP TABLE IF EXISTS `works`");
        db.execSQL("DROP TABLE IF EXISTS `chapters`");
        db.execSQL("DROP TABLE IF EXISTS `reading_states`");
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onDestructiveMigration(db);
          }
        }
      }

      @Override
      public void onCreate(@NonNull final SupportSQLiteDatabase db) {
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onCreate(db);
          }
        }
      }

      @Override
      public void onOpen(@NonNull final SupportSQLiteDatabase db) {
        mDatabase = db;
        db.execSQL("PRAGMA foreign_keys = ON");
        internalInitInvalidationTracker(db);
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onOpen(db);
          }
        }
      }

      @Override
      public void onPreMigrate(@NonNull final SupportSQLiteDatabase db) {
        DBUtil.dropFtsSyncTriggers(db);
      }

      @Override
      public void onPostMigrate(@NonNull final SupportSQLiteDatabase db) {
      }

      @Override
      @NonNull
      public RoomOpenHelper.ValidationResult onValidateSchema(
          @NonNull final SupportSQLiteDatabase db) {
        final HashMap<String, TableInfo.Column> _columnsWorks = new HashMap<String, TableInfo.Column>(5);
        _columnsWorks.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorks.put("title", new TableInfo.Column("title", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorks.put("createdAt", new TableInfo.Column("createdAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorks.put("updatedAt", new TableInfo.Column("updatedAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorks.put("lastOpenedAt", new TableInfo.Column("lastOpenedAt", "INTEGER", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysWorks = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesWorks = new HashSet<TableInfo.Index>(2);
        _indicesWorks.add(new TableInfo.Index("index_works_lastOpenedAt", false, Arrays.asList("lastOpenedAt"), Arrays.asList("ASC")));
        _indicesWorks.add(new TableInfo.Index("index_works_createdAt", false, Arrays.asList("createdAt"), Arrays.asList("ASC")));
        final TableInfo _infoWorks = new TableInfo("works", _columnsWorks, _foreignKeysWorks, _indicesWorks);
        final TableInfo _existingWorks = TableInfo.read(db, "works");
        if (!_infoWorks.equals(_existingWorks)) {
          return new RoomOpenHelper.ValidationResult(false, "works(com.toshiwd.tadayomu.data.db.Work).\n"
                  + " Expected:\n" + _infoWorks + "\n"
                  + " Found:\n" + _existingWorks);
        }
        final HashMap<String, TableInfo.Column> _columnsChapters = new HashMap<String, TableInfo.Column>(7);
        _columnsChapters.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("workId", new TableInfo.Column("workId", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("chapterIndex", new TableInfo.Column("chapterIndex", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("title", new TableInfo.Column("title", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("contentPath", new TableInfo.Column("contentPath", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("createdAt", new TableInfo.Column("createdAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsChapters.put("updatedAt", new TableInfo.Column("updatedAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysChapters = new HashSet<TableInfo.ForeignKey>(1);
        _foreignKeysChapters.add(new TableInfo.ForeignKey("works", "CASCADE", "NO ACTION", Arrays.asList("workId"), Arrays.asList("id")));
        final HashSet<TableInfo.Index> _indicesChapters = new HashSet<TableInfo.Index>(1);
        _indicesChapters.add(new TableInfo.Index("index_chapters_workId", false, Arrays.asList("workId"), Arrays.asList("ASC")));
        final TableInfo _infoChapters = new TableInfo("chapters", _columnsChapters, _foreignKeysChapters, _indicesChapters);
        final TableInfo _existingChapters = TableInfo.read(db, "chapters");
        if (!_infoChapters.equals(_existingChapters)) {
          return new RoomOpenHelper.ValidationResult(false, "chapters(com.toshiwd.tadayomu.data.db.Chapter).\n"
                  + " Expected:\n" + _infoChapters + "\n"
                  + " Found:\n" + _existingChapters);
        }
        final HashMap<String, TableInfo.Column> _columnsReadingStates = new HashMap<String, TableInfo.Column>(4);
        _columnsReadingStates.put("chapterId", new TableInfo.Column("chapterId", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsReadingStates.put("scrollPosition", new TableInfo.Column("scrollPosition", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsReadingStates.put("scrollPercent", new TableInfo.Column("scrollPercent", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsReadingStates.put("updatedAt", new TableInfo.Column("updatedAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysReadingStates = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesReadingStates = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoReadingStates = new TableInfo("reading_states", _columnsReadingStates, _foreignKeysReadingStates, _indicesReadingStates);
        final TableInfo _existingReadingStates = TableInfo.read(db, "reading_states");
        if (!_infoReadingStates.equals(_existingReadingStates)) {
          return new RoomOpenHelper.ValidationResult(false, "reading_states(com.toshiwd.tadayomu.data.db.ReadingState).\n"
                  + " Expected:\n" + _infoReadingStates + "\n"
                  + " Found:\n" + _existingReadingStates);
        }
        return new RoomOpenHelper.ValidationResult(true, null);
      }
    }, "61efad2bd49894e8e7d8546473c0129d", "390bb843f7c66b44bf2fd4e6a83b9ba5");
    final SupportSQLiteOpenHelper.Configuration _sqliteConfig = SupportSQLiteOpenHelper.Configuration.builder(config.context).name(config.name).callback(_openCallback).build();
    final SupportSQLiteOpenHelper _helper = config.sqliteOpenHelperFactory.create(_sqliteConfig);
    return _helper;
  }

  @Override
  @NonNull
  protected InvalidationTracker createInvalidationTracker() {
    final HashMap<String, String> _shadowTablesMap = new HashMap<String, String>(0);
    final HashMap<String, Set<String>> _viewTables = new HashMap<String, Set<String>>(0);
    return new InvalidationTracker(this, _shadowTablesMap, _viewTables, "works","chapters","reading_states");
  }

  @Override
  public void clearAllTables() {
    super.assertNotMainThread();
    final SupportSQLiteDatabase _db = super.getOpenHelper().getWritableDatabase();
    final boolean _supportsDeferForeignKeys = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP;
    try {
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = FALSE");
      }
      super.beginTransaction();
      if (_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA defer_foreign_keys = TRUE");
      }
      _db.execSQL("DELETE FROM `works`");
      _db.execSQL("DELETE FROM `chapters`");
      _db.execSQL("DELETE FROM `reading_states`");
      super.setTransactionSuccessful();
    } finally {
      super.endTransaction();
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = TRUE");
      }
      _db.query("PRAGMA wal_checkpoint(FULL)").close();
      if (!_db.inTransaction()) {
        _db.execSQL("VACUUM");
      }
    }
  }

  @Override
  @NonNull
  protected Map<Class<?>, List<Class<?>>> getRequiredTypeConverters() {
    final HashMap<Class<?>, List<Class<?>>> _typeConvertersMap = new HashMap<Class<?>, List<Class<?>>>();
    _typeConvertersMap.put(TadaYomuDao.class, TadaYomuDao_AppDatabase_Impl.getRequiredConverters());
    return _typeConvertersMap;
  }

  @Override
  @NonNull
  public Set<Class<? extends AutoMigrationSpec>> getRequiredAutoMigrationSpecs() {
    final HashSet<Class<? extends AutoMigrationSpec>> _autoMigrationSpecsSet = new HashSet<Class<? extends AutoMigrationSpec>>();
    return _autoMigrationSpecsSet;
  }

  @Override
  @NonNull
  public List<Migration> getAutoMigrations(
      @NonNull final Map<Class<? extends AutoMigrationSpec>, AutoMigrationSpec> autoMigrationSpecs) {
    final List<Migration> _autoMigrations = new ArrayList<Migration>();
    return _autoMigrations;
  }

  @Override
  public TadaYomuDao tadaYomuDao() {
    if (_tadaYomuDao != null) {
      return _tadaYomuDao;
    } else {
      synchronized(this) {
        if(_tadaYomuDao == null) {
          _tadaYomuDao = new TadaYomuDao_AppDatabase_Impl(this);
        }
        return _tadaYomuDao;
      }
    }
  }
}
