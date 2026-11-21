# 🌊 QuotaFlow

> **Intelligent Multi-Account AI Quota Management & Project Hub for Antigravity, Gemini & AI IDEs**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)
[![Antigravity IDE](https://img.shields.io/badge/Antigravity_IDE-Integrated-ea4335.svg)](https://deepmind.google)

**QuotaFlow** es una plataforma nativa (sin proxies intermedios ni dependencias pesadas) diseñada para desarrolladores que trabajan intensivamente con **Google Antigravity**, **Gemini 2.5 / 3.0 Pro & Flash**, **Claude** y **GPT**. 

Ofrece visibilidad total y en tiempo real sobre los límites de cuota de tus múltiples cuentas, cronómetros de reinicio, una línea de tiempo dinámica tipo Gantt de 14 días, y un centro de exploración y apertura rápida de proyectos en **Antigravity IDE** y **VS Code**.

---

## ✨ Características Principales

### 1. 📊 Gestión Inteligente de Cuotas Multicuenta
* **Medición Real en Vivo:** Consulta directamente los límites y el consumo exacto de tus cuentas registradas (Gemini Models, Claude & GPT Models, Gemini Argon).
* **Barras de Progreso Dinámicas:** Visualización con colores inteligentes (verde $>70\%$, naranja $30-70\%$, rojo $<30\%$) del porcentaje disponible.
* **Cronómetros de Reinicio:** Conteo regresivo exacto para límites de 5 horas y límites semanales de 7 días.
* **Línea de Tiempo Gantt (14 días):** Matriz visual con columnas sincronizadas por fecha, marcador de "Hoy", cálculo dinámico de expiración y conmutador de rango (*Semanal* vs *5 Horas*).
* **Filtros por Proveedor:** Chips de selección rápida para Google Antigravity, Claude, Codex, xAI, Devin y extensiones.

### 2. 📁 Project Hub & Explorador de Código en Navegador
* **Mapeo Automático:** Escanea tus carpetas de desarrollo locales o montadas en Docker (`D:/AntigravityProyectos`, etc.).
* **Detección de Stack:** Identifica automáticamente React, Next.js, Node.js, Python, FastAPI, Go, Rust, Docker y Agentes Antigravity.
* **Historial Git en Vivo:** Muestra la rama activa, estado del árbol de trabajo (*clean* vs *dirty*) y último commit.
* **Modal Inspector de Proyectos:**
  * 📄 Visualizador de `README.md` o documentación del proyecto.
  * 📁 Explorador de árbol de archivos completo con visor de código fuente.
  * 🌿 Registro cronológico de los últimos 15 commits con autor y fecha.
  * 🧠 Enlace directo a la memoria Cortex del proyecto.

### 3. 🚀 Lanzador Nativo a IDEs
* **Antigravity IDE:** Dispara la apertura del proyecto directamente en tu editor **Antigravity IDE** (`antigravity-ide://file/...`) en una nueva ventana de escritorio.
* **VS Code:** Compatible con el protocolo nativo `vscode://file/...`.
* **Cero Cierres de Pestaña:** Emplea un lanzador asíncrono seguro vía iframe invisible que garantiza que la pestaña del dashboard nunca se cierre ni se descargue, complementado con avisos flotantes (*toasts*).

### 4. 🧠 Token Tracker & Cortex Memory Hub
* **Lectura Nativa de Tokens:** Inspecciona las sesiones de Antigravity extrayendo tokens de entrada, salida y lectura de caché.
* **Ventana de Ráfaga y Cuota Diaria:** Reloj en vivo hacia el reinicio diario UTC (Google Cloud).

---

## 🚀 Despliegue Rápido con Docker (Recomendado)

QuotaFlow incluye un `docker-compose.yml` optimizado con volúmenes de solo lectura hacia tus proyectos locales y datos de Antigravity:

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/quotaflow.git
cd quotaflow

# 2. Iniciar el contenedor con Docker Compose
docker compose up -d --build
```

Abre tu navegador en: **`http://localhost:3333`**

### Variables en `docker-compose.yml`:
* `PROJECTS_HOST_DIR`: Ruta de tus proyectos en el host Windows (ej: `D:/AntigravityProyectos`).
* `ANTIGRAVITY_PATH`: Ruta al directorio `.gemini/antigravity` en tu máquina.
* `credentials/`: Carpeta montada para persistir las credenciales JSON de tus cuentas.

---

## 💻 Ejecución Local con Node.js

Requisitos: **Node.js >= 20.0.0**

```bash
# 1. Instalar dependencias (Node nativo, sin dependencias externas obligatorias)
npm install

# 2. Iniciar en modo desarrollo
npm run dev

# O en modo producción
npm start
```

---

## ⚙️ Configuración y Variables de Entorno

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto HTTP del dashboard | `3333` |
| `PROJECTS_DIR` | Directorio dentro del contenedor donde se leen los proyectos | `/projects` |
| `PROJECTS_HOST_DIR` | Ruta real en el host Windows para disparar los IDEs | `D:/AntigravityProyectos` |
| `ANTIGRAVITY_DATA_DIR` | Ruta a los datos de Antigravity (`.gemini/antigravity`) | `/antigravity-data` |
| `CREDENTIALS_DIR` | Directorio donde residen los JSON de credenciales | `/app/credentials` |
| `CORTEX_API_KEY` | Clave API opcional para Cortex Memory Hub | *(Auto-detectada si existe)* |

---

## 🔒 Privacidad y Seguridad

* **Sin intermediarios:** QuotaFlow no envía tus credenciales ni proyectos a servidores de terceros.
* **Montajes de Solo Lectura:** El contenedor accede a tus proyectos y transcripciones de Antigravity en modo `:ro` (Read-Only).
* **Nativo y Abierto:** Código 100% auditable en Vanilla JavaScript y Node.js estándar.

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta `LICENSE` para más detalles.
