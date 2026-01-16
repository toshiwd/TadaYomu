package com.toshiwd.tadayomu.data.db;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Boolean;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Float;
import java.lang.Integer;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class TadaYomuDao_Impl implements TadaYomuDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<Work> __insertionAdapterOfWork;

  private final EntityInsertionAdapter<Chapter> __insertionAdapterOfChapter;

  private final EntityInsertionAdapter<ReadingState> __insertionAdapterOfReadingState;

  private final SharedSQLiteStatement __preparedStmtOfUpdateWorkLastImportedDate;

  public TadaYomuDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfWork = new EntityInsertionAdapter<Work>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR IGNORE INTO `works` (`id`,`title`,`author`,`lastImportedDate`) VALUES (nullif(?, 0),?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final Work entity) {
        statement.bindLong(1, entity.getId());
        statement.bindString(2, entity.getTitle());
        statement.bindString(3, entity.getAuthor());
        statement.bindLong(4, entity.getLastImportedDate());
      }
    };
    this.__insertionAdapterOfChapter = new EntityInsertionAdapter<Chapter>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR IGNORE INTO `chapters` (`id`,`workId`,`chapterNumber`,`contentPath`,`importedDate`) VALUES (nullif(?, 0),?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final Chapter entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getWorkId());
        statement.bindLong(3, entity.getChapterNumber());
        statement.bindString(4, entity.getContentPath());
        statement.bindLong(5, entity.getImportedDate());
      }
    };
    this.__insertionAdapterOfReadingState = new EntityInsertionAdapter<ReadingState>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `reading_states` (`workId`,`chapterNumber`,`progress`,`prevChapterNumber`,`prevProgress`) VALUES (?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ReadingState entity) {
        statement.bindLong(1, entity.getWorkId());
        statement.bindLong(2, entity.getChapterNumber());
        statement.bindDouble(3, entity.getProgress());
        statement.bindLong(4, entity.getPrevChapterNumber());
        statement.bindDouble(5, entity.getPrevProgress());
      }
    };
    this.__preparedStmtOfUpdateWorkLastImportedDate = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE works SET lastImportedDate = ? WHERE id = ?";
        return _query;
      }
    };
  }

  @Override
  public Object insertWork(final Work work, final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfWork.insertAndReturnId(work);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object insertChapter(final Chapter chapter, final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfChapter.insertAndReturnId(chapter);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object upsertReadingState(final ReadingState readingState,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfReadingState.insert(readingState);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object updateWorkLastImportedDate(final long workId, final long lastImportedDate,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfUpdateWorkLastImportedDate.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, lastImportedDate);
        _argIndex = 2;
        _stmt.bindLong(_argIndex, workId);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfUpdateWorkLastImportedDate.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object getWorkByTitleAndAuthor(final String title, final String author,
      final Continuation<? super Work> $completion) {
    final String _sql = "SELECT * FROM works WHERE title = ? AND author = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, title);
    _argIndex = 2;
    _statement.bindString(_argIndex, author);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<Work>() {
      @Override
      @Nullable
      public Work call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfAuthor = CursorUtil.getColumnIndexOrThrow(_cursor, "author");
          final int _cursorIndexOfLastImportedDate = CursorUtil.getColumnIndexOrThrow(_cursor, "lastImportedDate");
          final Work _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpAuthor;
            _tmpAuthor = _cursor.getString(_cursorIndexOfAuthor);
            final long _tmpLastImportedDate;
            _tmpLastImportedDate = _cursor.getLong(_cursorIndexOfLastImportedDate);
            _result = new Work(_tmpId,_tmpTitle,_tmpAuthor,_tmpLastImportedDate);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object existsChapter(final long workId, final int chapterNumber,
      final Continuation<? super Boolean> $completion) {
    final String _sql = "SELECT EXISTS(SELECT 1 FROM chapters WHERE workId = ? AND chapterNumber = ?)";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, workId);
    _argIndex = 2;
    _statement.bindLong(_argIndex, chapterNumber);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<Boolean>() {
      @Override
      @NonNull
      public Boolean call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final Boolean _result;
          if (_cursor.moveToFirst()) {
            final int _tmp;
            _tmp = _cursor.getInt(0);
            _result = _tmp != 0;
          } else {
            _result = false;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<Chapter>> getChaptersForWork(final long workId) {
    final String _sql = "SELECT * FROM chapters WHERE workId = ? ORDER BY chapterNumber ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, workId);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"chapters"}, new Callable<List<Chapter>>() {
      @Override
      @NonNull
      public List<Chapter> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfWorkId = CursorUtil.getColumnIndexOrThrow(_cursor, "workId");
          final int _cursorIndexOfChapterNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "chapterNumber");
          final int _cursorIndexOfContentPath = CursorUtil.getColumnIndexOrThrow(_cursor, "contentPath");
          final int _cursorIndexOfImportedDate = CursorUtil.getColumnIndexOrThrow(_cursor, "importedDate");
          final List<Chapter> _result = new ArrayList<Chapter>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final Chapter _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpWorkId;
            _tmpWorkId = _cursor.getLong(_cursorIndexOfWorkId);
            final int _tmpChapterNumber;
            _tmpChapterNumber = _cursor.getInt(_cursorIndexOfChapterNumber);
            final String _tmpContentPath;
            _tmpContentPath = _cursor.getString(_cursorIndexOfContentPath);
            final long _tmpImportedDate;
            _tmpImportedDate = _cursor.getLong(_cursorIndexOfImportedDate);
            _item = new Chapter(_tmpId,_tmpWorkId,_tmpChapterNumber,_tmpContentPath,_tmpImportedDate);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @Override
  public Object getReadingState(final long workId,
      final Continuation<? super ReadingState> $completion) {
    final String _sql = "SELECT * FROM reading_states WHERE workId = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, workId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<ReadingState>() {
      @Override
      @Nullable
      public ReadingState call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfWorkId = CursorUtil.getColumnIndexOrThrow(_cursor, "workId");
          final int _cursorIndexOfChapterNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "chapterNumber");
          final int _cursorIndexOfProgress = CursorUtil.getColumnIndexOrThrow(_cursor, "progress");
          final int _cursorIndexOfPrevChapterNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "prevChapterNumber");
          final int _cursorIndexOfPrevProgress = CursorUtil.getColumnIndexOrThrow(_cursor, "prevProgress");
          final ReadingState _result;
          if (_cursor.moveToFirst()) {
            final long _tmpWorkId;
            _tmpWorkId = _cursor.getLong(_cursorIndexOfWorkId);
            final int _tmpChapterNumber;
            _tmpChapterNumber = _cursor.getInt(_cursorIndexOfChapterNumber);
            final float _tmpProgress;
            _tmpProgress = _cursor.getFloat(_cursorIndexOfProgress);
            final int _tmpPrevChapterNumber;
            _tmpPrevChapterNumber = _cursor.getInt(_cursorIndexOfPrevChapterNumber);
            final float _tmpPrevProgress;
            _tmpPrevProgress = _cursor.getFloat(_cursorIndexOfPrevProgress);
            _result = new ReadingState(_tmpWorkId,_tmpChapterNumber,_tmpProgress,_tmpPrevChapterNumber,_tmpPrevProgress);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<WorkInfo>> getWorkInfoList() {
    final String _sql = "\n"
            + "        SELECT\n"
            + "            w.id AS workId,\n"
            + "            w.title,\n"
            + "            w.author,\n"
            + "            w.lastImportedDate,\n"
            + "            (SELECT COUNT(id) FROM chapters WHERE workId = w.id) AS chapterCount,\n"
            + "            rs.chapterNumber AS lastReadChapterNumber,\n"
            + "            rs.progress AS lastReadProgress\n"
            + "        FROM works AS w\n"
            + "        LEFT JOIN reading_states AS rs ON w.id = rs.workId\n"
            + "        ORDER BY w.lastImportedDate DESC\n"
            + "    ";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"chapters", "works",
        "reading_states"}, new Callable<List<WorkInfo>>() {
      @Override
      @NonNull
      public List<WorkInfo> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfWorkId = 0;
          final int _cursorIndexOfTitle = 1;
          final int _cursorIndexOfAuthor = 2;
          final int _cursorIndexOfLastImportedDate = 3;
          final int _cursorIndexOfChapterCount = 4;
          final int _cursorIndexOfLastReadChapterNumber = 5;
          final int _cursorIndexOfLastReadProgress = 6;
          final List<WorkInfo> _result = new ArrayList<WorkInfo>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkInfo _item;
            final long _tmpWorkId;
            _tmpWorkId = _cursor.getLong(_cursorIndexOfWorkId);
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpAuthor;
            _tmpAuthor = _cursor.getString(_cursorIndexOfAuthor);
            final long _tmpLastImportedDate;
            _tmpLastImportedDate = _cursor.getLong(_cursorIndexOfLastImportedDate);
            final int _tmpChapterCount;
            _tmpChapterCount = _cursor.getInt(_cursorIndexOfChapterCount);
            final Integer _tmpLastReadChapterNumber;
            if (_cursor.isNull(_cursorIndexOfLastReadChapterNumber)) {
              _tmpLastReadChapterNumber = null;
            } else {
              _tmpLastReadChapterNumber = _cursor.getInt(_cursorIndexOfLastReadChapterNumber);
            }
            final Float _tmpLastReadProgress;
            if (_cursor.isNull(_cursorIndexOfLastReadProgress)) {
              _tmpLastReadProgress = null;
            } else {
              _tmpLastReadProgress = _cursor.getFloat(_cursorIndexOfLastReadProgress);
            }
            _item = new WorkInfo(_tmpWorkId,_tmpTitle,_tmpAuthor,_tmpLastImportedDate,_tmpChapterCount,_tmpLastReadChapterNumber,_tmpLastReadProgress);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
