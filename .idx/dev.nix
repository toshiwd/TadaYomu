{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-23.11";

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.temurin-bin-17
  ];

  # Sets environment variables in the workspace
  env = {};

  # Defines scripts to run on startup
  startup = {};
}
