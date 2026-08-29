@echo off
setlocal

set VERSION=1.3.74
set APK=TadaYomu-%VERSION%.apk

if not exist "%APK%" (
    echo.
    echo [ERROR] APK was not found: %APK%
    exit /b 1
)
if not exist "version.json" (
    echo.
    echo [ERROR] version.json was not found.
    exit /b 1
)
powershell -NoProfile -Command "$m = Get-Content -Raw -LiteralPath 'version.json' | ConvertFrom-Json; if ($m.version -ne '%VERSION%' -or $m.apkUrl -notmatch '/v%VERSION%/TadaYomu-%VERSION%\.apk$') { exit 1 }"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] version.json does not match v%VERSION%.
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
