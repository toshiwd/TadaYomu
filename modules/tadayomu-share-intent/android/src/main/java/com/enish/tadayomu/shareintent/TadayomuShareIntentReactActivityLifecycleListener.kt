package com.enish.tadayomu.shareintent

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class TadayomuShareIntentReactActivityLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    TadayomuShareIntentModule.receiveShareIntent(activity?.intent)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    TadayomuShareIntentModule.receiveShareIntent(intent)
    return true
  }
}
