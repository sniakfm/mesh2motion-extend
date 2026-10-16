@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Mesh2Motion Desktop Builder (Tauri)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Building Tauri Desktop Application...
call npx.cmd @tauri-apps/cli build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Tauri build failed with exit code %ERRORLEVEL%!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Locating built executable...
set "EXE_PATH="
if exist "F:\rust_target\release\app.exe" (
    set "EXE_PATH=F:\rust_target\release\app.exe"
) else if exist "src-tauri\target\release\app.exe" (
    set "EXE_PATH=src-tauri\target\release\app.exe"
) else (
    echo [ERROR] Could not find built app.exe!
    pause
    exit /b 1
)

echo Found executable: !EXE_PATH!

echo.
echo [3/3] Packaging distribution files...

set "DIST_DIR=dist_desktop"
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
if not exist "%DIST_DIR%\storage" mkdir "%DIST_DIR%\storage"

copy /y "!EXE_PATH!" "%DIST_DIR%\mesh2motion.exe" > nul
if exist "convert_mixamo_to_mesh2motion.bat" (
    copy /y "convert_mixamo_to_mesh2motion.bat" "%DIST_DIR%\" > nul
)
if exist "convert_mixamo_to_mesh2motion.py" (
    copy /y "convert_mixamo_to_mesh2motion.py" "%DIST_DIR%\" > nul
)

if exist "..\..\mesh2motion.exe" (
    copy /y "!EXE_PATH!" "..\..\mesh2motion.exe" > nul
    if not exist "..\..\storage" mkdir "..\..\storage"
    echo Also updated ..\..\mesh2motion.exe
)

echo.
echo ========================================================
echo   Build and packaging completed successfully!
echo   Output files located in: %~dp0dist_desktop
echo ========================================================
echo.
pause
