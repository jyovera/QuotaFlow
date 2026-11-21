@echo off
setlocal enabledelayedexpansion
title QuotaFlow - Iniciar Servidor

echo ====================================================
echo                 QuotaFlow v2.0
echo ====================================================
echo.

:: 1. Verificar archivo de configuracion .env
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creando archivo .env a partir de .env.example...
        copy ".env.example" ".env" >nul
    )
)

:: 2. Verificar dependencias de Node.js si corre nativo
if not exist "node_modules" (
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        echo [INFO] Instalando dependencias de Node.js...
        call npm install
    )
)

echo Como deseas iniciar QuotaFlow?
echo  [1] Modo Nativo con Node.js (Ultra rapido, recomendado)
echo  [2] Modo Docker Container
echo.
set /p MODE="Selecciona una opcion (1 o 2, por defecto 1): "
if "%MODE%"=="" set MODE=1

if "%MODE%"=="2" (
    echo.
    echo [INFO] Iniciando contenedor con Docker Compose...
    docker compose up -d
    echo.
    echo Abriendo QuotaFlow en el navegador...
    timeout /t 2 >nul
    start http://localhost:3333
) else (
    echo.
    echo [INFO] Iniciando servidor Node.js en http://localhost:3333...
    start http://localhost:3333
    node src/server.mjs
)
