@echo off
setlocal

:: =============================================
:: TadaYomu Release Build Script
:: =============================================

set "JAVA_HOME=C:\Program Files\Java\jdk-20"
set "NODE_ENV=production"
set KEYSTORE_PASSWORD=TadaYomu2026!
set KEY_PASSWORD=TadaYomu2026!

echo ========================================
echo  TadaYomu Release Build
echo ========================================
echo.

set VERSION=1.3.70
echo Version: %VERSION%
echo.

:: Build release APK
echo [1/3] Building release APK...
cd android
call gradlew.bat assembleRelease
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED!
    exit /b 1
)
cd ..

:: Copy APK using xcopy (reliable binary copy)
echo [2/3] Copying APK...
set APK_SRC=android\app\build\outputs\apk\release\app-release.apk
set APK_DST=TadaYomu-%VERSION%.apk
xcopy /y /q "%APK_SRC%" "%APK_DST%*" > nul
echo   -^> %APK_DST%

:: Verify the committed update manifest without rewriting it.
echo [3/3] Verifying version.json...
powershell -NoProfile -Command "$m = Get-Content -Raw -LiteralPath 'version.json' | ConvertFrom-Json; if ($m.version -ne '%VERSION%') { exit 1 }"
if %ERRORLEVEL% neq 0 (
    echo VERSION MANIFEST MISMATCH!
    exit /b 1
)
echo   -^> version.json

echo.
echo ========================================
echo  Build complete!
echo  APK: %APK_DST%
echo  Manifest: version.json
echo ========================================
echo.

echo GitHub Release was not published.
echo Publish only after APK and emulator verification.
