@echo off
setlocal

cd /d "%~dp0"
title WMS Management - Server
color 0A

echo ======================================================
echo   KIEM TRA VA KHOI DONG WMS SERVER
echo ======================================================

if not exist "package.json" (
    echo [LOI] Khong tim thay package.json trong:
    echo       %CD%
    pause
    exit /b 1
)

if not exist ".env" (
    echo [LOI] Khong tim thay file .env.
    echo       Hay tao .env voi thong tin ket noi database.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    if exist "D:\NodeJS\node.exe" (
        set "PATH=D:\NodeJS;%PATH%"
        echo [OK] Su dung Node.js tai D:\NodeJS
    ) else (
        echo [LOI] Khong tim thay Node.js.
        echo       Hay cai Node.js hoac dat node.exe tai D:\NodeJS.
        pause
        exit /b 1
    )
) else (
    echo [OK] Da tim thay Node.js trong PATH.
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay npm.
    echo       Hay kiem tra cai dat Node.js.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Dang cai cac thu vien...
    call npm.cmd install
    if errorlevel 1 (
        echo [LOI] npm install that bai.
        pause
        exit /b 1
    )
)

set "PORT=3001"

echo [INFO] Database host duoc doc tu file .env
echo [INFO] Server se chay tai http://localhost:%PORT%
echo.
echo [INFO] Dang khoi dong server...

start "" "menu.html"
call npm.cmd start

if errorlevel 1 (
    echo.
    echo [LOI] Server da dung. Kiem tra loi o phia tren.
)

pause
endlocal
