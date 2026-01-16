package com.toshiwd.tadayomu.ui.reader

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

@Composable
fun ReaderScreen(
    viewModel: ReaderViewModel,
    workId: Long
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(workId) {
        viewModel.loadWork(workId)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (val state = uiState) {
            is ReaderUiState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            is ReaderUiState.Error -> {
                Text(text = state.message, modifier = Modifier.align(Alignment.Center))
            }
            is ReaderUiState.Success -> {
                ReaderContent(
                    contentPath = state.chapter.contentPath,
                    initialScrollX = state.initialScrollX,
                    onScrollChange = { x -> viewModel.saveProgress(state.chapter.id, x) }
                )
            }
        }
    }
}

@Composable
fun ReaderContent(contentPath: String, initialScrollX: Int, onScrollChange: (Int) -> Unit) {
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        view?.scrollTo(initialScrollX, 0)
                    }
                }
                setOnScrollChangeListener { v, scrollX, _, _, _ ->
                    onScrollChange(scrollX)
                }
            }
        },
        update = { webView -> webView.loadUrl("file://$contentPath") }
    )
}