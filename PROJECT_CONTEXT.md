# 🌊 QuotaFlow — Contexto de Proyecto y Transferencia de Sesión

> **Documento de Traspaso de Contexto (Session Handover)**  
> **Fecha:** 21 de Noviembre, 2026  
> **Conversación de origen:** `conversation://398b6835-1d4b-47f1-9199-10c4c99a8cd6`  
> **Repositorio local:** `D:\AntigravityProyectos\QuotaFlow`

---

## 📌 ¿Qué es QuotaFlow?
**QuotaFlow** es una solución de ingeniería nativa (Node.js 22 + Vanilla JS + Docker) desarrollada para optimizar el trabajo con **Google Antigravity**, **Gemini 2.5 / 3.0 Pro & Flash**, **Claude 3.5 Sonnet** y modelos **GPT**.

Proporciona dos pilares fundamentales:
1. **Control Total de Cuotas Multicuenta:** Monitorea 4 cuentas de Google AI Pro en tiempo real, calculando porcentajes reales consumidos, tiempos de reseteo para límites de 5 horas y semanales, y una matriz Gantt de 14 días con columnas diarias.
2. **Project Hub & Code Explorer:** Escanea automáticamente los proyectos en `D:\AntigravityProyectos`, permite explorarlos desde el navegador (código, READMEs, historial git de 15 commits) y lanzarlos directamente en **Antigravity IDE** o **VS Code** en nuevas ventanas de escritorio.

---

## 🏗️ Arquitectura del Sistema

### 1. Backend (`src/`)
* **`server.mjs`:** Servidor HTTP nativo en Node.js (puerto `3333`). Expone endpoints REST para cuotas, tokens, escaneo de proyectos y visor de código.
* **`credentialManager.mjs`:** Consulta en vivo las APIs de Google Cloud / Antigravity usando el User Agent `antigravity/hub/2.33.0 darwin/arm64` para obtener buckets reales de Gemini Models, Claude/GPT y Gemini 4 Argon.
* **`projectScanner.mjs`:** Escaneo recursivo de proyectos, detección de stack tecnológico, lectura de READMEs, árbol de archivos y commits Git. Mapea la ruta del contenedor `/projects/...` a la ruta física del host `D:/AntigravityProyectos/...`.
* **`tokenTracker.mjs`:** Análisis de transcripciones de sesiones locales de Antigravity en `.gemini/antigravity/brain` para contabilizar tokens de entrada, salida y caché.
* **`config.mjs`:** Carga y resolución de rutas dinámicas de proyectos, datos de Antigravity y clave Cortex.

### 2. Frontend (`public/`)
* **`index.html`:** Dashboard con diseño Glassmorphism Cyberpunk/Modern. Vistas de `Quota Management` y `Proyectos`, más modal inspector de proyectos (`#modal-project-inspector`).
* **`app.js`:**
  * Control del timeline Gantt de 14 días con conmutador semanal / 5 horas.
  * Barras de progreso con código de color (verde $>70\%$, naranja $30-70\%$, rojo $<30\%$).
  * `launchDesktopProtocol(protocol, path, app)`: Lanzador asíncrono con iframe invisible para disparar `antigravity-ide://file/...` y `vscode://file/...` sin que la pestaña del navegador se cierre ni parpadee.
  * Notificaciones flotantes tipo Toast (`showToast`).
* **`style.css`:** Sistema de variables CSS, modo oscuro profundo, cuadrícula Gantt y estilizado del inspector.

### 3. Cuentas y Credenciales (`credentials/`)
Estructura multicuenta modular para Google AI Pro:
1. Almacena credenciales locales en formato JSON (ignoradas en `.gitignore`).
2. Provee plantilla limpia en `credentials/account.example.json`.
3. Soporta buckets de Gemini Models, Claude/GPT y Gemini 4 Argon.

### 4. Docker (`docker-compose.yml` & `Dockerfile`)
* Servicio: `quotaflow`
* Contenedor: `quotaflow-app` corriendo en `http://localhost:3333`
* Volúmenes montados:
  * `${PROJECTS_PATH:-D:/AntigravityProyectos}` $\rightarrow$ `/projects:ro`
  * `${ANTIGRAVITY_PATH:-C:/Users/<User>/.gemini/antigravity}` $\rightarrow$ `/antigravity-data:ro`
  * `./credentials` $\rightarrow$ `/app/credentials`

---

## 🔑 Descubrimientos y Decisiones Técnicas Clave
1. **Protocolo de Antigravity IDE:**
   * En Windows, `antigravity://` está asociado al ejecutable viejo (`Antigravity.exe`).
   * El protocolo correcto para **Antigravity IDE** es `antigravity-ide://` (`Antigravity IDE.exe --open-url -- "%1"`).
2. **Cierre de pestaña solucionado:**
   * Al navegar con `<a href="...">` a un protocolo externo, Chromium cierra o cancela la pestaña web.
   * La solución implementada dispara la URL a través de un iframe invisible inyectado en el DOM (`launchDesktopProtocol`), preservando la pestaña activa al 100%.
3. **Mapeo de Rutas Host:**
   * Como Node corre dentro de Docker, el backend envía `hostPath` (`D:/AntigravityProyectos/...`) al navegador para que Windows pueda abrir los proyectos locales en los IDEs.

---

## 📋 Estado Actual del Git
* Rama: `main`
* Últimos commits:
  * `5a886b8`: `feat(branding): rename project to QuotaFlow with v2.0 UI branding and comprehensive documentation`
  * `1a55a53`: `fix(ide-launcher): use antigravity-ide protocol, prevent tab closing via iframe launcher and add desktop toast`
  * `9724ef7`: `feat(projects): fix host path mapping for Antigravity/VSCode IDE opening and add in-browser Project Inspector`
  * `e51b044`: `feat(ui): redesign Quota Windows timeline with dynamic 14-day Gantt, scope switcher, and clean provider chips`
  * `a8cc8f3`: `fix(quota): integrate real live Gemini quota, exact consumed percentages, and colored progress meters`
