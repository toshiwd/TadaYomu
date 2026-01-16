package com.toshiwd.tadayomu.ui.library

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.toshiwd.tadayomu.data.db.WorkInfo

@Composable
fun LibraryScreen(
    viewModel: LibraryViewModel,
    onWorkClick: (Long) -> Unit
) {
    val works by viewModel.libraryWorks.collectAsState()
    
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let { viewModel.importFile(it) }
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { launcher.launch(arrayOf("text/plain", "text/html")) }) {
                Text("+")
            }
        }
    ) { innerPadding ->
        if (works.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                Text("作品がありません。「+」ボタンで追加してください。")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(works) { work ->
                    WorkItem(work, onClick = { onWorkClick(work.workId) })
                }
            }
        }
    }
}

@Composable
fun WorkItem(work: WorkInfo, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = work.title, style = MaterialTheme.typography.titleMedium)
            // Text(text = "著者: ${work.author}", style = MaterialTheme.typography.bodyMedium)
            Text(
                text = "最終インポート: ${java.text.SimpleDateFormat("yyyy/MM/dd HH:mm").format(java.util.Date(work.lastImportedDate))}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}