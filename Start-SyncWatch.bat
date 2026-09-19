@echo off
title SyncWatch — Private Couple Cinema
cls
echo ============================================================
echo   SyncWatch - Launching Private Cinema
echo ============================================================
echo.
cd /d "%~dp0"
node watch.js
pause
