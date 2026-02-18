@echo off
setlocal enabledelayedexpansion

:: =============================================
:: TadaYomu Release Build Script
:: =============================================

set JAVA_HOME=C:\Program Files\Java\jdk-20
set KEYSTORE_PASSWORD=TadaYomu2026!
set KEY_PASSWORD=TadaYomu2026!

echo ========================================
echo  TadaYomu Release Build
echo ========================================
echo.

:: Get version from app.json
for /f "tokens=2 delims=:, " %%a in ('findstr "version" app.json ^| findstr /n "." ^| findstr "^2:"') do (
    set "RAW_VERSION=%%a"
)
set VERSION=%RAW_VERSION:"=%
echo Version: %VERSION%
echo.

:: Build release APK
echo [1/3] Building release APK...
cd android
call gradlew.bat assembleRelease
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED!
    pause
    exit /b 1
)
cd ..

:: Copy APK
echo [2/3] Copying APK...
set APK_SRC=android\app\build\outputs\apk\release\app-release.apk
set APK_DST=TadaYomu-%VERSION%.apk
copy "%APK_SRC%" "%APK_DST%" > nul
echo   -> %APK_DST%

:: Generate version.json
echo [3/3] Generating version.json...
(
    echo {
    echo   "version": "%VERSION%",
    echo   "apkUrl": "https://github.com/toshiwd/TadaYomu/releases/download/v%VERSION%/TadaYomu-%VERSION%.apk",
    echo   "releaseNotes": "バージョン %VERSION% リリース"
    echo }
) > version.json
echo   -> version.json

echo.
echo ========================================
echo  Build complete!
echo  APK: %APK_DST%
echo  Manifest: version.json
echo ========================================
echo.
echo Next steps:
echo   1. git add -A ^&^& git commit -m "Release v%VERSION%"
echo   2. git tag v%VERSION%
echo   3. git push origin master --tags
echo   (GitHub Actions will auto-create the release)
echo.
echo Or manually upload %APK_DST% and version.json to GitHub Releases.
pause
