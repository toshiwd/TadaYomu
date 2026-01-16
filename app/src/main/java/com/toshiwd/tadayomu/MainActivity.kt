package com.toshiwd.tadayomu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.toshiwd.tadayomu.data.db.TadaYomuDatabase
import com.toshiwd.tadayomu.data.repository.WorkRepository
import com.toshiwd.tadayomu.ui.library.LibraryScreen
import com.toshiwd.tadayomu.ui.library.LibraryViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manual DI Setup
        val database = TadaYomuDatabase.getDatabase(applicationContext)
        val repository = WorkRepository(database.tadaYomuDao())
        
        val viewModelFactory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return LibraryViewModel(repository) as T
            }
        }

        setContent {
            // In a real app, use viewModel(factory = ...) inside Composable or Hilt
            val viewModel = ViewModelProvider(this, viewModelFactory)[LibraryViewModel::class.java]
            
            // Theme setup could go here
            LibraryScreen(viewModel = viewModel)
        }
    }
}