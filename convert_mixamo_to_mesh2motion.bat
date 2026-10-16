@echo off
chcp 65001 > nul

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in system PATH.
    echo Please install Python 3 or add it to PATH.
    pause
    exit /b 1
)

python "%~dp0convert_mixamo_to_mesh2motion.py" %*

echo.
pause
