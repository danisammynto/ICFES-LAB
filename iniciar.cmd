@echo off
rem =============================================================================
rem  ICFES Lab - Inicia la plataforma con doble clic (Windows).
rem    1. Arranca la base de datos de prueba (puerto 5433) si el .env la usa.
rem    2. Inicia el servidor y abre http://localhost:3000 en el navegador.
rem  Para detener todo: cierra esta ventana o ejecuta detener.cmd.
rem =============================================================================
title ICFES Lab
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".env" (
  echo Falta el archivo .env. Copia .env.example como .env y configuralo.
  pause
  exit /b 1
)
if not exist "node_modules\express" (
  echo Faltan las dependencias. Instala Node.js y ejecuta: npm install
  pause
  exit /b 1
)

rem --- Si el servidor ya esta en marcha, solo abre el navegador ----------------
curl -s -m 2 http://localhost:3000/api/salud 2>nul | findstr /c:"estado" >nul
if not errorlevel 1 (
  echo ICFES Lab ya esta en marcha en http://localhost:3000
  if not defined ICFESLAB_SIN_NAVEGADOR start "" http://localhost:3000
  timeout /t 3 >nul 2>nul
  exit /b 0
)

rem --- Node.js: el instalado en el sistema o la copia local --------------------
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=%LOCALAPPDATA%\icfes-lab\node\node.exe"
if /i not "%NODE%"=="node" if not exist "%NODE%" (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)

rem --- Base de datos de prueba (solo si el .env apunta al puerto 5433) ---------
findstr /r /c:"^DATABASE_URL=.*localhost:5433" .env >nul 2>nul
if not errorlevel 1 call :basedatos

rem --- Abre el navegador en cuanto el servidor responda ------------------------
if not defined ICFESLAB_SIN_NAVEGADOR start "" /b powershell -NoProfile -Command "for ($i = 0; $i -lt 40; $i++) { try { Invoke-RestMethod http://localhost:3000/api/salud -TimeoutSec 2 | Out-Null; Start-Process http://localhost:3000; break } catch { Start-Sleep 1 } }"

echo.
echo   Iniciando ICFES Lab en http://localhost:3000
echo   Cierra esta ventana para detener el servidor.
echo.
"%NODE%" backend\src\server.js
if errorlevel 1 pause
exit /b

:basedatos
set "PGBIN="
for /d %%d in ("%ProgramFiles%\PostgreSQL\*") do if exist "%%d\bin\pg_ctl.exe" set "PGBIN=%%d\bin"
set "PGDATOS=%LOCALAPPDATA%\icfes-lab\pgdata"
if not defined PGBIN (
  echo No se encontro PostgreSQL en "%ProgramFiles%\PostgreSQL".
  goto :eof
)
if not exist "%PGDATOS%\PG_VERSION" (
  echo No se encontro la base de datos de prueba en "%PGDATOS%".
  goto :eof
)
"%PGBIN%\pg_isready.exe" -h localhost -p 5433 >nul 2>nul
if errorlevel 1 (
  echo   Iniciando la base de datos de prueba...
  "%PGBIN%\pg_ctl.exe" -D "%PGDATOS%" -o "-p 5433" -l "%LOCALAPPDATA%\icfes-lab\pg.log" -w start >nul
)
goto :eof
