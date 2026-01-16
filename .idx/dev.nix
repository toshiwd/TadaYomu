{ pkgs, ... }: {
  channel = "stable-23.11";

  packages = [
    pkgs.temurin-bin-17
  ];

  env = {
    ANDROID_SDK_ROOT = "/home/user/.androidsdkroot";
    ANDROID_HOME = "/home/user/.androidsdkroot";
  };
}
