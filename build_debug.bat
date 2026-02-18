@echo off
set JAVA_HOME=C:\Program Files\Java\jdk-20
cd android
call gradlew.bat assembleDebug > build_log.txt 2>&1
echo Build finished with exit code %ERRORLEVEL% >> build_log.txt
type build_log.txt
