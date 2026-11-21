// Cortex Memory Integration Helper
export async function fetchCortexData(cortexApiKey) {
  if (!cortexApiKey) {
    return { connected: false, projects: [], stats: null, error: "No API Key provided" };
  }

  const endpoint = "https://cortexmem.com/api/cortex/mcp";

  async function callMcpMethod(name, args = {}) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cortexApiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Cortex`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "Cortex RPC error");
    }

    return payload.result;
  }

  try {
    const [statsResult, projectsResult] = await Promise.allSettled([
      callMcpMethod("memoria_stats"),
      callMcpMethod("memoria_projects"),
    ]);

    let stats = null;
    let projects = [];

    if (statsResult.status === "fulfilled") {
      stats = statsResult.value?.content?.[0]?.text || null;
    }

    if (projectsResult.status === "fulfilled") {
      const projectsText = projectsResult.value?.content?.[0]?.text || "";
      // Parse projects lines like:
      // "usuario-qa · 2 mem · 2026-10-06"
      // "   Description..."
      const lines = projectsText.split("\n");
      let current = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const headerMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*·\s*(\d+)\s*mem(?:\s*·\s*(\d+)\s*ses)?\s*·\s*([0-9-]+)/);
        if (headerMatch) {
          if (current) projects.push(current);
          current = {
            slug: headerMatch[1],
            memoriesCount: parseInt(headerMatch[2], 10),
            sessionsCount: headerMatch[3] ? parseInt(headerMatch[3], 10) : 0,
            lastDate: headerMatch[4],
            description: "",
            path: "",
          };
        } else if (current) {
          if (trimmed.includes("·") && trimmed.includes("/")) {
            const parts = trimmed.split("·");
            current.description = parts[0]?.trim() || current.description;
            current.path = parts[1]?.trim() || current.path;
          } else if (!current.description) {
            current.description = trimmed;
          }
        }
      }
      if (current) projects.push(current);
    }

    return {
      connected: true,
      stats,
      projects,
    };
  } catch (err) {
    return {
      connected: false,
      projects: [],
      stats: null,
      error: err.message,
    };
  }
}
