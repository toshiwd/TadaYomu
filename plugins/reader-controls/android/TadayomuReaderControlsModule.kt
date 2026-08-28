package com.enish.tadayomu

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

class TadayomuReaderControlsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  init {
    reactContextRef = WeakReference(reactContext)
  }

  override fun getName(): String = "TadayomuReaderControls"

  @ReactMethod
  fun setVolumePagingEnabled(enabled: Boolean) {
    volumePagingEnabled = enabled
  }

  override fun invalidate() {
    volumePagingEnabled = false
    reactContextRef.clear()
    super.invalidate()
  }

  companion object {
    private const val VOLUME_EVENT = "tadayomuReaderVolumeButton"

    @Volatile
    private var volumePagingEnabled = false

    @Volatile
    private var reactContextRef = WeakReference<ReactApplicationContext>(null)

    fun isVolumePagingEnabled(): Boolean = volumePagingEnabled

    fun emitVolumeButton(button: String) {
      if (!volumePagingEnabled) return
      val context = reactContextRef.get() ?: return
      if (!context.hasActiveReactInstance()) return

      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(VOLUME_EVENT, button)
    }
  }
}
