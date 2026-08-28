@echo off
setlocal

set VERSION=1.3.65
set APK=TadaYomu-%VERSION%.apk

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\assert-crashlytics-release-gate.ps1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [BLOCKED] Crashlytics release validation is incomplete.
    exit /b 1
)

echo Publishing GitHub Release v%VERSION%...
"C:\Program Files\GitHub CLI\gh.exe" release create v%VERSION% "%APK%" version.json --title "v%VERSION%" --notes-file "release-notes-v%VERSION%.md"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] GitHub Release was not published.
    exit /b 1
)

echo.
echo [SUCCESS] Release v%VERSION% published successfully.
