// QuotaFlow Frontend Application
let state = {
  // Views
  activeView: 'quota-view',

  // Projects
  projects: [],
  filteredProjects: [],
  projectSearchQuery: '',
  activeProjectFilter: 'all',

  // Tokens & Resets
  tokens: null,
  cortex: null,
  config: null,
  dailyResetSeconds: 0,
  minuteWindowSeconds: 0,

  // Quota & Multi-account credentials
  credentials: [],
  filteredCredentials: [],
  activeProviderFilter: 'all',
  credSearchQuery: '',
  timelineScope: 'weekly',
  timelineOffsetDays: 0,
  showAllProviders: false,
};

// Desktop Protocol Launcher & Notifications
function showToast(message, duration = 3000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function launchDesktopProtocol(protocol, rawPath, appName = 'IDE') {
  if (!rawPath) return;
  // Normalize Windows backslashes to forward slashes for URI scheme
  const cleanPath = rawPath.replace(/\\/g, '/');
  const uri = `${protocol}://file/${cleanPath}`;

  showToast(`🚀 Abriendo ${cleanPath.split('/').pop()} en ${appName}...`);

  // Use hidden iframe to trigger OS custom scheme without navigating the current page or closing the tab
  let iframe = document.getElementById('desktop-protocol-launcher');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'desktop-protocol-launcher';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
  }
  iframe.src = uri;
}

// Formatting helpers
function formatExpiry(isoString) {
  if (!isoString) return '--/-- --:--';
  try {
    const d = new Date(isoString);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  } catch {
    return '--/-- --:--';
  }
}

// Formatting helpers
function formatNumber(num) {
  if (num === undefined || num === null) return '--';
  return new Intl.NumberFormat().format(num);
}

function formatSeconds(totalSeconds) {
  if (totalSeconds <= 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

// ================= API CALLS =================

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.success) {
      state.config = data.config;
      if (data.summary.resets) {
        state.dailyResetSeconds = data.summary.resets.dailyQuotaResetSeconds;
        state.minuteWindowSeconds = data.summary.resets.minuteWindowSeconds;
      }
      document.getElementById('header-projects-count').textContent = data.summary.totalProjects || 0;

      // Cortex Pill
      const cortexEl = document.getElementById('status-cortex');
      if (data.summary.cortexConnected) {
        cortexEl.classList.add('status-online');
        cortexEl.innerHTML = '<span class="status-dot"></span> Cortex Sincronizado';
      } else {
        cortexEl.classList.remove('status-online');
        cortexEl.innerHTML = '<span class="status-dot" style="background:#f59e0b;box-shadow:none;"></span> Cortex Local';
      }
    }
  } catch (err) {
    console.error('Failed to load status', err);
  }
}

const KNOWN_PROVIDERS = [
  { id: 'all', label: 'All', icon: '🔀' },
  { id: 'antigravity', label: 'Antigravity', icon: '🅰️' },
  { id: 'claude', label: 'Claude', icon: '✳️' },
  { id: 'codex', label: 'Codex', icon: '💬' },
  { id: 'xai', label: 'xAI', icon: '⭕' },
  { id: 'kimi', label: 'Kimi', icon: '🅺' },
  { id: 'devin', label: 'Devin', icon: '❄️' },
  { id: 'muse', label: 'Muse (Meta)', icon: '♾️' },
  { id: 'plugin', label: 'Plugin', icon: '🔌' },
];

function renderProviderChips(counts = {}) {
  const container = document.getElementById('provider-chips');
  if (!container) return;
  container.innerHTML = '';

  const activeProviders = KNOWN_PROVIDERS.filter((p) => {
    if (state.showAllProviders) return true;
    if (p.id === 'all' || p.id === 'antigravity') return true;
    const c = counts[p.id] || 0;
    return c > 0;
  });

  activeProviders.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = `chip-filter ${state.activeProviderFilter === p.id ? 'active' : ''}`;
    btn.setAttribute('data-provider', p.id);
    const countVal = p.id === 'all' ? (counts.all || 0) : (counts[p.id] || 0);
    btn.innerHTML = `<span class="chip-icon">${p.icon}</span> ${p.label} <span class="chip-count" id="chip-${p.id}">${countVal}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.activeProviderFilter = p.id;
      applyCredFilters();
    });
    container.appendChild(btn);
  });

  // Toggle button for other providers
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn-toggle-providers';
  toggleBtn.innerHTML = state.showAllProviders
    ? '<span>− Menos</span>'
    : '<span>+ Otros proveedores</span>';
  toggleBtn.addEventListener('click', () => {
    state.showAllProviders = !state.showAllProviders;
    renderProviderChips(counts);
  });
  container.appendChild(toggleBtn);
}

async function loadCredentials() {
  try {
    const res = await fetch('/api/credentials');
    const data = await res.json();
    if (data.success) {
      state.credentials = data.credentials || [];
      // Update totals
      const totalEl = document.getElementById('cred-count-total');
      const loadedEl = document.getElementById('cred-count-loaded');
      if (totalEl) totalEl.textContent = data.counts.all || 0;
      if (loadedEl) loadedEl.textContent = data.counts.all || 0;

      // Render dynamic provider chips
      renderProviderChips(data.counts || {});

      applyCredFilters();
      renderTimeline();
    }
  } catch (err) {
    console.error('Failed to load credentials', err);
  }
}

async function loadTokens() {
  try {
    const res = await fetch('/api/tokens');
    const data = await res.json();
    if (data.success) {
      state.tokens = data;
      document.getElementById('val-tokens-today').textContent = formatNumber(data.todayInputTokens + data.todayOutputTokens);
      document.getElementById('val-input-today').textContent = formatNumber(data.todayInputTokens);
      document.getElementById('val-output-today').textContent = formatNumber(data.todayOutputTokens);
      document.getElementById('val-cache-today').textContent = formatNumber(data.todayCacheReadTokens);
    }
  } catch (err) {
    console.error('Failed to load tokens', err);
  }
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    if (data.success) {
      state.projects = data.projects || [];
      applyProjectFilters();
    }
  } catch (err) {
    console.error('Failed to load projects', err);
  }
}

// ================= RENDER CREDENTIAL CARDS (Image 1) =================

function renderCredentials(list) {
  const container = document.getElementById('credentials-grid');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="loading-state">No credentials found matching the criteria. Click "Conectar Cuenta" to import a credential.</div>';
    return;
  }

  list.forEach((cred) => {
    const card = document.createElement('div');
    card.className = 'cred-card';

    // Provider icon styling
    let providerIcon = '🅰️';
    if (cred.provider === 'claude') providerIcon = '✳️';
    if (cred.provider === 'codex') providerIcon = '💬';

    // Build Model groups html in strict order: Gemini -> Claude/GPT -> Gemini 4 Argon
    let modelsHtml = '';
    const groupOrder = ['gemini', 'claudeGpt', 'geminiArgon'];

    for (const key of groupOrder) {
      const grp = cred.models?.[key];
      if (!grp) continue;
      let rowsHtml = '';

      if (grp.fiveHour) {
        const pct = grp.fiveHour.remainingPercent;
        const colorClass = pct < 20 ? 'critical' : pct < 80 ? 'warning' : 'ok';
        const labelText = grp.fiveHour.fraction === 1.0 ? 'Quota available' : `${pct}% remaining`;
        rowsHtml += `
          <div class="quota-row">
            <div class="quota-row-header">
              <span class="quota-label">5-hour limit: <span class="quota-pct-badge ${colorClass}">${pct}%</span> <strong class="quota-status-text">${labelText}</strong></span>
              <span class="quota-refresh">${grp.fiveHour.refreshText}</span>
            </div>
            <div class="quota-progress-track">
              <div class="quota-progress-bar ${colorClass}" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }

      if (grp.weekly) {
        const pct = grp.weekly.remainingPercent;
        const colorClass = pct < 20 ? 'critical' : pct < 80 ? 'warning' : 'ok';
        const labelText = grp.weekly.fraction === 1.0 ? 'Quota available' : `${pct}% remaining`;
        rowsHtml += `
          <div class="quota-row">
            <div class="quota-row-header">
              <span class="quota-label">Weekly limit: <span class="quota-pct-badge ${colorClass}">${pct}%</span> <strong class="quota-status-text">${labelText}</strong></span>
              <span class="quota-refresh">${grp.weekly.refreshText}</span>
            </div>
            <div class="quota-progress-track">
              <div class="quota-progress-bar ${colorClass}" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }

      modelsHtml += `
        <div class="cred-models-group">
          <div class="models-group-title">${grp.title} <span class="info-badge">ⓘ</span></div>
          ${rowsHtml}
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        <div class="cred-card-header">
          <div class="cred-name-box">
            <span class="cred-provider-icon">${providerIcon}</span>
            <span class="cred-filename" title="${cred.filename}">${cred.filename}</span>
          </div>
        </div>

        <div class="cred-plan-badge" style="margin-top: 0.35rem;">
          Plan <strong>${cred.plan || 'Pro'}</strong>
        </div>

        <div style="margin-top: 0.65rem;">
          ${modelsHtml}
        </div>
      </div>

      <div>
        <button class="btn-card-refresh" data-id="${cred.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          Refresh quota
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach refresh button handlers
  document.querySelectorAll('.btn-card-refresh').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const origText = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML = 'Refreshing...';
      try {
        await fetch(`/api/credentials/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
        await loadCredentials();
      } catch (err) {
        alert('Error refreshing quota: ' + err.message);
      } finally {
        e.currentTarget.innerHTML = origText;
      }
    });
  });
}

// ================= RENDER TIMELINE GANTT (Image 2) =================

function getTimelineDays(offsetDays = 0) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const baseDay0 = todayStart + (offsetDays - 6) * 86400000;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [];

  for (let i = 0; i < 14; i++) {
    const t = baseDay0 + i * 86400000;
    const d = new Date(t);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push({
      index: i,
      label: dayNames[d.getDay()],
      date: `${mm}/${dd}`,
      timestamp: t,
      isToday: t === todayStart,
    });
  }
  return days;
}

function renderTimeline() {
  const container = document.getElementById('timeline-table');
  if (!container) return;
  container.innerHTML = '';

  const days = getTimelineDays(state.timelineOffsetDays);
  const firstDay = days[0].date;
  const lastDay = days[13].date;
  let offsetLabel = 'current';
  if (state.timelineOffsetDays > 0) offsetLabel = `+${Math.round(state.timelineOffsetDays / 7)}w future`;
  if (state.timelineOffsetDays < 0) offsetLabel = `${Math.round(state.timelineOffsetDays / 7)}w past`;

  const rangeEl = document.getElementById('timeline-date-range');
  if (rangeEl) {
    rangeEl.textContent = `${firstDay} – ${lastDay} • two weeks • ${offsetLabel}`;
  }

  // Update scope buttons state
  document.querySelectorAll('.btn-scope').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-scope') === state.timelineScope);
  });

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'timeline-row-header';

  let headerColsHtml = `
    <div class="timeline-col-cred">
      <div class="cred-col-title">CREDENTIAL & GROUP</div>
      <div class="cred-col-sub">${state.timelineScope.toUpperCase()}</div>
    </div>
  `;

  days.forEach((d) => {
    headerColsHtml += `
      <div class="timeline-col-date ${d.isToday ? 'is-today-col' : ''}">
        <span class="timeline-day-label">${d.label}</span>
        <span class="timeline-date-label">${d.date}</span>
        ${d.isToday ? '<span class="today-marker-pill">Today</span>' : ''}
      </div>
    `;
  });
  headerRow.innerHTML = headerColsHtml;
  container.appendChild(headerRow);

  const windowStart = days[0].timestamp;
  const windowEnd = days[13].timestamp + 86400000;
  const totalMs = windowEnd - windowStart;

  // Rows for credentials
  state.credentials.forEach((cred) => {
    (cred.quotaWindows || []).forEach((qw) => {
      const dataRow = document.createElement('div');
      dataRow.className = 'timeline-row-data';

      // Clean email without ugly prefixes
      let cleanEmail = cred.email || cred.filename.replace(/^antigravity-/, '').replace(/\.json$/, '');
      if (cleanEmail.length > 20) cleanEmail = cleanEmail.slice(0, 18) + '...';

      const fiveHourPct = qw.fiveHourRemaining ?? 100;
      const weeklyPct = qw.weeklyRemaining ?? 100;

      const fiveHourClass = fiveHourPct < 20 ? 'critical' : fiveHourPct < 80 ? 'warning' : 'ok';
      const weeklyClass = weeklyPct < 20 ? 'critical' : weeklyPct < 80 ? 'warning' : 'ok';

      // Active view metrics
      const activePct = state.timelineScope === 'weekly' ? weeklyPct : fiveHourPct;
      const colorClass = activePct < 20 ? 'critical' : activePct < 80 ? 'warning' : 'ok';

      // Target reset time
      const targetReset = state.timelineScope === 'weekly'
        ? (qw.weeklyResetTime || qw.resetTime)
        : (qw.fiveHourResetTime || qw.resetTime);

      let leftPct = 25;
      let widthPct = 70;

      if (targetReset) {
        const resetMs = new Date(targetReset).getTime();
        const cycleDuration = state.timelineScope === 'weekly' ? (7 * 86400000) : (5 * 3600000);
        const startMs = resetMs - cycleDuration;

        leftPct = Math.max(0, Math.min(92, ((startMs - windowStart) / totalMs) * 100));
        const rightPct = Math.max(8, Math.min(100, ((resetMs - windowStart) / totalMs) * 100));
        widthPct = Math.max(12, rightPct - leftPct);
      }

      const expiryText = qw.expiry || (targetReset ? formatExpiry(targetReset) : '11/28 12:11');

      const labelCell = `
        <div class="timeline-cred-label">
          <div class="cred-label-row">
            <span class="status-dot-pulse online"></span>
            <span class="cred-account-name" title="${cred.email}">${cleanEmail}</span>
            <span class="badge-scope">${state.timelineScope === 'weekly' ? '7d' : '5h'}</span>
          </div>
          <div class="cred-modelgroup-name">${qw.modelGroup}</div>
          <div class="cred-limit-badges">
            <span class="mini-limit-badge ${fiveHourClass}">5h: <strong>${fiveHourPct}%</strong></span>
            <span class="mini-limit-badge ${weeklyClass}">W: <strong>${weeklyPct}%</strong></span>
          </div>
        </div>
      `;

      const gridOverlay = `
        <div class="timeline-grid-overlay">
          ${days.map(d => `<div class="grid-cell-line ${d.isToday ? 'is-today-cell' : ''}"></div>`).join('')}
        </div>
      `;

      const trackCell = `
        <div class="timeline-track-cell">
          ${gridOverlay}
          <div class="timeline-span-bar ${colorClass}" style="left: ${leftPct.toFixed(1)}%; width: ${widthPct.toFixed(1)}%;">
            <div class="bar-fill-gauge" style="width: ${activePct}%;"></div>
            <div class="bar-inner-content">
              <span class="bar-pct-badge">${activePct}%</span>
              <span class="bar-separator">&bull;</span>
              <span class="bar-expiry-text">${expiryText}</span>
            </div>
          </div>
        </div>
      `;

      dataRow.innerHTML = labelCell + trackCell;
      container.appendChild(dataRow);
    });
  });
}

// ================= CREDENTIAL FILTERING =================

function applyCredFilters() {
  let list = state.credentials;

  // Search filter
  if (state.credSearchQuery) {
    const q = state.credSearchQuery.toLowerCase();
    list = list.filter((c) => c.filename.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }

  // Provider chip filter
  if (state.activeProviderFilter !== 'all') {
    list = list.filter((c) => c.provider.toLowerCase() === state.activeProviderFilter.toLowerCase());
  }

  renderCredentials(list);
}

// ================= PROJECT FILTERING (Retained) =================

function applyProjectFilters() {
  let list = state.projects;

  if (state.projectSearchQuery) {
    const q = state.projectSearchQuery.toLowerCase();
    list = list.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      const matchStack = (p.stack || []).some((s) => s.toLowerCase().includes(q));
      return matchName || matchDesc || matchStack;
    });
  }

  if (state.activeProjectFilter === 'active') {
    list = list.filter((p) => p.activityStatus === 'active');
  } else if (state.activeProjectFilter === 'recent') {
    list = list.filter((p) => p.activityStatus === 'recent' || p.activityStatus === 'active');
  } else if (state.activeProjectFilter === 'cortex') {
    list = list.filter((p) => p.cortex?.linked);
  }

  document.getElementById('count-all').textContent = state.projects.length;
  document.getElementById('count-active').textContent = state.projects.filter((p) => p.activityStatus === 'active').length;
  document.getElementById('count-recent').textContent = state.projects.filter((p) => p.activityStatus === 'recent' || p.activityStatus === 'active').length;
  document.getElementById('count-cortex').textContent = state.projects.filter((p) => p.cortex?.linked).length;

  renderProjects(list);
}

function renderProjects(projects) {
  const container = document.getElementById('project-grid');
  container.innerHTML = '';

  if (projects.length === 0) {
    container.innerHTML = '<div class="loading-state">No se encontraron proyectos con los filtros seleccionados.</div>';
    return;
  }

  projects.forEach((proj) => {
    const card = document.createElement('div');
    card.className = 'project-card';

    let activityClass = 'activity-idle';
    let activityText = 'Pausado';
    if (proj.activityStatus === 'active') {
      activityClass = 'activity-active';
      activityText = 'Activo (<7d)';
    } else if (proj.activityStatus === 'recent') {
      activityClass = 'activity-recent';
      activityText = 'Reciente (<30d)';
    }

    const stackHtml = (proj.stack || []).map((s) => `<span class="tag-stack">${s}</span>`).join('');
    const gitBranch = proj.git?.branch ? `<span class="git-branch">⎇ ${proj.git.branch}</span>` : '';
    const gitCommit = proj.git?.lastCommit ? `<span>${proj.git.lastCommit.relativeDate} · "${proj.git.lastCommit.message}"</span>` : '<span>Sin repositorio Git</span>';
    const cortexBadge = proj.cortex?.linked ? `<span class="tag-cortex">🧠 Cortex (${proj.cortex.memoriesCount} mem)</span>` : '';

    const hostPath = proj.hostPath || proj.path;
    card.innerHTML = `
      <div>
        <div class="project-header">
          <div class="project-title">${proj.name}</div>
          <div class="project-activity ${activityClass}"><span class="status-dot"></span> ${activityText}</div>
        </div>
        <p class="project-description" style="margin-top: 0.65rem;">${proj.description}</p>
      </div>

      <div>
        <div class="project-stack" style="margin-bottom: 0.75rem;">
          ${stackHtml}
          ${cortexBadge}
        </div>
        <div class="project-git">
          ${gitBranch}
          ${gitCommit}
        </div>
        <div class="project-actions" style="margin-top:0.75rem;">
          <button type="button" class="btn-card-action btn-inspect-proj" data-name="${proj.name}">🔍 Explorar</button>
          <button type="button" class="btn-card-action btn-launch-ide" data-protocol="antigravity-ide" data-path="${hostPath}" data-app="Antigravity IDE" title="Abrir en Antigravity IDE (nueva ventana)">🅰️ Antigravity IDE</button>
          <button type="button" class="btn-card-action btn-launch-ide" data-protocol="vscode" data-path="${hostPath}" data-app="VS Code" title="Abrir en VS Code (nueva ventana)">💬 VS Code</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach project inspector listeners
  document.querySelectorAll('.btn-inspect-proj').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = e.currentTarget.getAttribute('data-name');
      openProjectInspector(name);
    });
  });

  // Attach IDE launcher listeners
  document.querySelectorAll('.btn-launch-ide').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const proto = btn.getAttribute('data-protocol');
      const p = btn.getAttribute('data-path');
      const app = btn.getAttribute('data-app') || 'IDE';
      launchDesktopProtocol(proto, p, app);
    });
  });
}

// ================= PROJECT INSPECTOR & CODE EXPLORER =================

const modalInspector = document.getElementById('modal-project-inspector');
const inspectorClose = document.getElementById('modal-inspector-close');
if (inspectorClose) {
  inspectorClose.addEventListener('click', () => modalInspector.classList.remove('active'));
}

// Inspector Tabs
document.querySelectorAll('.inspector-tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.inspector-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.inspector-tab-panel').forEach((p) => p.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const target = e.currentTarget.getAttribute('data-tab');
    const panel = document.getElementById(target);
    if (panel) panel.classList.add('active');
  });
});

async function openProjectInspector(name) {
  modalInspector.classList.add('active');
  document.getElementById('inspector-title').textContent = name;
  document.getElementById('inspector-host-path').textContent = 'Cargando detalles...';
  document.getElementById('inspector-readme-content').textContent = 'Cargando documentación...';
  document.getElementById('inspector-file-tree').innerHTML = '<div style="color:var(--text-muted);padding:1rem;">Cargando archivos...</div>';
  document.getElementById('file-viewer-filename').textContent = 'Selecciona un archivo para previsualizar';
  document.getElementById('file-viewer-code').textContent = '// Código fuente';
  document.getElementById('inspector-git-list').innerHTML = '<div style="color:var(--text-muted);padding:1rem;">Cargando commits...</div>';

  try {
    const res = await fetch(`/api/projects/details?name=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (!data.success || !data.project) {
      document.getElementById('inspector-readme-content').textContent = 'No se pudo cargar la información del proyecto.';
      return;
    }

    const p = data.project;
    const hostPath = p.hostPath || p.path;
    document.getElementById('inspector-host-path').textContent = hostPath;

    // Set IDE Launchers
    const agBtn = document.getElementById('btn-inspector-antigravity');
    const vsBtn = document.getElementById('btn-inspector-vscode');
    const copyBtn = document.getElementById('btn-inspector-copy-path');

    if (agBtn) {
      agBtn.onclick = (e) => {
        e.preventDefault();
        launchDesktopProtocol('antigravity-ide', hostPath, 'Antigravity IDE');
      };
    }
    if (vsBtn) {
      vsBtn.onclick = (e) => {
        e.preventDefault();
        launchDesktopProtocol('vscode', hostPath, 'VS Code');
      };
    }
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(hostPath);
        copyBtn.textContent = '✓ ¡Copiado!';
        showToast('📋 Ruta copiada al portapapeles');
        setTimeout(() => (copyBtn.textContent = '📋 Copiar Ruta'), 2000);
      };
    }

    // 1. README
    const readmeEl = document.getElementById('inspector-readme-content');
    if (p.readme && p.readme.trim()) {
      readmeEl.textContent = p.readme;
    } else {
      readmeEl.textContent = `No se encontró archivo README.md o GEMINI.md en este proyecto.\n\nRuta: ${hostPath}\nTecnologías detectadas: ${(p.stack || []).join(', ') || 'General'}`;
    }

    // 2. File Tree
    const treeEl = document.getElementById('inspector-file-tree');
    treeEl.innerHTML = '';
    if (p.fileTree && p.fileTree.length > 0) {
      treeEl.appendChild(renderFileTreeNodes(p.fileTree, name));
    } else {
      treeEl.innerHTML = '<div style="color:var(--text-muted);padding:0.5rem;">Directorio vacío o inaccesible.</div>';
    }

    // 3. Git History
    const gitListEl = document.getElementById('inspector-git-list');
    gitListEl.innerHTML = '';
    if (p.commits && p.commits.length > 0) {
      p.commits.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'git-commit-card';
        item.innerHTML = `
          <div>
            <div class="git-commit-msg">${c.message}</div>
            <div class="git-commit-meta">${c.author} &bull; ${c.relativeDate}</div>
          </div>
          <div class="git-commit-hash">${c.hash}</div>
        `;
        gitListEl.appendChild(item);
      });
    } else {
      gitListEl.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">Sin historial de Git registrado.</div>';
    }

    // 4. Cortex Memory
    const cortexNotesEl = document.getElementById('inspector-cortex-notes');
    const projMatch = state.projects.find((pr) => pr.name === name);
    if (projMatch?.cortex?.linked) {
      cortexNotesEl.innerHTML = `
        <div style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:8px;padding:1rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
            <span style="font-size:1.25rem;">🧠</span>
            <strong style="color:var(--text-primary);">${projMatch.cortex.slug}</strong>
            <span style="font-size:0.75rem;background:rgba(168,85,247,0.15);color:#c084fc;padding:0.15rem 0.45rem;border-radius:4px;">
              ${projMatch.cortex.memoriesCount} memorias sincronizadas
            </span>
          </div>
          <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">${projMatch.cortex.cortexDescription || 'Proyecto vinculado a Cortex Memory MCP.'}</p>
        </div>
      `;
    } else {
      cortexNotesEl.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">Este proyecto aún no tiene memorias vinculadas en Cortex MCP.</div>';
    }
  } catch (err) {
    document.getElementById('inspector-readme-content').textContent = 'Error cargando detalles: ' + err.message;
  }
}

function renderFileTreeNodes(nodes, projectName, basePath = '') {
  const frag = document.createDocumentFragment();
  nodes.forEach((node) => {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    const relPath = basePath ? `${basePath}/${node.name}` : node.name;

    if (node.type === 'directory') {
      const title = document.createElement('div');
      title.className = 'tree-folder-title';
      title.innerHTML = `📁 ${node.name}`;
      nodeEl.appendChild(title);

      if (node.children && node.children.length > 0) {
        const childrenBox = document.createElement('div');
        childrenBox.className = 'tree-children';
        childrenBox.appendChild(renderFileTreeNodes(node.children, projectName, relPath));
        nodeEl.appendChild(childrenBox);
      }
    } else {
      const fileItem = document.createElement('div');
      fileItem.className = 'tree-file-item';
      let icon = '📄';
      if (node.name.endsWith('.json')) icon = '⚙️';
      if (node.name.endsWith('.js') || node.name.endsWith('.mjs') || node.name.endsWith('.ts')) icon = '⚡';
      if (node.name.endsWith('.py')) icon = '🐍';
      if (node.name.endsWith('.md')) icon = '📝';
      if (node.name.endsWith('.html')) icon = '🌐';
      if (node.name.endsWith('.css')) icon = '🎨';

      fileItem.innerHTML = `<span>${icon}</span> <span>${node.name}</span>`;
      fileItem.addEventListener('click', () => {
        document.querySelectorAll('.tree-file-item').forEach((f) => f.classList.remove('active'));
        fileItem.classList.add('active');
        previewFile(projectName, relPath);
      });
      nodeEl.appendChild(fileItem);
    }
    frag.appendChild(nodeEl);
  });
  return frag;
}

async function previewFile(projectName, filePath) {
  const header = document.getElementById('file-viewer-filename');
  const code = document.getElementById('file-viewer-code');
  header.textContent = `Cargando ${filePath}...`;
  code.textContent = '// Cargando...';

  try {
    const res = await fetch(`/api/projects/file?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    if (!data.success) {
      header.textContent = filePath;
      code.textContent = `// Error: ${data.error}`;
      return;
    }
    header.textContent = `${filePath} (${formatNumber(data.size)} bytes)`;
    code.textContent = data.content;
  } catch (err) {
    header.textContent = filePath;
    code.textContent = `// Error: ${err.message}`;
  }
}

// ================= TIMERS ENGINE =================

setInterval(() => {
  if (state.dailyResetSeconds > 0) {
    state.dailyResetSeconds -= 1;
    const el = document.getElementById('timer-daily-reset');
    if (el) el.textContent = formatSeconds(state.dailyResetSeconds);
  }

  if (state.minuteWindowSeconds > 0) {
    state.minuteWindowSeconds -= 1;
  } else {
    state.minuteWindowSeconds = 59;
  }
  const elMin = document.getElementById('timer-minute-window');
  if (elMin) elMin.textContent = `${state.minuteWindowSeconds}s`;
}, 1000);

// ================= EVENT LISTENERS =================

// Top Navigation Tabs Switcher
document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach((p) => p.classList.remove('active'));

    const target = e.currentTarget;
    target.classList.add('active');
    const viewId = target.getAttribute('data-view');
    document.getElementById(viewId).classList.add('active');
  });
});

// Credential Search
document.getElementById('input-search-creds').addEventListener('input', (e) => {
  state.credSearchQuery = e.target.value.trim();
  applyCredFilters();
});

// Provider Chips
document.querySelectorAll('.chip-filter').forEach((chip) => {
  chip.addEventListener('click', (e) => {
    document.querySelectorAll('.chip-filter').forEach((c) => c.classList.remove('active'));
    const target = e.currentTarget;
    target.classList.add('active');
    state.activeProviderFilter = target.getAttribute('data-provider');
    applyCredFilters();
  });
});

// Refresh All Credentials
document.getElementById('btn-refresh-all-creds').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-all-creds');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Refreshing...';
  try {
    await fetch('/api/credentials/refresh-all', { method: 'POST' });
    await loadCredentials();
  } catch (err) {
    alert('Failed to refresh credentials: ' + err.message);
  } finally {
    btn.innerHTML = orig;
  }
});

// Global Refresh
document.getElementById('btn-refresh').addEventListener('click', async () => {
  await Promise.all([loadStatus(), loadCredentials(), loadTokens(), loadProjects()]);
});

// Projects Search & Filter
document.getElementById('project-search').addEventListener('input', (e) => {
  state.projectSearchQuery = e.target.value.trim();
  applyProjectFilters();
});

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    const target = e.currentTarget;
    target.classList.add('active');
    state.activeProjectFilter = target.getAttribute('data-filter');
    applyProjectFilters();
  });
});

// Modal: Conectar / Importar Credencial
const modalAddCred = document.getElementById('modal-add-cred');
document.getElementById('btn-add-credential').addEventListener('click', () => {
  modalAddCred.classList.add('active');
});

document.getElementById('modal-cred-close').addEventListener('click', () => {
  modalAddCred.classList.remove('active');
});

document.getElementById('btn-cancel-cred').addEventListener('click', () => {
  modalAddCred.classList.remove('active');
});

// File upload reader
let uploadedJson = null;
document.getElementById('cred-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      uploadedJson = JSON.parse(event.target.result);
      document.getElementById('cred-json-content').value = JSON.stringify(uploadedJson, null, 2);
    } catch {
      alert('El archivo no es un JSON válido');
    }
  };
  reader.readAsText(file);
});

document.getElementById('btn-save-cred').addEventListener('click', async () => {
  const provider = document.getElementById('cred-provider').value;
  const email = document.getElementById('cred-email').value.trim();
  const rawText = document.getElementById('cred-json-content').value.trim();

  let data = uploadedJson || {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      alert('El contenido JSON ingresado no es válido');
      return;
    }
  }

  data.provider = provider;
  if (email) data.email = email;

  try {
    const res = await fetch('/api/credentials/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || data.email || 'cuenta',
        filename: `${provider}-${email || 'account'}.json`,
        data,
      }),
    });
    const result = await res.json();
    if (result.success) {
      modalAddCred.classList.remove('active');
      await loadCredentials();
    }
  } catch (err) {
    alert('Error al guardar credencial: ' + err.message);
  }
});

// Settings Modal
const modalSettings = document.getElementById('modal-settings');
document.getElementById('btn-open-settings').addEventListener('click', () => {
  if (state.config) {
    document.getElementById('input-project-dirs').value = (state.config.projectDirs || []).join(', ');
    document.getElementById('input-antigravity-dir').value = state.config.antigravityDir || '';
  }
  modalSettings.classList.add('active');
});

document.getElementById('modal-close').addEventListener('click', () => modalSettings.classList.remove('active'));
document.getElementById('btn-cancel-settings').addEventListener('click', () => modalSettings.classList.remove('active'));

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const rawDirs = document.getElementById('input-project-dirs').value;
  const antigravityDir = document.getElementById('input-antigravity-dir').value.trim();
  const cortexKey = document.getElementById('input-cortex-key').value.trim();

  const payload = { projectsDir: rawDirs, antigravityDataDir: antigravityDir };
  if (cortexKey) payload.cortexApiKey = cortexKey;

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    modalSettings.classList.remove('active');
    await Promise.all([loadStatus(), loadCredentials(), loadTokens(), loadProjects()]);
  } catch (err) {
    alert('Error al guardar configuración: ' + err.message);
  }
});

// Timeline Gantt Controls
const btnTimelinePrev = document.getElementById('btn-timeline-prev');
const btnTimelineToday = document.getElementById('btn-timeline-today');
const btnTimelineNext = document.getElementById('btn-timeline-next');

if (btnTimelinePrev) {
  btnTimelinePrev.addEventListener('click', () => {
    state.timelineOffsetDays -= 7;
    renderTimeline();
  });
}

if (btnTimelineToday) {
  btnTimelineToday.addEventListener('click', () => {
    state.timelineOffsetDays = 0;
    renderTimeline();
  });
}

if (btnTimelineNext) {
  btnTimelineNext.addEventListener('click', () => {
    state.timelineOffsetDays += 7;
    renderTimeline();
  });
}

document.querySelectorAll('.btn-scope').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    state.timelineScope = e.currentTarget.getAttribute('data-scope');
    renderTimeline();
  });
});

// Boot
(async function init() {
  await Promise.all([loadStatus(), loadCredentials(), loadTokens(), loadProjects()]);
})();
