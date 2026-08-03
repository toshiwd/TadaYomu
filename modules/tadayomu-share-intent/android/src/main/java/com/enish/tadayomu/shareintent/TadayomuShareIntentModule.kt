package com.enish.tadayomu.shareintent

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class TadayomuShareIntentModule : Module() {
  companion object {
    private const val EXTRA_CONSUMED = "com.enish.tadayomu.shareintent.CONSUMED"

    internal var pendingShareText: String? = null
    internal val observers = mutableSetOf<(String) -> Unit>()

    internal fun receiveShareIntent(intent: Intent?) {
      if (intent?.action != Intent.ACTION_SEND) return
      if (intent.type?.startsWith("text/plain") != true) return
      if (intent.getBooleanExtra(EXTRA_CONSUMED, false)) return

      val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
      if (text.isEmpty()) return

      intent.putExtra(EXTRA_CONSUMED, true)
      pendingShareText = text
      observers.toList().forEach { it(text) }
      if (observers.isNotEmpty()) pendingShareText = null
    }
  }

  private var shareObserver: ((String) -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("TadayomuShareIntent")

    Events("onShareReceived")

    Function("consumeInitialShareText") {
      pendingShareText.also { pendingShareText = null }
    }

    OnStartObserving("onShareReceived") {
      val weakModule = WeakReference(this@TadayomuShareIntentModule)
      val observer: (String) -> Unit = { text ->
        weakModule.get()?.sendEvent("onShareReceived", mapOf("text" to text))
      }
      observers.add(observer)
      shareObserver = observer
    }

    OnStopObserving("onShareReceived") {
      observers.remove(shareObserver)
      shareObserver = null
    }
  }
}
