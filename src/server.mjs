import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile();
} catch {}

import { resolveConfig, saveLocalConfig } from "./config.mjs";
import { scanProjects, getProjectDetails, getProjectFileContent } from "./projectScanner.mjs";
import { getAntigravityTokenMetrics } from "./tokenTracker.mjs";
import { fetchCortexData } from "./cortexClient.mjs";
import { CredentialManager } from "./credentialManager.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const credentialsDir = path.resolve(
  process.env.CREDENTIALS_DIR || path.join(process.cwd(), "credentials")
);
const credentialManager = new CredentialManager(credentialsDir);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Cached state
let cachedCortex = { connected: false, projects: [], stats: null };
let lastCortexFetch = 0;

async function getCachedCortex(apiKey) {
  if (Date.now() - lastCortexFetch > 60000) {
    cachedCortex = await fetchCortexData(apiKey);
    lastCortexFetch = Date.now();
  }
  return cachedCortex;
}

const server = http.createServer(async (req, res) => {
  const config = resolveConfig();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // Default CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Endpoints ---
  if (pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    try {
      // 1. Projects List
      if (pathname === "/api/projects" && req.method === "GET") {
        const cortexData = await getCachedCortex(config.cortexApiKey);
        const projects = scanProjects(config.projectDirs, cortexData.projects, config.projectsHostDir);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          count: projects.length,
          projectDirs: config.projectDirs,
          projectsHostDir: config.projectsHostDir,
          projects,
        }));
        return;
      }

      // 1b. Project Full Details (README, file tree, git history)
      if (pathname === "/api/projects/details" && req.method === "GET") {
        const name = url.searchParams.get("name");
        if (!name) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: "Missing name parameter" }));
          return;
        }
        const cortexData = await getCachedCortex(config.cortexApiKey);
        const details = getProjectDetails(name, config.projectDirs, cortexData.projects, config.projectsHostDir);
        if (!details) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: "Project not found" }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, project: details }));
        return;
      }

      // 1c. Project File Content Preview
      if (pathname === "/api/projects/file" && req.method === "GET") {
        const project = url.searchParams.get("project");
        const filePath = url.searchParams.get("path");
        if (!project || !filePath) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: "Missing project or path parameter" }));
          return;
        }
        const fileResult = getProjectFileContent(project, filePath, config.projectDirs);
        if (fileResult.error) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: fileResult.error }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, ...fileResult }));
        return;
      }

      // 2. Token Metrics & Quota Resets
      if (pathname === "/api/tokens" && req.method === "GET") {
        const tokenMetrics = await getAntigravityTokenMetrics(config.antigravityDir);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          antigravityDir: config.antigravityDir,
          ...tokenMetrics,
        }));
        return;
      }

      // 3. Cortex Memory Info
      if (pathname === "/api/cortex" && req.method === "GET") {
        const cortexData = await getCachedCortex(config.cortexApiKey);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          hasKey: Boolean(config.cortexApiKey),
          ...cortexData,
        }));
        return;
      }

      // 4. Quota Management & Multi-Account Credentials
      if (pathname === "/api/credentials" && req.method === "GET") {
        const credentials = await credentialManager.listCredentials();
        const counts = {
          all: credentials.length,
          antigravity: credentials.filter((c) => c.provider === "antigravity").length,
          claude: credentials.filter((c) => c.provider === "claude").length,
          codex: credentials.filter((c) => c.provider === "codex").length,
          xai: credentials.filter((c) => c.provider === "xai").length,
          kimi: credentials.filter((c) => c.provider === "kimi").length,
          devin: credentials.filter((c) => c.provider === "devin").length,
          muse: credentials.filter((c) => c.provider === "muse").length,
          plugin: credentials.filter((c) => c.provider === "plugin").length,
        };

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          counts,
          credentials,
        }));
        return;
      }

      // 5. Upload / Save Credential
      if (pathname === "/api/credentials/upload" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || "{}");
        const filename = payload.filename || `antigravity-${payload.email || Date.now()}.json`;
        const result = credentialManager.saveCredential(filename, payload.data || payload);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, credential: result }));
        return;
      }

      // 6. Refresh Quota for One Credential
      if (pathname.startsWith("/api/credentials/") && pathname.endsWith("/refresh") && req.method === "POST") {
        const parts = pathname.split("/");
        const id = decodeURIComponent(parts[3]);
        if (id === "refresh-all") {
          await credentialManager.refreshAllQuotas();
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          return;
        }
        await credentialManager.refreshQuota(id);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id }));
        return;
      }

      // 7. Refresh All Credentials
      if (pathname === "/api/credentials/refresh-all" && req.method === "POST") {
        await credentialManager.refreshAllQuotas();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // 8. Delete Credential
      if (pathname.startsWith("/api/credentials/") && req.method === "DELETE") {
        const id = decodeURIComponent(pathname.replace("/api/credentials/", ""));
        const deleted = credentialManager.deleteCredential(id);
        res.writeHead(200);
        res.end(JSON.stringify({ success: deleted }));
        return;
      }

      // 9. Global Status Summary
      if (pathname === "/api/status" && req.method === "GET") {
        const cortexData = await getCachedCortex(config.cortexApiKey);
        const projects = scanProjects(config.projectDirs, cortexData.projects);
        const tokenMetrics = await getAntigravityTokenMetrics(config.antigravityDir);
        const credentials = credentialManager.listCredentials();

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          app: "QuotaFlow",
          version: "1.0.0",
          config: {
            port: config.port,
            projectDirs: config.projectDirs,
            antigravityDir: config.antigravityDir,
            hasCortexKey: Boolean(config.cortexApiKey),
          },
          summary: {
            totalProjects: projects.length,
            activeProjects: projects.filter((p) => p.activityStatus === "active").length,
            totalCredentials: credentials.length,
            tokensToday: tokenMetrics.todayInputTokens + tokenMetrics.todayOutputTokens,
            totalTokensAllTime: tokenMetrics.totalInputTokens + tokenMetrics.totalOutputTokens,
            cortexConnected: cortexData.connected,
            resets: tokenMetrics.resets,
          },
        }));
        return;
      }

      // 10. Update Settings
      if (pathname === "/api/settings" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
          const payload = JSON.parse(body || "{}");
          const updated = saveLocalConfig(payload);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, config: updated }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: "Invalid JSON payload" }));
        }
        return;
      }

      // 404 API
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, error: "Not found" }));
      return;
    } catch (apiErr) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: apiErr.message }));
      return;
    }
  }

  // --- Static File Serving ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "/index.html";
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  }
});

const config = resolveConfig();
server.listen(config.port, "0.0.0.0", () => {
  console.log(`\n======================================================`);
  console.log(`🌊 QuotaFlow Dashboard is running!`);
  console.log(`📡 Local URL:    http://localhost:${config.port}`);
  console.log(`📁 Projects:     ${config.projectDirs.join(", ")}`);
  console.log(`🧠 Antigravity:   ${config.antigravityDir}`);
  console.log(`🔑 Credentials:   ${credentialsDir}`);
  console.log(`======================================================\n`);
});
