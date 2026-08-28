const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require("@expo/config-plugins");

const READER_CONTROLS_PACKAGE = "TadayomuReaderControlsPackage";

function withReaderMainActivity(config) {
  return withMainActivity(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "kt") {
      throw new Error("Tadayomu reader controls require a Kotlin MainActivity");
    }

    let contents = nextConfig.modResults.contents;
    if (!contents.includes("import android.view.KeyEvent")) {
      contents = contents.replace(
        "import android.os.Bundle",
        "import android.os.Bundle\nimport android.view.KeyEvent",
      );
    }

    if (!contents.includes("override fun dispatchKeyEvent")) {
      const mainComponentMethod =
        '  override fun getMainComponentName(): String = "main"';
      const dispatchMethod = `${mainComponentMethod}

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val isVolumeKey =
      event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN ||
        event.keyCode == KeyEvent.KEYCODE_VOLUME_UP

    if (isVolumeKey && TadayomuReaderControlsModule.isVolumePagingEnabled()) {
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        val button =
          if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            "volumeDown"
          } else {
            "volumeUp"
          }
        TadayomuReaderControlsModule.emitVolumeButton(button)
      }
      return true
    }

    return super.dispatchKeyEvent(event)
  }`;

      if (!contents.includes(mainComponentMethod)) {
        throw new Error("Unable to locate getMainComponentName in MainActivity");
      }
      contents = contents.replace(mainComponentMethod, dispatchMethod);
    }

    nextConfig.modResults.contents = contents;
    return nextConfig;
  });
}

function withReaderMainApplication(config) {
  return withMainApplication(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "kt") {
      throw new Error("Tadayomu reader controls require a Kotlin MainApplication");
    }

    let contents = nextConfig.modResults.contents;
    const registration = `add(${READER_CONTROLS_PACKAGE}())`;
    if (!contents.includes(registration)) {
      const packageBlock = "PackageList(this).packages.apply {";
      if (!contents.includes(packageBlock)) {
        throw new Error("Unable to locate PackageList registration block");
      }
      contents = contents.replace(
        packageBlock,
        `${packageBlock}\n              ${registration}`,
      );
    }

    nextConfig.modResults.contents = contents;
    return nextConfig;
  });
}

function withReaderNativeSources(config) {
  return withDangerousMod(config, ["android", async (nextConfig) => {
    const packageName = nextConfig.android?.package;
    if (packageName !== "com.enish.tadayomu") {
      throw new Error(`Unsupported Android package for reader controls: ${packageName}`);
    }

    const sourceDir = path.join(
      nextConfig.modRequest.projectRoot,
      "plugins",
      "reader-controls",
      "android",
    );
    const targetDir = path.join(
      nextConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      ...packageName.split("."),
    );
    await fs.promises.mkdir(targetDir, { recursive: true });

    for (const filename of [
      "TadayomuReaderControlsModule.kt",
      "TadayomuReaderControlsPackage.kt",
    ]) {
      await fs.promises.copyFile(
        path.join(sourceDir, filename),
        path.join(targetDir, filename),
      );
    }

    return nextConfig;
  }]);
}

module.exports = function withReaderControls(config) {
  config = withReaderMainActivity(config);
  config = withReaderMainApplication(config);
  config = withReaderNativeSources(config);
  return config;
};
