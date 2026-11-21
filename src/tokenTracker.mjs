import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// Antigravity Native Token Tracker & Quota Estimator
export async function getAntigravityTokenMetrics(antigravityDir) {
  const brainDir = path.join(antigravityDir, "brain");
  
  const metrics = {
    connected: false,
    totalSessions: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    todayInputTokens: 0,
    todayOutputTokens: 0,
    todayCacheReadTokens: 0,
    models: {},
    hourlyActivity: Array(24).fill(0),
    recentCalls: [],
    resets: {
      dailyQuotaResetSeconds: 0,
      dailyQuotaResetTime: "",
      minuteWindowSeconds: 0,
    },
  };

  // Compute standard Google Cloud / Gemini API daily reset (Midnight UTC)
  const now = new Date();
  const midnightUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  const diffDailySeconds = Math.max(0, Math.floor((midnightUtc.getTime() - now.getTime()) / 1000));
  metrics.resets.dailyQuotaResetSeconds = diffDailySeconds;
  metrics.resets.dailyQuotaResetTime = midnightUtc.toISOString();

  // Minute rolling window countdown (resets every 60s)
  metrics.resets.minuteWindowSeconds = 60 - now.getSeconds();

  if (!fs.existsSync(brainDir)) {
    return metrics;
  }

  metrics.connected = true;

  const todayIsoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const sessionFolders = fs.readdirSync(brainDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    metrics.totalSessions = sessionFolders.length;

    // Scan sessions, prioritizing recent folders by mtime
    const sortedFolders = sessionFolders.map((name) => {
      const fullPath = path.join(brainDir, name);
      let mtime = 0;
      try {
        mtime = fs.statSync(fullPath).mtimeMs;
      } catch {}
      return { name, fullPath, mtime };
    }).sort((a, b) => b.mtime - a.mtime);

    // Read transcripts from top 100 most recent sessions for snappy performance
    const targetFolders = sortedFolders.slice(0, 100);

    for (const item of targetFolders) {
      const transcriptFile = path.join(
        item.fullPath,
        ".system_generated",
        "logs",
        "transcript.jsonl"
      );

      if (!fs.existsSync(transcriptFile)) continue;

      const fileStream = fs.createReadStream(transcriptFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.includes('"model"')) continue;

        try {
          const entry = JSON.parse(line);
          if (entry.model && entry.input_tokens !== undefined) {
            const inp = entry.input_tokens || 0;
            const outp = entry.output_tokens || 0;
            const cache = entry.cache_read_tokens || 0;
            const modelName = entry.model;
            const createdAt = entry.created_at ? new Date(entry.created_at) : null;

            // Global totals
            metrics.totalInputTokens += inp;
            metrics.totalOutputTokens += outp;
            metrics.totalCacheReadTokens += cache;

            // Model breakdowns
            if (!metrics.models[modelName]) {
              metrics.models[modelName] = {
                calls: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheTokens: 0,
              };
            }
            metrics.models[modelName].calls += 1;
            metrics.models[modelName].inputTokens += inp;
            metrics.models[modelName].outputTokens += outp;
            metrics.models[modelName].cacheTokens += cache;

            // Today's usage & Hourly histogram
            if (createdAt && !isNaN(createdAt.getTime())) {
              const entryDate = createdAt.toISOString().slice(0, 10);
              if (entryDate === todayIsoDate) {
                metrics.todayInputTokens += inp;
                metrics.todayOutputTokens += outp;
                metrics.todayCacheReadTokens += cache;
                const hour = createdAt.getHours();
                metrics.hourlyActivity[hour] += inp + outp;
              }

              // Keep last 15 recent calls
              if (metrics.recentCalls.length < 15) {
                metrics.recentCalls.push({
                  model: modelName,
                  inputTokens: inp,
                  outputTokens: outp,
                  cacheTokens: cache,
                  timestamp: entry.created_at,
                  tools: (entry.tool_calls || []).map((t) => t.name),
                });
              }
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Sort recent calls by timestamp desc
    metrics.recentCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    metrics.recentCalls = metrics.recentCalls.slice(0, 15);

  } catch (err) {
    metrics.error = err.message;
  }

  return metrics;
}
