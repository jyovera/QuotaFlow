import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Load local configuration or environment variables
export function resolveConfig() {
  const homeDir = os.homedir();
  const defaultAntigravityDir = path.join(homeDir, ".gemini", "antigravity");
  const localConfigFile = path.join(process.cwd(), "config.json");

  let localConfig = {};
  if (fs.existsSync(localConfigFile)) {
    try {
      localConfig = JSON.parse(fs.readFileSync(localConfigFile, "utf-8"));
    } catch {
      localConfig = {};
    }
  }

  // Support multiple project directories (semicolon or comma separated)
  const rawProjectDirs =
    process.env.PROJECTS_DIR ||
    localConfig.projectsDir ||
    path.resolve(process.cwd(), "..");

  const projectDirs = rawProjectDirs
    .split(/[;,]/)
    .map((d) => d.trim())
    .filter(Boolean);

  const projectsHostDir =
    process.env.PROJECTS_HOST_DIR ||
    localConfig.projectsHostDir ||
    (process.env.PROJECTS_DIR === "/projects" ? "D:/AntigravityProyectos" : projectDirs[0] || "");

  const antigravityDir =
    process.env.ANTIGRAVITY_DATA_DIR ||
    localConfig.antigravityDataDir ||
    defaultAntigravityDir;

  let cortexApiKey = process.env.CORTEX_API_KEY || localConfig.cortexApiKey || "";

  // Check cortex-bridge.mjs or mcp_config.json for API key fallback
  if (!cortexApiKey) {
    const bridgePath = path.join(homeDir, "cortex-bridge.mjs");
    if (fs.existsSync(bridgePath)) {
      try {
        const bridgeContent = fs.readFileSync(bridgePath, "utf-8");
        const match = bridgeContent.match(/CORTEX_API_KEY.*?"(cc_[a-zA-Z0-9_-]+)"/);
        if (match) cortexApiKey = match[1];
      } catch {}
    }
  }

  if (!cortexApiKey) {
    const globalMcp = path.join(homeDir, ".gemini", "config", "mcp_config.json");
    if (fs.existsSync(globalMcp)) {
      try {
        const mcpData = JSON.parse(fs.readFileSync(globalMcp, "utf-8"));
        cortexApiKey = mcpData?.mcpServers?.cortex?.env?.CORTEX_API_KEY || "";
      } catch {}
    }
  }

  const port = parseInt(process.env.PORT || localConfig.port || "3333", 10);

  return {
    port,
    projectDirs,
    projectsHostDir,
    antigravityDir,
    cortexApiKey,
  };
}

export function saveLocalConfig(newValues) {
  const localConfigFile = path.join(process.cwd(), "config.json");
  let current = {};
  if (fs.existsSync(localConfigFile)) {
    try {
      current = JSON.parse(fs.readFileSync(localConfigFile, "utf-8"));
    } catch {
      current = {};
    }
  }

  const updated = { ...current, ...newValues };
  fs.writeFileSync(localConfigFile, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}
