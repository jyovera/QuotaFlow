import fs from "node:fs";
import path from "node:path";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const GOOGLE_QUOTA_URLS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
];

// MUST use antigravity/hub user agent so Google returns the Gemini Models & Argon buckets
const USER_AGENT = "antigravity/hub/2.33.0 darwin/arm64";

// Helper: Refresh Google OAuth access token using refresh_token
async function refreshGoogleAccessToken(refreshToken) {
  if (!refreshToken) return null;
  try {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// Helper: Query Google CloudCode API for live quota
async function queryGoogleLiveQuota(accessToken, projectId = "aicode-consumers") {
  if (!accessToken) return null;

  for (const url of GOOGLE_QUOTA_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ project: projectId }),
      });

      if (res.status === 401) {
        return { unauthorized: true };
      }

      if (!res.ok) continue;

      const data = await res.json();
      if (data && data.groups && data.groups.length > 0) {
        return data;
      }
    } catch {
      // Continue to next URL
    }
  }
  return null;
}

export class CredentialManager {
  constructor(credentialsDir) {
    this.credentialsDir = credentialsDir;
    this.cachedLiveQuotas = new Map();
    if (!fs.existsSync(this.credentialsDir)) {
      try {
        fs.mkdirSync(this.credentialsDir, { recursive: true });
      } catch {}
    }
  }

  formatMins(mins) {
    if (!mins || mins <= 0) return "0m";
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const remMins = mins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${remMins}m`;
    return `${remMins}m`;
  }

  formatExpiry(isoString) {
    if (!isoString) return "--/-- --:--";
    try {
      const d = new Date(isoString);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${mm}/${dd} ${hh}:${min}`;
    } catch {
      return "--/-- --:--";
    }
  }

  parseBucket(bucket, now, defaultWindow = "5h") {
    if (!bucket) {
      return {
        remainingPercent: 100,
        fraction: 1.0,
        status: "Quota available",
        percentLabel: "100% remaining",
        refreshText: defaultWindow === "5h" ? "Refreshes in 5h 0m" : "Refreshes in 7d 0h",
        resetTime: null,
      };
    }

    const resetDate = bucket.resetTime ? new Date(bucket.resetTime) : null;
    const remainingMins = resetDate ? Math.max(0, Math.floor((resetDate.getTime() - now) / 60000)) : 0;
    const fraction = bucket.remainingFraction !== undefined && bucket.remainingFraction !== null
      ? Number(bucket.remainingFraction)
      : 1.0;
    const remainingPercent = Math.max(0, Math.min(100, Math.round(fraction * 100)));

    let status = `${remainingPercent}% remaining`;
    if (fraction === 1.0) {
      status = "Quota available";
    }

    return {
      remainingPercent,
      fraction,
      status,
      percentLabel: `${remainingPercent}% remaining`,
      refreshText: remainingMins > 0 ? `Refreshes in ${this.formatMins(remainingMins)}` : (defaultWindow === "5h" ? "Refreshes in 5h 0m" : "Refreshes in 7d 0h"),
      resetTime: bucket.resetTime || null,
      description: bucket.description || "",
    };
  }

  async listCredentials(forceRefresh = false) {
    if (!fs.existsSync(this.credentialsDir)) return [];

    const files = fs
      .readdirSync(this.credentialsDir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"));
    const list = [];
    const now = Date.now();

    for (const filename of files) {
      const fullPath = path.join(this.credentialsDir, filename);
      try {
        let raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        const email = raw.email || filename.replace(/^antigravity-/, "").replace(/\.json$/, "");
        const provider = raw.provider || (filename.includes("antigravity") ? "antigravity" : "general");
        const plan = raw.plan || (raw.access_token ? "Pro" : "Pro");
        let accessToken = raw.access_token;
        const refreshToken = raw.refresh_token;
        const projectId = raw.project_id || "aicode-consumers";

        // Capability hints (e.g. check for Gemini 4 Argon)
        const modelIds = raw.antigravity_capability_hints?.model_ids || [];
        let hasArgon = modelIds.some((id) => id.includes("argon") && !id.includes("disabled"));

        // Query live Google API
        let liveData = null;
        const cached = this.cachedLiveQuotas.get(filename);
        if (!forceRefresh && cached && (now - cached.timestamp < 120000)) {
          liveData = cached.data;
        } else if (accessToken) {
          liveData = await queryGoogleLiveQuota(accessToken, projectId);

          // If token expired (401), automatically refresh and retry!
          if (liveData?.unauthorized && refreshToken) {
            const freshToken = await refreshGoogleAccessToken(refreshToken);
            if (freshToken) {
              accessToken = freshToken;
              raw.access_token = freshToken;
              fs.writeFileSync(fullPath, JSON.stringify(raw, null, 2), "utf-8");
              liveData = await queryGoogleLiveQuota(accessToken, projectId);
            }
          }

          if (liveData && !liveData.unauthorized) {
            this.cachedLiveQuotas.set(filename, { data: liveData, timestamp: now });
          }
        }

        // Ordered model groups dictionary
        const models = {};
        const quotaWindows = [];

        // Find API groups
        const groups = liveData?.groups || [];
        const rawGeminiGroup = groups.find((g) => {
          const name = (g.displayName || g.name || "").toLowerCase();
          return name.includes("gemini") && !name.includes("argon");
        });
        const rawClaudeGroup = groups.find((g) => {
          const name = (g.displayName || g.name || "").toLowerCase();
          return name.includes("claude") || name.includes("gpt") || name.includes("3p");
        });
        const rawArgonGroup = groups.find((g) => {
          const name = (g.displayName || g.name || "").toLowerCase();
          return name.includes("argon");
        });

        if (rawArgonGroup) {
          hasArgon = true;
        }

        // 1. GEMINI MODELS (Real live data from Google!)
        let gemini5hBucket = rawGeminiGroup?.buckets?.find((b) =>
          (b.window === "5h" || (b.bucketId || "").includes("5h") || (b.displayName || "").toLowerCase().includes("5") || (b.displayName || "").toLowerCase().includes("five"))
        );
        let geminiWeeklyBucket = rawGeminiGroup?.buckets?.find((b) =>
          (b.window === "weekly" || (b.bucketId || "").includes("weekly") || (b.displayName || "").toLowerCase().includes("week"))
        );

        const gemini5h = this.parseBucket(gemini5hBucket, now, "5h");
        const geminiWeekly = this.parseBucket(geminiWeeklyBucket, now, "weekly");

        models.gemini = {
          title: (rawGeminiGroup?.displayName || "GEMINI MODELS").toUpperCase(),
          fiveHour: gemini5h,
          weekly: geminiWeekly,
        };

        quotaWindows.push({
          modelGroup: "Gemini models",
          fiveHourRemaining: gemini5h.remainingPercent,
          weeklyRemaining: geminiWeekly.remainingPercent,
          expiry: geminiWeekly.resetTime ? this.formatExpiry(geminiWeekly.resetTime) : "11/28 12:11",
          percent: geminiWeekly.remainingPercent,
          weeklyResetTime: geminiWeekly.resetTime,
          fiveHourResetTime: gemini5h.resetTime,
          description: geminiWeekly.description || gemini5h.description,
        });

        // 2. CLAUDE AND GPT MODELS (Real live data from Google!)
        let claude5hBucket = rawClaudeGroup?.buckets?.find((b) =>
          (b.window === "5h" || (b.bucketId || "").includes("5h") || (b.displayName || "").toLowerCase().includes("5") || (b.displayName || "").toLowerCase().includes("five"))
        );
        let claudeWeeklyBucket = rawClaudeGroup?.buckets?.find((b) =>
          (b.window === "weekly" || (b.bucketId || "").includes("weekly") || (b.displayName || "").toLowerCase().includes("week"))
        );

        const claude5h = this.parseBucket(claude5hBucket, now, "5h");
        const claudeWeekly = this.parseBucket(claudeWeeklyBucket, now, "weekly");

        models.claudeGpt = {
          title: (rawClaudeGroup?.displayName || "CLAUDE AND GPT MODELS").toUpperCase(),
          fiveHour: claude5h,
          weekly: claudeWeekly,
        };

        quotaWindows.push({
          modelGroup: "Claude and GPT models",
          fiveHourRemaining: claude5h.remainingPercent,
          weeklyRemaining: claudeWeekly.remainingPercent,
          expiry: claudeWeekly.resetTime ? this.formatExpiry(claudeWeekly.resetTime) : "11/28 17:59",
          percent: claudeWeekly.remainingPercent,
          weeklyResetTime: claudeWeekly.resetTime,
          fiveHourResetTime: claude5h.resetTime,
          description: claudeWeekly.description || claude5h.description,
        });

        // 3. GEMINI 4 ARGON (If account has Argon)
        if (hasArgon) {
          let argonWeeklyBucket = rawArgonGroup?.buckets?.find((b) =>
            (b.window === "weekly" || (b.bucketId || "").includes("weekly") || (b.displayName || "").toLowerCase().includes("week"))
          ) || rawArgonGroup?.buckets?.[0];

          const argonWeekly = this.parseBucket(argonWeeklyBucket, now, "weekly");

          models.geminiArgon = {
            title: (rawArgonGroup?.displayName || "GEMINI 4 ARGON").toUpperCase(),
            weekly: argonWeekly,
          };

          quotaWindows.push({
            modelGroup: "Gemini 4 Argon",
            fiveHourRemaining: 100,
            weeklyRemaining: argonWeekly.remainingPercent,
            expiry: argonWeekly.resetTime ? this.formatExpiry(argonWeekly.resetTime) : "11/28 12:11",
            percent: argonWeekly.remainingPercent,
            weeklyResetTime: argonWeekly.resetTime,
            fiveHourResetTime: null,
            description: argonWeekly.description,
          });
        }

        list.push({
          id: filename,
          filename,
          email,
          provider,
          plan,
          isLive: Boolean(liveData && !liveData.unauthorized),
          models,
          quotaWindows,
          hasArgon,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Error reading credential file:", filename, e.message);
      }
    }

    return list;
  }

  async refreshQuota(filename) {
    this.cachedLiveQuotas.delete(filename);
    const list = await this.listCredentials(true);
    return list.find((c) => c.id === filename);
  }

  async refreshAllQuotas() {
    this.cachedLiveQuotas.clear();
    return await this.listCredentials(true);
  }

  saveCredential(filename, data) {
    let safeName = filename.endsWith(".json") ? filename : `${filename}.json`;
    safeName = safeName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const targetPath = path.join(this.credentialsDir, safeName);
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
    this.cachedLiveQuotas.delete(safeName);
    return { id: safeName, filename: safeName };
  }

  deleteCredential(filename) {
    const fullPath = path.join(this.credentialsDir, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      this.cachedLiveQuotas.delete(filename);
      return true;
    }
    return false;
  }
}
