package com.enish.tadayomu.shareintent

import android.content.Context
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class TadayomuShareIntentPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context?,
  ): List<ReactActivityLifecycleListener> {
    return listOf(TadayomuShareIntentReactActivityLifecycleListener())
  }
}
