package com.toshiwd.tadayomu.ui.reader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.toshiwd.tadayomu.data.db.Chapter
import com.toshiwd.tadayomu.data.repository.WorkRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ReaderViewModel(
    private val repository: WorkRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ReaderUiState>(ReaderUiState.Loading)
    val uiState: StateFlow<ReaderUiState> = _uiState.asStateFlow()

    fun loadWork(workId: Long) {
        viewModelScope.launch {
            val chapterId = repository.getLastReadChapterId(workId)
            if (chapterId != null) {
                loadChapter(chapterId)
            } else {
                _uiState.value = ReaderUiState.Error("章が見つかりません")
            }
        }
    }

    private suspend fun loadChapter(chapterId: Long) {
        val chapter = repository.getChapter(chapterId)
        val progress = repository.getReadingState(chapterId)
        if (chapter != null) {
            _uiState.value = ReaderUiState.Success(chapter, progress?.scrollPosition ?: 0)
        }
    }

    fun saveProgress(chapterId: Long, scrollX: Int) {
        viewModelScope.launch {
            repository.saveReadingProgress(chapterId, scrollX, 0f)
        }
    }
}

sealed class ReaderUiState {
    object Loading : ReaderUiState()
    data class Success(val chapter: Chapter, val initialScrollX: Int) : ReaderUiState()
    data class Error(val message: String) : ReaderUiState()
}