package com.toshiwd.tadayomu.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.toshiwd.tadayomu.data.db.WorkInfo
import com.toshiwd.tadayomu.data.repository.WorkRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LibraryViewModel(
    private val repository: WorkRepository
) : ViewModel() {

    val libraryWorks: StateFlow<List<WorkInfo>> = repository.getLibraryWorks()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    fun addDummyWork() {
        viewModelScope.launch {
            repository.addDummyWork()
        }
    }
}