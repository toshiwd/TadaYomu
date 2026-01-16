{ pkgs, ... }: {
  channel = "stable-23.11";

  packages = [
    pkgs.temurin-bin-17
    pkgs.android-tools
  ];

  env = {
    ANDROID_SDK_ROOT = "/home/user/.androidsdkroot";
    ANDROID_HOME = "/home/user/.androidsdkroot";
  };
}
