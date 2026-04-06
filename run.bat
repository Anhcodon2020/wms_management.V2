@echo off
:: QUAN TRONG: Chuyen con tro ve thu muc chua file nay (Fix loi Admin hoac chay tu o khac)
cd /d "%~dp0"

title Du An Moi - Cau Hinh
color 0A

echo ======================================================
echo   DANG KIEM TRA HE THONG...
echo ======================================================

:: 1. Kiem tra xem Node.js da cai trong may chua (Global)
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Da tim thay Node.js trong he thong.
    goto :CHECK_LIBS
)

:: 2. Neu chua co, kiem tra thu muc Portable mac dinh (D:\NodeJS)
if exist "D:\NodeJS\node.exe" goto FOUND_DEFAULT

:: 3. Neu van chua co, hoi nguoi dung nhap duong dan
echo [!] Khong tim thay Node.js.
echo.
echo Vui long mo thu muc chua file node.exe, copy duong dan va paste vao day.
echo (Vi du: D:\Softwares\node-v18)
echo.
set "USER_NODE_PATH="
set /p USER_NODE_PATH="Nhap duong dan Node.js cua ban: "

:: Xoa dau ngoac kep neu nguoi dung lo copy ca dau ngoac (Fix loi crash)
if defined USER_NODE_PATH set USER_NODE_PATH=%USER_NODE_PATH:"=%

:: Dung GOTO de tranh loi cu phap neu duong dan co dau ngoac (x86)
if exist "%USER_NODE_PATH%\node.exe" goto FOUND_USER

echo [LOI] Van khong tim thay file node.exe tai: "%USER_NODE_PATH%"
echo Vui long kiem tra lai duong dan!
pause
exit

:FOUND_DEFAULT
echo [OK] Da tim thay Node.js tai D:\NodeJS
set "PATH=D:\NodeJS;%PATH%"
goto :CHECK_LIBS

:FOUND_USER
set "PATH=%USER_NODE_PATH%;%PATH%"
echo [OK] Da cap nhat duong dan Node.js.

:CHECK_LIBS
:: Kiem tra file package.json co ton tai khong
if not exist "package.json" (
    echo [LOI] Khong tim thay file package.json!
    echo File run.bat dang chay tai: %CD%
    echo Vui long dam bao file nay nam chung thu muc voi ma nguon.
    pause
    exit
)

:: Kiem tra xem da cai thu vien (node_modules) chua
if not exist "node_modules" (
    echo ======================================================
    echo [CANH BAO] Phat hien thieu thu vien. Dang cai dat [npm install]...
    echo ======================================================
    call npm install
)

:: Set cong mac dinh la 3001 (De khop voi file menu.html)
set PORT=3001

echo ======================================================
echo   Dang mo Menu dieu khien va khoi dong Server...
echo ======================================================

:: Mo file menu.html
start "" "menu.html"

:: QUAN TRONG: Dung lenh CALL de giu cua so khong bi tat khi npm gap loi
call npm start
pause
