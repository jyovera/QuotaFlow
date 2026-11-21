import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Safe execution helper for git
function runGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
  } catch {
    return null;
  }
}

// Detect tech stack from files
function detectTechStack(projectPath) {
  const stack = new Set();

  const pkgJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    stack.add("Node.js");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (allDeps.react) stack.add("React");
      if (allDeps.next) stack.add("Next.js");
      if (allDeps.vue) stack.add("Vue");
      if (allDeps.express) stack.add("Express");
      if (allDeps.typescript || fs.existsSync(path.join(projectPath, "tsconfig.json"))) stack.add("TypeScript");
      if (allDeps.tailwindcss) stack.add("Tailwind");
      if (allDeps.vite) stack.add("Vite");
      if (allDeps.playwright || allDeps["@playwright/test"]) stack.add("Playwright");
      if (allDeps.electron) stack.add("Electron");
    } catch {}
  }

  if (fs.existsSync(path.join(projectPath, "requirements.txt")) ||
      fs.existsSync(path.join(projectPath, "pyproject.toml")) ||
      fs.existsSync(path.join(projectPath, "Pipfile"))) {
    stack.add("Python");
    try {
      const reqs = fs.existsSync(path.join(projectPath, "requirements.txt"))
        ? fs.readFileSync(path.join(projectPath, "requirements.txt"), "utf-8").toLowerCase()
        : "";
      if (reqs.includes("fastapi")) stack.add("FastAPI");
      if (reqs.includes("django")) stack.add("Django");
      if (reqs.includes("flask")) stack.add("Flask");
      if (reqs.includes("pytorch") || reqs.includes("torch")) stack.add("PyTorch");
    } catch {}
  }

  if (fs.existsSync(path.join(projectPath, "go.mod"))) stack.add("Go");
  if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) stack.add("Rust");
  if (fs.existsSync(path.join(projectPath, "Dockerfile")) || fs.existsSync(path.join(projectPath, "docker-compose.yml"))) stack.add("Docker");
  if (fs.existsSync(path.join(projectPath, ".agents")) || fs.existsSync(path.join(projectPath, "GEMINI.md"))) stack.add("Antigravity Agent");

  return Array.from(stack);
}

// Extract human-readable description
function extractDescription(projectPath) {
  // Check README.md
  for (const docName of ["README.md", "GEMINI.md", "AGENTS.md", "LEEME.md"]) {
    const docPath = path.join(projectPath, docName);
    if (fs.existsSync(docPath)) {
      try {
        const content = fs.readFileSync(docPath, "utf-8");
        const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("#")) {
            const clean = line.replace(/^#+\s*/, "").trim();
            if (clean && clean.length > 5) return clean;
          } else if (line.length > 20 && !line.startsWith("```") && !line.startsWith("!")) {
            return line.slice(0, 160) + (line.length > 160 ? "..." : "");
          }
        }
      } catch {}
    }
  }

  // Fallback to package.json description
  const pkgJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.description) return pkg.description;
    } catch {}
  }

  return "Proyecto Antigravity sin descripción detallada.";
}

// Inspect Git repository state
function inspectGit(projectPath) {
  const isGit = fs.existsSync(path.join(projectPath, ".git"));
  if (!isGit) {
    return {
      isGit: false,
      branch: null,
      lastCommit: null,
      isDirty: false,
    };
  }

  const branch = runGit("git branch --show-current", projectPath) || "main";
  const log = runGit('git log -1 --format="%h|%an|%cr|%s|%cI"', projectPath);
  const status = runGit("git status --porcelain", projectPath);

  let lastCommit = null;
  if (log) {
    const [hash, author, relativeDate, message, isoDate] = log.split("|");
    lastCommit = {
      hash,
      author,
      relativeDate,
      message,
      isoDate,
    };
  }

  return {
    isGit: true,
    branch,
    lastCommit,
    isDirty: Boolean(status && status.length > 0),
  };
}

// Helper: Build a clean file tree
function buildFileTree(dir, maxDepth = 2, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = [];

    // Sort: directories first, then files
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (const e of sorted) {
      const name = e.name;
      // Skip heavy / hidden directories
      if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build" || name === "__pycache__" || name === ".git" || name === "coverage") {
        continue;
      }

      const fullPath = path.join(dir, name);
      if (e.isDirectory()) {
        items.push({
          name,
          type: "directory",
          children: currentDepth < maxDepth ? buildFileTree(fullPath, maxDepth, currentDepth + 1) : [],
        });
      } else {
        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch {}
        items.push({
          name,
          type: "file",
          size,
          ext: path.extname(name).toLowerCase(),
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

// Helper: Get recent git commits
function getGitCommits(projectPath, limit = 10) {
  const isGit = fs.existsSync(path.join(projectPath, ".git"));
  if (!isGit) return [];
  const log = runGit(`git log -n ${limit} --format="%h|%an|%cr|%s|%cI"`, projectPath);
  if (!log) return [];
  return log.split("\n").filter(Boolean).map((line) => {
    const [hash, author, relativeDate, message, isoDate] = line.split("|");
    return { hash, author, relativeDate, message, isoDate };
  });
}

// Main scanner
export function scanProjects(projectDirs, cortexProjects = [], hostBaseDir = "") {
  const projects = [];
  const visitedPaths = new Set();

  for (const baseDir of projectDirs) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;

        // Skip system/hidden folders
        if (name.startsWith(".") || name === "node_modules" || name === "$RECYCLE.BIN") continue;

        const projectPath = path.join(baseDir, name);
        if (visitedPaths.has(projectPath)) continue;
        visitedPaths.add(projectPath);

        let stats = null;
        try {
          stats = fs.statSync(projectPath);
        } catch {
          continue;
        }

        const stack = detectTechStack(projectPath);
        const description = extractDescription(projectPath);
        const gitInfo = inspectGit(projectPath);

        // Calculate host path for client IDE opening (Windows vs Docker)
        let hostPath = projectPath.replace(/\\/g, "/");
        if (hostBaseDir) {
          const rel = path.relative(baseDir, projectPath).replace(/\\/g, "/");
          hostPath = `${hostBaseDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`;
        }

        // Match with Cortex memory
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cortexMatch = cortexProjects.find((cp) => {
          const cpClean = (cp.slug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return cpClean && (cpClean === cleanName || cleanName.includes(cpClean) || cpClean.includes(cleanName));
        });

        // Determine health/status
        let activityStatus = "idle";
        const lastActivityDate = gitInfo.lastCommit?.isoDate
          ? new Date(gitInfo.lastCommit.isoDate)
          : stats.mtime;

        const daysSinceActivity = (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceActivity < 7) {
          activityStatus = "active";
        } else if (daysSinceActivity < 30) {
          activityStatus = "recent";
        }

        projects.push({
          name,
          path: projectPath,
          hostPath,
          directory: baseDir,
          description,
          stack,
          git: gitInfo,
          activityStatus,
          lastActivity: lastActivityDate,
          daysSinceActivity: Math.floor(daysSinceActivity),
          cortex: cortexMatch
            ? {
                linked: true,
                memoriesCount: cortexMatch.memoriesCount,
                slug: cortexMatch.slug,
                cortexDescription: cortexMatch.description,
              }
            : { linked: false },
        });
      }
    } catch {}
  }

  // Sort by recent activity
  projects.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  return projects;
}

// Get full project details (README, files, git history)
export function getProjectDetails(projectName, projectDirs, cortexProjects = [], hostBaseDir = "") {
  for (const baseDir of projectDirs) {
    const projectPath = path.join(baseDir, projectName);
    if (fs.existsSync(projectPath)) {
      // Find README
      let readme = "";
      for (const docName of ["README.md", "GEMINI.md", "AGENTS.md", "LEEME.md"]) {
        const docPath = path.join(projectPath, docName);
        if (fs.existsSync(docPath)) {
          try {
            readme = fs.readFileSync(docPath, "utf-8");
            break;
          } catch {}
        }
      }

      // Read package.json / requirements
      let packageInfo = null;
      const pkgPath = path.join(projectPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          packageInfo = {
            name: pkg.name,
            version: pkg.version,
            scripts: pkg.scripts || {},
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
          };
        } catch {}
      }

      const fileTree = buildFileTree(projectPath, 2);
      const commits = getGitCommits(projectPath, 15);
      const stack = detectTechStack(projectPath);
      const gitInfo = inspectGit(projectPath);

      let hostPath = projectPath.replace(/\\/g, "/");
      if (hostBaseDir) {
        const rel = path.relative(baseDir, projectPath).replace(/\\/g, "/");
        hostPath = `${hostBaseDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`;
      }

      return {
        name: projectName,
        path: projectPath,
        hostPath,
        stack,
        git: gitInfo,
        commits,
        packageInfo,
        readme,
        fileTree,
      };
    }
  }
  return null;
}

// Safe file reader
export function getProjectFileContent(projectName, relFilePath, projectDirs) {
  for (const baseDir of projectDirs) {
    const projectPath = path.join(baseDir, projectName);
    if (fs.existsSync(projectPath)) {
      const targetPath = path.resolve(projectPath, relFilePath);
      if (!targetPath.startsWith(projectPath)) {
        return { error: "Access denied" };
      }
      if (!fs.existsSync(targetPath)) {
        return { error: "File not found" };
      }

      const stat = fs.statSync(targetPath);
      if (stat.size > 200 * 1024) {
        return { error: "File too large to preview (>200KB)" };
      }

      try {
        const content = fs.readFileSync(targetPath, "utf-8");
        return {
          content,
          size: stat.size,
          ext: path.extname(targetPath).toLowerCase(),
        };
      } catch (err) {
        return { error: err.message };
      }
    }
  }
  return { error: "Project not found" };
}
