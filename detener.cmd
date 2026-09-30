@echo off
rem =============================================================================
rem  ICFES Lab - Detiene el servidor (puerto 3000) y la base de datos de prueba (5433).
rem =============================================================================
title ICFES Lab - detener
setlocal EnableExtensions

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
  tasklist /fi "PID eq %%p" 2>nul | findstr /i "node.exe" >nul && (
    echo Deteniendo el servidor ^(PID %%p^)...
    taskkill /pid %%p /f >nul 2>nul
  )
)

set "PGBIN="
for /d %%d in ("%ProgramFiles%\PostgreSQL\*") do if exist "%%d\bin\pg_ctl.exe" set "PGBIN=%%d\bin"
set "PGDATOS=%LOCALAPPDATA%\icfes-lab\pgdata"
if defined PGBIN if exist "%PGDATOS%\postmaster.pid" (
  echo Deteniendo la base de datos de prueba...
  "%PGBIN%\pg_ctl.exe" -D "%PGDATOS%" -m fast stop >nul 2>nul
)
echo Listo.
timeout /t 3 >nul 2>nul
