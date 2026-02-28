@echo off
setlocal

:: =============================================
:: TadaYomu Release Build Script
:: =============================================

set "JAVA_HOME=C:\Program Files\Java\jdk-20"
set KEYSTORE_PASSWORD=TadaYomu2026!
set KEY_PASSWORD=TadaYomu2026!

echo ========================================
echo  TadaYomu Release Build
echo ========================================
echo.

set VERSION=1.3.42
echo Version: %VERSION%
echo.

:: Build release APK
echo [1/4] Building release APK...
cd android
call gradlew.bat assembleRelease
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED!
    exit /b 1
)
cd ..

:: Copy APK using xcopy (reliable binary copy)
echo [2/4] Copying APK...
set APK_SRC=android\app\build\outputs\apk\release\app-release.apk
set APK_DST=TadaYomu-%VERSION%.apk
xcopy /y /q "%APK_SRC%" "%APK_DST%*" > nul
echo   -^> %APK_DST%

:: Generate version.json via temp script
echo [3/4] Generating version.json...
> gen_version.ps1 echo $v = '%VERSION%'
>> gen_version.ps1 echo $obj = [ordered]@{
>> gen_version.ps1 echo     version = $v
>> gen_version.ps1 echo     apkUrl = "https://github.com/toshiwd/TadaYomu/releases/download/v$v/TadaYomu-$v.apk"
>> gen_version.ps1 echo     releaseNotes = "Version $v"
>> gen_version.ps1 echo }
>> gen_version.ps1 echo $obj ^| ConvertTo-Json ^| Set-Content -Path 'version.json' -Encoding UTF8
powershell -ExecutionPolicy Bypass -File gen_version.ps1
del gen_version.ps1
echo   -^> version.json

echo.
echo ========================================
echo  Build complete!
echo  APK: %APK_DST%
echo  Manifest: version.json
echo ========================================
echo.

:: Upload to GitHub Release
echo [4/4] Uploading to GitHub Release...
echo   Target: v%VERSION%
"C:\Program Files\GitHub CLI\gh.exe" release create v%VERSION% "%APK_DST%" version.json --title "v%VERSION%" --notes "Version %VERSION%"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] GitHub Upload Failed or Release already exists.
    exit /b 1
)

echo.
echo [SUCCESS] Release v%VERSION% published successfully!
echo.
