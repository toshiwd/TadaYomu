package com.toshiwd.tadayomu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.toshiwd.tadayomu.data.db.TadaYomuDatabase
import com.toshiwd.tadayomu.data.repository.WorkRepository
import com.toshiwd.tadayomu.ui.library.LibraryScreen
import com.toshiwd.tadayomu.ui.library.LibraryViewModel
import com.toshiwd.tadayomu.ui.reader.ReaderScreen
import com.toshiwd.tadayomu.ui.reader.ReaderViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manual DI Setup
        val database = TadaYomuDatabase.getDatabase(applicationContext)
        val repository = WorkRepository(database.tadaYomuDao(), applicationContext)
        
        val viewModelFactory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return when {
                    modelClass.isAssignableFrom(LibraryViewModel::class.java) -> LibraryViewModel(repository) as T
                    modelClass.isAssignableFrom(ReaderViewModel::class.java) -> ReaderViewModel(repository) as T
                    else -> throw IllegalArgumentException("Unknown ViewModel class")
                }
            }
        }

        setContent {
            val navController = rememberNavController()
            val libraryViewModel = ViewModelProvider(this, viewModelFactory)[LibraryViewModel::class.java]

            NavHost(navController = navController, startDestination = "library") {
                composable("library") {
                    LibraryScreen(viewModel = libraryViewModel, onWorkClick = { workId ->
                        navController.navigate("reader/$workId")
                    })
                }
                composable(
                    "reader/{workId}",
                    arguments = listOf(navArgument("workId") { type = NavType.LongType })
                ) { backStackEntry ->
                    val workId = backStackEntry.arguments?.getLong("workId") ?: return@composable
                    val readerViewModel = ViewModelProvider(this, viewModelFactory)[ReaderViewModel::class.java]
                    ReaderScreen(viewModel = readerViewModel, workId = workId)
                }
            }
        }
    }
}