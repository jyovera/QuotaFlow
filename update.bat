@echo off
setlocal enabledelayedexpansion
title QuotaFlow - Actualizador

echo ====================================================
echo       QuotaFlow - Actualizador Automatico
echo ====================================================
echo.

:: 1. Comprobar si git esta instalado
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Git para poder actualizar el repositorio.
    pause
    exit /b 1
)

echo [1/3] Descargando ultimas actualizaciones desde GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [ADVERTENCIA] Ocurrio un problema al ejecutar git pull.
    echo Verifica tu conexion a internet o si tienes cambios locales pendientes.
    pause
    exit /b 1
)

echo.
echo [2/3] Actualizando dependencias de Node.js...
where npm >nul 2>nul
if %errorlevel% equ 0 (
    call npm install
) else (
    echo [INFO] npm no encontrado, omitiendo npm install.
)

echo.
echo [3/3] Comprobando servicios Docker...
where docker >nul 2>nul
if %errorlevel% equ 0 (
    docker ps --format "{{.Names}}" 2>nul | findstr /i "quotaflow-app" >nul
    if %errorlevel% equ 0 (
        echo [INFO] Se detecto el contenedor quotaflow-app en ejecucion.
        echo Reconstruyendo y reiniciando contenedor Docker...
        docker compose up -d --build
    )
)

echo.
echo ====================================================
echo   QuotaFlow ha sido actualizado exitosamente!
echo ====================================================
echo.
pause
