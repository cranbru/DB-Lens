const state = {
  db: null,
  SQL: null,
  dbFileName: '',
  dbFileSize: 0,
  currentDbId: null,
  currentDbMeta: null,
  savedDatabases: [],
  storageReady: false,
  storageUsage: null,
  profile: null,
  tables: [],
  tableInfo: {},     
  fkMap: {},         
  currentView: 'upload',
  currentTable: null,
  tableData: null,
  tableColumns: [],
  sortCol: null,
  sortDir: 'asc',
  filterText: '',
  page: 1,
  pageSize: 50,
  selectedRow: null,
  totalRows: 0,
  chartInstance: null,
  graphSim: null,
  graphSvgNode: null,
  tableExactFilter: null,
  queryHistory: [],
  compare: { left: null, right: null },
  navHistory: [],
};

const CLIENT_DB = {
  name: 'db-lens-client-store',
  version: 1,
  metaStore: 'databaseMeta',
  fileStore: 'databaseFiles'
};
const STORAGE_KEYS = {
  profile: 'dbLens.profile.v1',
  currentDbId: 'dbLens.currentDbId.v1'
};
let clientStore = null;

const DEFAULT_AVATARS = [
  { id: 'amber-db', label: 'Amber DB', icon: 'fa-database', color: '#FCD34D', background: 'linear-gradient(135deg,rgba(232,168,56,.42),rgba(20,184,166,.18))' },
  { id: 'teal-graph', label: 'Teal Graph', icon: 'fa-diagram-project', color: '#5EEAD4', background: 'linear-gradient(135deg,rgba(20,184,166,.42),rgba(6,182,212,.18))' },
  { id: 'rose-query', label: 'Rose Query', icon: 'fa-terminal', color: '#FDA4AF', background: 'linear-gradient(135deg,rgba(244,63,94,.36),rgba(232,168,56,.16))' },
  { id: 'green-table', label: 'Green Table', icon: 'fa-table-cells-large', color: '#86EFAC', background: 'linear-gradient(135deg,rgba(34,197,94,.36),rgba(6,182,212,.16))' },
  { id: 'blue-chart', label: 'Blue Chart', icon: 'fa-chart-simple', color: '#7DD3FC', background: 'linear-gradient(135deg,rgba(14,165,233,.38),rgba(232,168,56,.14))' },
  { id: 'pink-spark', label: 'Pink Spark', icon: 'fa-bolt', color: '#F9A8D4', background: 'linear-gradient(135deg,rgba(236,72,153,.34),rgba(20,184,166,.16))' }
];


const NODE_COLORS = [
  '#E8A838','#10B981','#EF4444','#06B6D4','#F97316',
  '#84CC16','#EC4899','#14B8A6','#F59E0B','#22D3EE',
  '#FB7185','#A3E635','#D97706','#0D9488','#0284C7','#DC2626'
];
const tableColorMap = {};
let colorIdx = 0;
function getTableColor(t) {
  if (!tableColorMap[t]) { tableColorMap[t] = NODE_COLORS[colorIdx % NODE_COLORS.length]; colorIdx++; }
  return tableColorMap[t];
}




function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 3000);
}

function animateCounter(el, target, dur = 800) {
  if (target === 0) { el.textContent = '0'; return; }
  let start = 0;
  const inc = target / (dur / 16);
  const timer = setInterval(() => {
    start += inc;
    if (start >= target) { el.textContent = target.toLocaleString(); clearInterval(timer); }
    else el.textContent = Math.floor(start).toLocaleString();
  }, 16);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '<span class="text-muted/40 italic">NULL</span>';
  const str = String(s);
  if (str.length > 200) return escapeHtml(str.slice(0, 200)) + '<span class="text-muted/40">...</span>';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isJsonString(s) {
  if (typeof s !== 'string') return false;
  try { JSON.parse(s); return true; } catch { return false; }
}

function formatDate(iso) {
  if (!iso) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function getInitials(name) {
  return (name || 'Local Analyst').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'LA';
}

function selectedDefaultAvatar() {
  return DEFAULT_AVATARS.find(a => a.id === state.profile?.avatarId) || DEFAULT_AVATARS[0];
}

function defaultAvatarStyle(avatar = selectedDefaultAvatar()) {
  return `background:${avatar.background};color:${avatar.color}`;
}

function defaultAvatarInnerHTML() {
  const avatar = selectedDefaultAvatar();
  return `<i class="fa-solid ${avatar.icon}" aria-hidden="true"></i>`;
}

function avatarHTML(sizeClass = '') {
  const avatar = state.profile?.avatarDataUrl;
  return avatar ? `<span class="avatar ${sizeClass}"><img src="${avatar}" alt=""></span>` : `<span class="avatar ${sizeClass}" style="${defaultAvatarStyle()}">${defaultAvatarInnerHTML()}</span>`;
}

function stableId() {
  if (crypto.randomUUID) return `db_${crypto.randomUUID()}`;
  return `db_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function checksumBuffer(buffer) {
  if (!crypto.subtle) return '';
  const hash = await crypto.subtle.digest('SHA-256', buffer.slice(0));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildSchemaPreview(tableInfo) {
  return Object.entries(tableInfo).slice(0, 8).map(([name, info]) => ({
    name,
    rowCount: info.rowCount,
    columns: info.columns.slice(0, 8).map(c => ({ name: c.name, type: c.type || 'ANY', pk: !!c.pk })),
    foreignKeys: info.fks.length
  }));
}

function totalRowsFromInfo(tableInfo) {
  return Object.values(tableInfo || {}).reduce((sum, info) => sum + (info.rowCount || 0), 0);
}

function storageRatio() {
  if (!state.storageUsage?.quota) return 0;
  return Math.min(100, Math.round((state.storageUsage.usage / state.storageUsage.quota) * 100));
}

function updateStorageEstimate() {
  if (!navigator.storage?.estimate) return Promise.resolve();
  return navigator.storage.estimate().then(estimate => {
    state.storageUsage = estimate;
  }).catch(() => {});
}

async function initSQL() {
  try {
    state.SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });
  } catch (e) {
    showToast('Failed to initialize SQL engine. Please reload.', 'error');
    console.error(e);
  }
}

function defaultProfile() {
  return {
    displayName: 'Local Analyst',
    avatarDataUrl: '',
    avatarId: DEFAULT_AVATARS[0].id,
    pinnedTables: [],
    queryHistory: [],
    preferences: {
      reopenLast: true,
      autoSaveUploads: true,
      confirmDelete: true,
      compactRows: false,
      lightTheme: false,
      graphLayout: 'force'
    }
  };
}

function loadProfile() {
  try {
    state.profile = { ...defaultProfile(), ...(JSON.parse(localStorage.getItem(STORAGE_KEYS.profile)) || {}) };
    state.profile.preferences = { ...defaultProfile().preferences, ...(state.profile.preferences || {}) };
    state.profile.pinnedTables = Array.isArray(state.profile.pinnedTables) ? state.profile.pinnedTables : [];
    state.profile.queryHistory = Array.isArray(state.profile.queryHistory) ? state.profile.queryHistory : [];
    if (!DEFAULT_AVATARS.some(a => a.id === state.profile.avatarId)) state.profile.avatarId = DEFAULT_AVATARS[0].id;
    if (!['force','compact','grouped'].includes(state.profile.preferences.graphLayout)) state.profile.preferences.graphLayout = 'force';
    state.queryHistory = state.profile.queryHistory;
  } catch {
    state.profile = defaultProfile();
    state.queryHistory = state.profile.queryHistory;
  }
}

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(state.profile));
    updateProfileChrome();
    renderProfileSetupPrompt();
  } catch (e) {
    showToast('Profile storage is full. Try a smaller avatar image.', 'error');
  }
}

function updateProfileChrome() {
  const name = state.profile?.displayName || 'Local Analyst';
  const selectedAvatar = selectedDefaultAvatar();
  document.getElementById('profile-button-name').textContent = name;
  document.getElementById('profile-menu-name').textContent = name;
  ['profile-button-avatar', 'profile-menu-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.background = state.profile?.avatarDataUrl ? '' : selectedAvatar.background;
    el.style.color = state.profile?.avatarDataUrl ? '' : selectedAvatar.color;
    el.innerHTML = state.profile?.avatarDataUrl ? `<img src="${state.profile.avatarDataUrl}" alt="">` : defaultAvatarInnerHTML();
  });
}

function applyTheme() {
  document.body.classList.toggle('theme-light', !!state.profile?.preferences.lightTheme);
}

function toggleTheme() {
  state.profile.preferences.lightTheme = !state.profile.preferences.lightTheme;
  applyTheme();
  saveProfile();
  if (state.currentView === 'profile') renderProfile();
  if (state.currentView === 'graph') renderGraph();
  showToast(state.profile.preferences.lightTheme ? 'Light theme enabled' : 'Dark theme enabled', 'success');
}

function toggleProfileMenu() {
  document.getElementById('profile-menu').classList.toggle('hidden');
}

function closeProfileMenu() {
  document.getElementById('profile-menu').classList.add('hidden');
}

document.addEventListener('click', e => {
  const menu = document.getElementById('profile-menu');
  const button = document.getElementById('profile-button');
  if (menu && button && !menu.contains(e.target) && !button.contains(e.target)) closeProfileMenu();
  if (!e.target.closest('.custom-dd')) closeAllCustomDropdowns();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllCustomDropdowns();
});

function closeAllCustomDropdowns() {
  document.querySelectorAll('.custom-dd-menu.open').forEach(menu => {
    menu.classList.remove('open');
    const wrap = menu.closest('.custom-dd');
    const trig = wrap?.querySelector('.custom-dd-trigger');
    if (trig) trig.setAttribute('aria-expanded', 'false');
  });
}

function toggleCustomDropdown(trigger) {
  const btn = typeof trigger === 'string' ? document.getElementById(trigger) : trigger;
  if (!btn || btn.disabled) return;
  const wrap = btn.closest('.custom-dd');
  const menu = wrap?.querySelector('.custom-dd-menu');
  if (!menu) return;
  const willOpen = !menu.classList.contains('open');
  closeAllCustomDropdowns();
  if (willOpen) {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function openClientStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CLIENT_DB.name, CLIENT_DB.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIENT_DB.metaStore)) {
        const meta = db.createObjectStore(CLIENT_DB.metaStore, { keyPath: 'id' });
        meta.createIndex('uploadedAt', 'uploadedAt');
        meta.createIndex('lastOpenedAt', 'lastOpenedAt');
      }
      if (!db.objectStoreNames.contains(CLIENT_DB.fileStore)) {
        db.createObjectStore(CLIENT_DB.fileStore, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      clientStore = req.result;
      clientStore.onversionchange = () => clientStore.close();
      state.storageReady = true;
      resolve(clientStore);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage upgrade is blocked by another open DB Lens tab.'));
  });
}

function txStore(storeName, mode = 'readonly') {
  return clientStore.transaction(storeName, mode).objectStore(storeName);
}

function requestAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.'));
  });
}

async function refreshSavedDatabases() {
  if (!state.storageReady) return;
  const all = await requestAsPromise(txStore(CLIENT_DB.metaStore).getAll());
  state.savedDatabases = all.sort((a, b) => new Date(b.lastOpenedAt || b.uploadedAt) - new Date(a.lastOpenedAt || a.uploadedAt));
  await updateStorageEstimate();
  renderUploadSavedDatabases();
  if (state.currentView === 'dashboard') renderDashboard();
  if (state.currentView === 'profile') renderProfile();
}

async function saveDatabaseFile(buffer, details) {
  if (!state.storageReady || !state.profile.preferences.autoSaveUploads) return null;
  const now = new Date().toISOString();
  const id = details.id || stableId();
  const metadata = {
    id,
    filename: details.filename,
    size: details.size,
    uploadedAt: details.uploadedAt || now,
    lastOpenedAt: now,
    tableCount: state.tables.length,
    totalRows: totalRowsFromInfo(state.tableInfo),
    schemaPreview: buildSchemaPreview(state.tableInfo),
    checksum: await checksumBuffer(buffer)
  };

  const tx = clientStore.transaction([CLIENT_DB.metaStore, CLIENT_DB.fileStore], 'readwrite');
  tx.objectStore(CLIENT_DB.metaStore).put(metadata);
  tx.objectStore(CLIENT_DB.fileStore).put({ id, fileData: buffer });
  await transactionComplete(tx);

  state.currentDbId = id;
  state.currentDbMeta = metadata;
  localStorage.setItem(STORAGE_KEYS.currentDbId, id);
  await refreshSavedDatabases();
  return metadata;
}

async function touchSavedDatabase(id) {
  const meta = await requestAsPromise(txStore(CLIENT_DB.metaStore).get(id));
  if (!meta) return null;
  meta.lastOpenedAt = new Date().toISOString();
  await requestAsPromise(txStore(CLIENT_DB.metaStore, 'readwrite').put(meta));
  return meta;
}

async function loadSavedDatabase(id, options = {}) {
  if (!state.storageReady) {
    showToast('Browser database storage is not available.', 'error');
    return;
  }
  document.getElementById('loading-overlay').classList.remove('hidden');
  try {
    const tx = clientStore.transaction([CLIENT_DB.metaStore, CLIENT_DB.fileStore], 'readonly');
    const metaReq = tx.objectStore(CLIENT_DB.metaStore).get(id);
    const fileReq = tx.objectStore(CLIENT_DB.fileStore).get(id);
    const [meta, file] = await Promise.all([requestAsPromise(metaReq), requestAsPromise(fileReq)]);
    if (!meta || !file?.fileData) throw new Error('Saved database record is incomplete.');
    if (meta.checksum) {
      const currentChecksum = await checksumBuffer(file.fileData);
      if (currentChecksum && currentChecksum !== meta.checksum) throw new Error('Saved database checksum does not match.');
    }
    const db = new state.SQL.Database(new Uint8Array(file.fileData));
    const touchedMeta = await touchSavedDatabase(id) || meta;
    await loadDatabase(db, { id, meta: touchedMeta, filename: meta.filename, size: meta.size });
    await refreshSavedDatabases();
    if (!options.silent) showToast(`Reopened ${meta.filename}`, 'success');
  } catch (e) {
    document.getElementById('loading-overlay').classList.add('hidden');
    localStorage.removeItem(STORAGE_KEYS.currentDbId);
    showToast('Could not reopen saved database: ' + e.message, 'error');
    console.error(e);
  }
}

async function deleteSavedDatabase(id) {
  const dbMeta = state.savedDatabases.find(d => d.id === id);
  if (!dbMeta) return;
  if (state.profile.preferences.confirmDelete && !confirm(`Delete "${dbMeta.filename}" from this browser?`)) return;
  const tx = clientStore.transaction([CLIENT_DB.metaStore, CLIENT_DB.fileStore], 'readwrite');
  tx.objectStore(CLIENT_DB.metaStore).delete(id);
  tx.objectStore(CLIENT_DB.fileStore).delete(id);
  await transactionComplete(tx);
  if (state.currentDbId === id) resetCurrentSession();
  await refreshSavedDatabases();
  showToast('Saved database deleted', 'success');
}

function resetCurrentSession() {
  try { state.db?.close?.(); } catch {}
  state.db = null;
  state.dbFileName = '';
  state.dbFileSize = 0;
  state.currentDbId = null;
  state.currentDbMeta = null;
  state.tables = [];
  state.tableInfo = {};
  state.fkMap = {};
  localStorage.removeItem(STORAGE_KEYS.currentDbId);
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('sidebar').style.display = '';
  switchView('upload', false);
}

function setupFileHandlers() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  ['dragenter','dragover'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); });
  });
  dropZone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
}

async function handleFile(file) {
  const validExts = ['.db', '.sqlite', '.sqlite3'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast('Invalid file type. Please upload a SQLite database.', 'error');
    return;
  }
  state.dbFileName = file.name;
  state.dbFileSize = file.size;

  document.getElementById('loading-overlay').classList.remove('hidden');

  try {
    const buffer = await file.arrayBuffer();
    const db = new state.SQL.Database(new Uint8Array(buffer));
    await loadDatabase(db, { filename: file.name, size: file.size });
    if (state.profile.preferences.autoSaveUploads) {
      try {
        await saveDatabaseFile(buffer, { filename: file.name, size: file.size });
        showToast('Database loaded and saved locally', 'success');
      } catch (storageError) {
        state.currentDbId = null;
        state.currentDbMeta = null;
        localStorage.removeItem(STORAGE_KEYS.currentDbId);
        showToast('Database opened, but browser storage is full or unavailable.', 'error');
        console.error(storageError);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentDbId);
      showToast('Database loaded for this session', 'success');
    }
  } catch (e) {
    document.getElementById('loading-overlay').classList.add('hidden');
    showToast('Failed to parse database: ' + e.message, 'error');
    console.error(e);
  }
}

function extractSchema(db) {
  const tables = [];
  const tableInfo = {};
  const fkMap = {};

  const rows = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  if (rows.length > 0) {
    rows[0].values.forEach(r => tables.push(r[0]));
  }

  tables.forEach(t => {
    const colRows = db.exec(`PRAGMA table_info("${t}")`);
    const columns = colRows.length > 0 ? colRows[0].values.map(r => ({
      cid: r[0], name: r[1], type: r[2], notnull: r[3], default: r[4], pk: r[5]
    })) : [];

    const countRows = db.exec(`SELECT COUNT(*) FROM "${t}"`);
    const rowCount = countRows.length > 0 ? countRows[0].values[0][0] : 0;

    const fkRows = db.exec(`PRAGMA foreign_key_list("${t}")`);
    const fks = fkRows.length > 0 ? fkRows[0].values.map(r => ({
      id: r[0], from: r[3], to: r[4], table: r[2]
    })) : [];

    tableInfo[t] = { columns, rowCount, fks };
    fkMap[t] = fks;
  });

  return { tables, tableInfo, fkMap };
}

async function loadDatabase(db, options = {}) {
  if (state.db && state.db !== db) {
    try { state.db.close?.(); } catch {}
  }
  state.db = db;
  state.dbFileName = options.filename || options.meta?.filename || state.dbFileName;
  state.dbFileSize = options.size ?? options.meta?.size ?? state.dbFileSize;
  state.currentDbId = options.id || options.meta?.id || null;
  state.currentDbMeta = options.meta || null;
  state.currentTable = null;
  state.sortCol = null;
  state.sortDir = 'asc';
  state.filterText = '';
  state.tableExactFilter = null;
  state.page = 1;
  state.selectedRow = null;
  state.navHistory = [];
  colorIdx = 0;
  Object.keys(tableColorMap).forEach(k => delete tableColorMap[k]);

  const { tables, tableInfo, fkMap } = extractSchema(db);
  state.tables = tables;
  state.tableInfo = tableInfo;
  state.fkMap = fkMap;

  buildSidebar();
  updateDBInfo();
  switchView('dashboard');
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('sidebar').style.display = 'flex';
  if (state.currentDbId) localStorage.setItem(STORAGE_KEYS.currentDbId, state.currentDbId);
  else localStorage.removeItem(STORAGE_KEYS.currentDbId);
}

function buildSidebar() {
  const container = document.getElementById('sidebar-tables');
  container.innerHTML = '';
  const orderedTables = [...state.tables].sort((a, b) => Number(isPinnedTable(b)) - Number(isPinnedTable(a)) || a.localeCompare(b));
  orderedTables.forEach((t, i) => {
    const info = state.tableInfo[t];
    const div = document.createElement('div');
    div.className = 'table-item';
    div.dataset.table = t;
    div.onclick = () => openTable(t);
    div.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-[11px] ${isPinnedTable(t) ? 'text-accent' : 'text-muted/40'}"><i class="fa-solid fa-thumbtack"></i></span>
        <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${getTableColor(t)}"></div>
        <span class="truncate">${t}</span>
      </div>
      <span class="table-count flex-shrink-0">${info.rowCount.toLocaleString()}</span>
    `;
    container.appendChild(div);
  });
}

function isPinnedTable(tableName) {
  return state.profile?.pinnedTables?.includes(tableName);
}

function togglePinnedTable(tableName, event) {
  if (event) event.stopPropagation();
  const pins = state.profile.pinnedTables;
  if (pins.includes(tableName)) state.profile.pinnedTables = pins.filter(t => t !== tableName);
  else state.profile.pinnedTables = [...pins, tableName];
  saveProfile();
  buildSidebar();
  if (state.currentView === 'dashboard') renderDashboard();
  if (state.currentView === 'table') renderTable();
  showToast(isPinnedTable(tableName) ? 'Table pinned' : 'Table unpinned', 'success');
}

function updateDBInfo() {
  const totalRows = state.tables.reduce((s, t) => s + state.tableInfo[t].rowCount, 0);
  const totalFks = state.tables.reduce((s, t) => s + state.fkMap[t].length, 0);
  document.getElementById('db-info').innerHTML = `
    <div class="flex items-center gap-2"><i class="fa-solid fa-file text-accent/50"></i>${state.dbFileName || 'Sample DB'}</div>
    <div>${formatSize(state.dbFileSize)} &middot; ${state.tables.length} tables &middot; ${totalRows.toLocaleString()} rows</div>
  `;
}

function switchView(view, pushHistory = true) {
  if (pushHistory && state.currentView !== 'upload') {
    state.navHistory.push({ view: state.currentView, table: state.currentTable });
  }
  state.currentView = view;

  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('view-' + view);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.sidebar-item').forEach(s => {
    s.classList.toggle('active', s.dataset.view === view);
  });
  document.querySelectorAll('.table-item').forEach(s => {
    s.classList.toggle('active', view === 'table' && s.dataset.table === state.currentTable);
  });

  if (view === 'dashboard') renderDashboard();
  else if (view === 'graph') renderGraph();
  else if (view === 'table') renderTable();
  else if (view === 'query') renderQuery();
  else if (view === 'charts') renderCharts();
  else if (view === 'compare') renderCompare();
  else if (view === 'profile') renderProfile();
  else if (view === 'upload') {
    renderProfileSetupPrompt();
    renderUploadSavedDatabases();
  }
}

function goBack() {
  if (state.navHistory.length === 0) return;
  const prev = state.navHistory.pop();
  state.currentTable = prev.table;
  switchView(prev.view, false);
}

function savedDatabasesHTML(context = 'dashboard') {
  const isUpload = context === 'upload';
  const storageText = state.storageUsage?.quota
    ? `${formatSize(state.storageUsage.usage || 0)} of ${formatSize(state.storageUsage.quota)} used`
    : 'Storage estimate unavailable';

  if (!state.storageReady) {
    return `
      <div class="glass p-5">
        <div class="flex items-center gap-3 text-rose-200">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <div class="font-display font-semibold text-sm">Local database storage is unavailable</div>
            <div class="text-xs text-muted mt-1">Your current file can still be opened, but saved database history requires IndexedDB.</div>
          </div>
        </div>
      </div>`;
  }

  if (state.savedDatabases.length === 0) {
    return `
      <div class="glass p-5 ${isUpload ? 'max-w-lg mx-auto' : ''}">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/12 flex items-center justify-center"><i class="fa-solid fa-box-archive text-cyan-300"></i></div>
          <div>
            <div class="font-display font-semibold text-sm">No saved databases yet</div>
            <div class="text-xs text-muted mt-1">Uploaded SQLite files are stored in this browser with IndexedDB when auto-save is enabled.</div>
          </div>
        </div>
      </div>`;
  }

  const cards = state.savedDatabases.map(db => {
    const active = state.currentDbId === db.id;
    const tables = (db.schemaPreview || []).slice(0, 4).map(t => t.name).join(', ');
    return `
      <div class="saved-db-card glass-sm p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <i class="fa-solid fa-database text-accent/80 text-xs"></i>
              <span class="font-display font-semibold text-sm truncate">${escapeHtml(db.filename)}</span>
              ${active ? '<span class="session-pill">Open</span>' : ''}
            </div>
            <div class="text-[11px] text-muted">${formatSize(db.size)} &middot; ${db.tableCount || 0} tables &middot; ${(db.totalRows || 0).toLocaleString()} rows</div>
            <div class="text-[11px] text-muted/70 mt-1">Uploaded ${formatDate(db.uploadedAt)}</div>
            ${tables ? `<div class="text-[11px] text-muted/60 mt-2 truncate">Schema: ${escapeHtml(tables)}</div>` : ''}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button class="icon-btn" title="Reopen database" onclick="loadSavedDatabase('${db.id}')"><i class="fa-solid fa-folder-open"></i></button>
            <button class="icon-btn danger" title="Delete saved database" onclick="deleteSavedDatabase('${db.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div>
      <div class="flex items-end justify-between gap-4 mb-3">
        <div>
          <h3 class="font-display text-lg font-semibold">${isUpload ? 'Saved Databases' : 'Saved Databases'}</h3>
          <p class="text-xs text-muted">${state.savedDatabases.length} stored locally &middot; ${storageText}</p>
        </div>
        ${state.storageUsage?.quota ? `
          <div class="hidden sm:block w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-accent" style="width:${storageRatio()}%"></div>
          </div>` : ''}
      </div>
      <div class="grid grid-cols-1 ${isUpload ? '' : 'xl:grid-cols-2'} gap-3">${cards}</div>
    </div>`;
}

function renderUploadSavedDatabases() {
  const el = document.getElementById('upload-saved-databases');
  if (!el) return;
  el.innerHTML = savedDatabasesHTML('upload');
}

function renderProfileSetupPrompt() {
  const el = document.getElementById('profile-setup-prompt');
  if (!el || !state.profile) return;
  const hasName = state.profile.displayName && state.profile.displayName !== defaultProfile().displayName;
  el.innerHTML = `
    <button type="button" class="glass-sm w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.06] transition-colors" onclick="switchView('profile')">
      <span class="flex items-center gap-3 min-w-0">
        ${avatarHTML()}
        <span class="min-w-0">
          <span class="block font-display font-semibold text-sm truncate">${hasName ? escapeHtml(state.profile.displayName) : 'Add your name and choose an avatar'}</span>
          <span class="block text-xs text-muted mt-0.5">${hasName ? 'Choose an avatar for your local account' : 'Set up your local account profile'}</span>
        </span>
      </span>
      <i class="fa-solid fa-user-pen text-accent flex-shrink-0"></i>
    </button>`;
}

function renderCurrentSessionHTML() {
  const dbName = state.db ? state.dbFileName : 'No database open';
  const openedFrom = state.currentDbId ? 'Saved database' : (state.db ? 'Temporary upload' : 'Waiting for upload');
  return `
    <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-4 mb-8">
      <div class="glass p-5 fade-up">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4 min-w-0">
            ${avatarHTML('avatar-lg')}
            <div class="min-w-0">
              <div class="text-xs text-muted uppercase tracking-widest font-semibold mb-1">Current Session</div>
              <h2 class="font-display text-xl font-bold truncate">${escapeHtml(dbName)}</h2>
              <p class="text-xs text-muted mt-1">${openedFrom} &middot; ${formatSize(state.dbFileSize || 0)} &middot; private to this browser</p>
            </div>
          </div>
          <button class="icon-btn" title="Account settings" onclick="switchView('profile')"><i class="fa-solid fa-user-gear"></i></button>
        </div>
      </div>
      <div class="glass p-5 fade-up" style="animation-delay:.05s">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="text-xs text-muted uppercase tracking-widest font-semibold">Local Storage</div>
            <div class="font-display font-semibold text-sm mt-1">IndexedDB file vault</div>
          </div>
          <span class="session-pill"><i class="fa-solid fa-lock"></i>Client-side</span>
        </div>
        <div class="text-xs text-muted">${state.storageUsage?.quota ? `${formatSize(state.storageUsage.usage || 0)} used of ${formatSize(state.storageUsage.quota)}` : 'Storage estimate unavailable'}</div>
        <div class="h-1.5 rounded-full bg-white/10 overflow-hidden mt-3"><div class="h-full bg-accent" style="width:${storageRatio()}%"></div></div>
      </div>
    </div>`;
}

function avatarChoicesHTML() {
  const selected = selectedDefaultAvatar().id;
  return DEFAULT_AVATARS.map(avatar => `
    <button type="button" class="avatar-choice ${avatar.id === selected && !state.profile.avatarDataUrl ? 'selected' : ''}" style="${defaultAvatarStyle(avatar)}" title="${avatar.label}" aria-label="Choose ${avatar.label} avatar" onclick="selectDefaultAvatar('${avatar.id}')">
      <i class="fa-solid ${avatar.icon}" aria-hidden="true"></i>
    </button>`).join('');
}

function selectDefaultAvatar(id) {
  if (!DEFAULT_AVATARS.some(a => a.id === id)) return;
  state.profile.avatarId = id;
  state.profile.avatarDataUrl = '';
  saveProfile();
  renderProfile();
  showToast('Avatar selected', 'success');
}

function renderProfile() {
  const prefs = state.profile.preferences;
  document.getElementById('profile-content').innerHTML = `
    <div class="mb-6 fade-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h2 class="font-display text-2xl font-bold tracking-tight mb-1">Account and Profile</h2>
        <p class="text-muted text-sm">Add your name and choose an avatar.</p>
      </div>
      <button type="button" class="px-3 py-2 rounded-lg bg-white/[0.05] text-muted text-xs font-semibold hover:text-text transition-colors self-start sm:self-auto" onclick="switchView('upload')">
        <i class="fa-solid fa-house mr-1.5"></i>Main Landing Page
      </button>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
      <div class="glass p-5 fade-up">
        <div class="flex items-center gap-4 mb-5">
          ${avatarHTML('avatar-lg')}
          <div class="min-w-0">
            <div class="font-display font-semibold text-lg truncate">${escapeHtml(state.profile.displayName)}</div>
            <div class="text-xs text-muted">Client-side profile</div>
          </div>
        </div>
        <label class="block text-xs text-muted uppercase tracking-widest font-semibold mb-2" for="profile-display-name">Your name</label>
        <input id="profile-display-name" class="form-field mb-4" value="${escapeHtml(state.profile.displayName)}" maxlength="48">
        <div class="mb-4">
          <div class="text-xs text-muted uppercase tracking-widest font-semibold mb-2">Choose an avatar</div>
          <div class="grid grid-cols-3 gap-2">
            ${avatarChoicesHTML()}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input type="file" id="profile-avatar-input" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
          <button class="px-3 py-2 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent-hover transition-colors" onclick="document.getElementById('profile-avatar-input').click()">
            <i class="fa-solid fa-image mr-1.5"></i>Upload image
          </button>
          <button class="px-3 py-2 rounded-lg bg-white/[0.05] text-muted text-xs font-semibold hover:text-text transition-colors" onclick="removeAvatar()">
            Clear upload
          </button>
        </div>
      </div>

      <div class="space-y-5">
        <div class="glass p-5 fade-up" style="animation-delay:.05s">
          <h3 class="font-display text-lg font-semibold mb-4">Profile Preferences</h3>
          ${preferenceRow('reopenLast', 'Reopen last database', 'Restore your last saved database after reloads.', prefs.reopenLast)}
          ${preferenceRow('autoSaveUploads', 'Auto-save uploads', 'Store validated SQLite files in IndexedDB for quick reopening.', prefs.autoSaveUploads)}
          ${preferenceRow('confirmDelete', 'Confirm before deletion', 'Ask before removing saved files from browser storage.', prefs.confirmDelete)}
          ${preferenceRow('compactRows', 'Compact table rows', 'Use denser row spacing when browsing table data.', prefs.compactRows)}
          ${preferenceRow('lightTheme', 'Light theme', 'Use a brighter interface for daylight work.', prefs.lightTheme)}
        </div>

        <div class="glass p-5 fade-up" style="animation-delay:.1s">
          ${savedDatabasesHTML('profile')}
        </div>
      </div>
    </div>`;

  const nameInput = document.getElementById('profile-display-name');
  nameInput.addEventListener('input', e => {
    state.profile.displayName = e.target.value.trim() || 'Local Analyst';
    saveProfile();
    renderProfileSetupPrompt();
  });
  document.getElementById('profile-avatar-input').addEventListener('change', handleAvatarUpload);
}

function preferenceRow(key, title, description, checked) {
  return `
    <button class="w-full flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0 text-left" onclick="togglePreference('${key}')">
      <span>
        <span class="block text-sm font-semibold">${title}</span>
        <span class="block text-xs text-muted mt-0.5">${description}</span>
      </span>
      <span class="pref-toggle ${checked ? 'active' : ''}"></span>
    </button>`;
}

function togglePreference(key) {
  state.profile.preferences[key] = !state.profile.preferences[key];
  if (key === 'compactRows') state.pageSize = state.profile.preferences.compactRows ? 100 : 50;
  if (key === 'lightTheme') applyTheme();
  saveProfile();
  renderProfile();
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024 * 2) {
    showToast('Choose an avatar under 2 MB for local profile storage.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.profile.avatarDataUrl = reader.result;
    saveProfile();
    renderProfile();
    showToast('Profile picture updated', 'success');
  };
  reader.onerror = () => showToast('Could not read that image.', 'error');
  reader.readAsDataURL(file);
}

function removeAvatar() {
  state.profile.avatarDataUrl = '';
  saveProfile();
  renderProfile();
  showToast('Using selected default avatar', 'success');
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${escapeSqlText(value)}'`;
}

function escapeSqlText(value) {
  return String(value).replace(/'/g, "''");
}

function jsArg(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderDashboard() {
  if (!state.db) {
    switchView('upload', false);
    return;
  }
  const totalRows = state.tables.reduce((s, t) => s + state.tableInfo[t].rowCount, 0);
  const totalFks = state.tables.reduce((s, t) => s + state.fkMap[t].length, 0);
  const totalCols = state.tables.reduce((s, t) => s + state.tableInfo[t].columns.length, 0);
  const pinned = state.profile.pinnedTables.filter(t => state.tableInfo[t]);
  let indexCount = 0;
  try {
    const idxRows = state.db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'");
    if (idxRows.length > 0) indexCount = idxRows[0].values[0][0];
  } catch {}
  const orderedTables = [...pinned, ...state.tables.filter(t => !pinned.includes(t))];
  const tableCards = orderedTables.map((t, i) => {
    const info = state.tableInfo[t];
    const columns = info.columns.slice(0, 6).map(c => `<span class="badge bg-white/[0.05] text-muted">${escapeHtml(c.name)}</span>`).join(' ');
    return `
      <button class="glass-sm p-4 text-left hover:bg-white/[0.06] transition-colors fade-up" style="animation-delay:${0.05 + i * 0.02}s" onclick='openTable(${jsArg(t)})'>
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${getTableColor(t)}"></span>
            <span class="font-display font-semibold truncate">${escapeHtml(t)}</span>
          </div>
          <span class="flex items-center gap-2 flex-shrink-0">
            <span class="text-xs text-muted">${info.rowCount.toLocaleString()} rows</span>
            <span class="pin-button ${isPinnedTable(t) ? 'active' : ''}" title="${isPinnedTable(t) ? 'Unpin table' : 'Pin table'}" onclick='togglePinnedTable(${jsArg(t)}, event)'><i class="fa-solid fa-thumbtack"></i></span>
          </span>
        </div>
        <div class="text-xs text-muted mb-3">${info.columns.length} columns &middot; ${info.fks.length} relationships</div>
        <div class="flex flex-wrap gap-1.5">${columns}</div>
      </button>`;
  }).join('');
  document.getElementById('dashboard-content').innerHTML = `
    <div class="mb-6 fade-up">
      <h2 class="font-display text-2xl font-bold tracking-tight mb-1">Database Overview</h2>
      <p class="text-muted text-sm">${escapeHtml(state.dbFileName || 'Sample Database')}</p>
    </div>
    ${renderCurrentSessionHTML()}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${statCard('stat-tables', 'Tables', 'fa-table', state.tables.length, 'bg-accent/15 text-accent', '.1s')}
      ${statCard('stat-rows', 'Rows', 'fa-bars-staggered', totalRows, 'bg-emerald-500/15 text-emerald-400', '.15s')}
      ${statCard('stat-columns', 'Columns', 'fa-table-columns', totalCols, 'bg-cyan-500/15 text-cyan-300', '.2s')}
      ${statCard('stat-indexes', 'Indexes', 'fa-key', indexCount + totalFks, 'bg-rose-500/15 text-rose-300', '.25s')}
    </div>
    <div class="flex items-center justify-between gap-4 mb-4">
      <div>
        <h3 class="font-display text-lg font-semibold">Tables</h3>
        <p class="text-xs text-muted mt-1">${pinned.length ? `${pinned.length} pinned table${pinned.length === 1 ? '' : 's'} shown first` : 'Pin important tables for faster browsing'}</p>
      </div>
      <button class="px-3 py-2 rounded-lg bg-white/[0.05] text-muted text-xs font-semibold hover:text-text transition-colors" onclick="switchView('upload')">
        <i class="fa-solid fa-house mr-1.5"></i>Landing Page
      </button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">${tableCards || emptyState('No tables found in this database.')}</div>`;
  animateCounter(document.getElementById('stat-tables'), state.tables.length);
  animateCounter(document.getElementById('stat-rows'), totalRows);
  animateCounter(document.getElementById('stat-columns'), totalCols);
  animateCounter(document.getElementById('stat-indexes'), indexCount + totalFks);
}

function statCard(id, label, icon, value, tone, delay) {
  return `
    <div class="glass stat-card p-5 fade-up" style="animation-delay:${delay}">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center"><i class="fa-solid ${icon} text-sm"></i></div>
        <span class="text-muted text-xs font-semibold uppercase tracking-wider">${label}</span>
      </div>
      <div class="font-display text-3xl font-bold" id="${id}">${Number(value || 0).toLocaleString()}</div>
    </div>`;
}

function emptyState(message) {
  return `<div class="glass p-6 text-sm text-muted text-center">${message}</div>`;
}

function renderGraph() {
  const container = document.getElementById('graph-container');
  const tooltip = document.getElementById('graph-tooltip');
  const empty = document.getElementById('graph-empty');
  const legend = document.getElementById('graph-legend');
  const toolbar = document.getElementById('graph-toolbar');
  container.querySelectorAll('svg').forEach(svg => svg.remove());
  if (state.graphSim) state.graphSim.stop();
  const gl = state.profile.preferences.graphLayout;
  const glLabel = { force: 'Force graph', compact: 'Compact', grouped: 'Grouped' };
  const glItem = (value, icon, label) => `
    <button type="button" class="custom-dd-item ${gl === value ? 'active' : ''}" role="option" aria-selected="${gl === value}" onclick="setGraphLayout('${value}')">
      <i class="fa-solid ${icon}"></i><span>${label}</span>
    </button>`;
  toolbar.innerHTML = `
    <div class="glass-sm p-2 flex items-center gap-2">
      <div class="custom-dd custom-dd--toolbar" id="graph-layout-dd">
        <button type="button" class="custom-dd-trigger" id="graph-layout-dd-trigger" onclick="toggleCustomDropdown(this)" aria-haspopup="listbox" aria-expanded="false" aria-label="Graph layout">
          <span class="custom-dd-label" id="graph-layout-dd-label">${glLabel[gl] || glLabel.force}</span>
          <i class="fa-solid fa-chevron-down text-[10px] opacity-70"></i>
        </button>
        <div class="custom-dd-menu" id="graph-layout-dd-menu" role="listbox" aria-labelledby="graph-layout-dd-trigger">
          ${glItem('force', 'fa-share-nodes', 'Force graph')}
          ${glItem('compact', 'fa-border-all', 'Compact')}
          ${glItem('grouped', 'fa-layer-group', 'Grouped')}
        </div>
      </div>
    </div>
    <div class="glass-sm p-2 flex items-center gap-2">
      <button class="toolbar-btn" onclick="exportGraphSVG()"><i class="fa-solid fa-vector-square"></i>SVG</button>
      <button class="toolbar-btn" onclick="exportGraphPNG()"><i class="fa-solid fa-image"></i>PNG</button>
      <button class="toolbar-btn" onclick="exportSchemaPDF()"><i class="fa-solid fa-file-pdf"></i>PDF</button>
    </div>`;
  if (!state.db || state.tables.length === 0) {
    empty.classList.remove('hidden');
    legend.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  legend.classList.remove('hidden');
  const width = container.clientWidth || 900;
  const height = container.clientHeight || 600;
  const nodes = state.tables.map(t => ({ id: t, rows: state.tableInfo[t].rowCount, color: getTableColor(t) }));
  const links = [];
  Object.entries(state.fkMap).forEach(([table, fks]) => {
    fks.forEach(fk => links.push({ source: table, target: fk.table, label: `${fk.from} -> ${fk.to}` }));
  });
  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  state.graphSvgNode = svg.node();
  const g = svg.append('g');
  const textColor = document.body.classList.contains('theme-light') ? '#111827' : '#E5E7EB';
  const linkColor = document.body.classList.contains('theme-light') ? 'rgba(15,23,42,.28)' : 'rgba(255,255,255,.2)';
  svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', e => g.attr('transform', e.transform)));
  const link = g.append('g').selectAll('line').data(links).enter().append('line').attr('stroke', linkColor).attr('stroke-width', 1.5);
  const node = g.append('g').selectAll('g').data(nodes).enter().append('g').attr('cursor', 'pointer').on('click', (_, d) => openTable(d.id)).on('mouseenter', (event, d) => {
    tooltip.innerHTML = `<strong>${escapeHtml(d.id)}</strong><br>${d.rows.toLocaleString()} rows`;
    tooltip.style.left = event.offsetX + 16 + 'px';
    tooltip.style.top = event.offsetY + 16 + 'px';
    tooltip.classList.add('visible');
  }).on('mouseleave', () => tooltip.classList.remove('visible'));
  node.append('circle').attr('r', 28).attr('fill', d => d.color).attr('opacity', .22);
  node.append('circle').attr('r', 18).attr('fill', d => d.color);
  node.append('text').attr('text-anchor', 'middle').attr('y', 42).attr('fill', textColor).attr('font-size', 12).text(d => d.id.length > 18 ? d.id.slice(0, 17) + '...' : d.id);
  const updateGraphPositions = () => {
    link.attr('x1', d => nodePosition(d.source).x).attr('y1', d => nodePosition(d.source).y).attr('x2', d => nodePosition(d.target).x).attr('y2', d => nodePosition(d.target).y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  };
  const layout = state.profile.preferences.graphLayout;
  if (layout === 'force') {
    node.call(d3.drag().on('start', dragStarted).on('drag', dragged).on('end', dragEnded));
    state.graphSim = d3.forceSimulation(nodes).force('link', d3.forceLink(links).id(d => d.id).distance(150)).force('charge', d3.forceManyBody().strength(-450)).force('center', d3.forceCenter(width / 2, height / 2)).on('tick', updateGraphPositions);
  } else {
    if (layout === 'compact') applyCompactLayout(nodes, width, height);
    if (layout === 'grouped') applyGroupedLayout(nodes, links, width, height);
    updateGraphPositions();
  }
  legend.innerHTML = `${state.tables.length} tables &middot; ${links.length} relationships`;
  function nodePosition(value) {
    if (typeof value === 'object') return value;
    return nodes.find(n => n.id === value) || { x: width / 2, y: height / 2 };
  }
  function dragStarted(event, d) {
    if (!event.active) state.graphSim.alphaTarget(.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragEnded(event, d) {
    if (!event.active) state.graphSim.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

function setGraphLayout(layout) {
  closeAllCustomDropdowns();
  state.profile.preferences.graphLayout = layout;
  saveProfile();
  renderGraph();
}

function applyCompactLayout(nodes, width, height) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  nodes.forEach((node, i) => {
    node.x = ((i % cols) + 1) * (width / (cols + 1));
    node.y = (Math.floor(i / cols) + 1) * (height / (rows + 1));
  });
}

function applyGroupedLayout(nodes, links, width, height) {
  const groups = relationshipGroups(nodes, links);
  const cols = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  groups.forEach((group, groupIndex) => {
    const cx = ((groupIndex % cols) + 1) * (width / (cols + 1));
    const cy = (Math.floor(groupIndex / cols) + 1) * (height / (Math.ceil(groups.length / cols) + 1));
    const radius = Math.max(70, Math.min(150, group.length * 24));
    group.forEach((id, i) => {
      const node = nodes.find(n => n.id === id);
      const angle = group.length === 1 ? 0 : (Math.PI * 2 * i) / group.length;
      node.x = cx + Math.cos(angle) * (group.length === 1 ? 0 : radius);
      node.y = cy + Math.sin(angle) * (group.length === 1 ? 0 : radius);
    });
  });
}

function relationshipGroups(nodes, links) {
  const parent = Object.fromEntries(nodes.map(n => [n.id, n.id]));
  const find = id => parent[id] === id ? id : (parent[id] = find(parent[id]));
  const join = (a, b) => {
    const pa = find(typeof a === 'object' ? a.id : a);
    const pb = find(typeof b === 'object' ? b.id : b);
    if (pa !== pb) parent[pb] = pa;
  };
  links.forEach(link => join(link.source, link.target));
  const grouped = {};
  nodes.forEach(node => {
    const key = find(node.id);
    grouped[key] = grouped[key] || [];
    grouped[key].push(node.id);
  });
  return Object.values(grouped).sort((a, b) => b.length - a.length);
}

function graphSvgString() {
  if (!state.graphSvgNode) return '';
  const clone = state.graphSvgNode.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const width = clone.getAttribute('width') || '1200';
  const height = clone.getAttribute('height') || '800';
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', width);
  bg.setAttribute('height', height);
  bg.setAttribute('fill', document.body.classList.contains('theme-light') ? '#F8FAFC' : '#0B0F19');
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function exportGraphSVG() {
  const svg = graphSvgString();
  if (!svg) return showToast('Open the relationship graph before exporting.', 'error');
  downloadFile(svg, `${safeFileStem(state.dbFileName)}-schema.svg`, 'image/svg+xml');
}

function exportGraphPNG() {
  const svg = graphSvgString();
  if (!svg) return showToast('Open the relationship graph before exporting.', 'error');
  const image = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width || state.graphSvgNode.width.baseVal.value || 1200;
    canvas.height = image.height || state.graphSvgNode.height.baseVal.value || 800;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(png => downloadBlob(png, `${safeFileStem(state.dbFileName)}-schema.png`), 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast('PNG export failed.', 'error');
  };
  image.src = url;
}

function exportSchemaPDF() {
  if (!state.db) return showToast('Open a database before exporting schema.', 'error');
  const lines = schemaReportLines();
  downloadBlob(buildPdfBlob(lines), `${safeFileStem(state.dbFileName)}-schema.pdf`);
}

function openTable(tableName) {
  if (!state.tableInfo[tableName]) return;
  state.currentTable = tableName;
  state.page = 1;
  state.sortCol = null;
  state.sortDir = 'asc';
  state.filterText = '';
  state.tableExactFilter = null;
  switchView('table');
}

function openRelatedTable(tableName, columnName, value) {
  if (!state.tableInfo[tableName]) return;
  state.currentTable = tableName;
  state.page = 1;
  state.sortCol = null;
  state.sortDir = 'asc';
  state.filterText = '';
  state.tableExactFilter = { column: columnName, value };
  closeInspector();
  switchView('table');
}

function tableWhereClause(columns) {
  const clauses = [];
  if (state.tableExactFilter?.column) {
    const exact = state.tableExactFilter.value === null || state.tableExactFilter.value === undefined
      ? `${quoteIdent(state.tableExactFilter.column)} IS NULL`
      : `${quoteIdent(state.tableExactFilter.column)} = ${sqlLiteral(state.tableExactFilter.value)}`;
    clauses.push(exact);
  }
  if (state.filterText.trim()) {
    const q = escapeSqlText(state.filterText.trim());
    clauses.push('(' + columns.map(c => `CAST(${quoteIdent(c.name)} AS TEXT) LIKE '%${q}%'`).join(' OR ') + ')');
  }
  return clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
}

function cellHTML(columnName, value) {
  const fk = state.fkMap[state.currentTable]?.find(item => item.from === columnName);
  if (fk && value !== null && value !== undefined) {
    return `<button class="fk-link-btn" onclick='event.stopPropagation(); openRelatedTable(${jsArg(fk.table)}, ${jsArg(fk.to)}, ${jsArg(value)})'>${escapeHtml(value)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></button>`;
  }
  return escapeHtml(value);
}

function renderTable() {
  if (!state.currentTable && state.tables.length) state.currentTable = state.tables[0];
  if (!state.currentTable) {
    document.getElementById('table-content').innerHTML = emptyState('Open a database to browse tables.');
    return;
  }
  const info = state.tableInfo[state.currentTable];
  const where = tableWhereClause(info.columns);
  const order = state.sortCol ? `ORDER BY ${quoteIdent(state.sortCol)} ${state.sortDir.toUpperCase()}` : '';
  const offset = (state.page - 1) * state.pageSize;
  let total = 0;
  let rows = [];
  try {
    const count = state.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(state.currentTable)} ${where}`);
    total = count.length ? count[0].values[0][0] : 0;
    const result = state.db.exec(`SELECT * FROM ${quoteIdent(state.currentTable)} ${where} ${order} LIMIT ${state.pageSize} OFFSET ${offset}`);
    state.tableColumns = result.length ? result[0].columns : info.columns.map(c => c.name);
    rows = result.length ? result[0].values : [];
    state.tableData = rows;
    state.totalRows = total;
  } catch (e) {
    showToast('Could not read table: ' + e.message, 'error');
  }
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const headers = state.tableColumns.map(c => `<th onclick='sortTable(${jsArg(c)})'>${escapeHtml(c)} ${state.sortCol === c ? (state.sortDir === 'asc' ? '&#9650;' : '&#9660;') : ''}</th>`).join('');
  const body = rows.map((row, idx) => `
    <tr onclick="openInspector(${idx})" class="${state.selectedRow === row ? 'row-selected' : ''}">
      ${row.map((v, i) => `<td>${cellHTML(state.tableColumns[i], v)}</td>`).join('')}
    </tr>`).join('');
  document.getElementById('table-content').innerHTML = `
    <div class="px-6 py-4 border-b border-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div class="min-w-0">
        <button class="text-xs text-muted hover:text-accent mb-2" onclick="goBack()"><i class="fa-solid fa-arrow-left mr-1.5"></i>Back</button>
        <div class="flex items-center gap-2">
          <h2 class="font-display text-2xl font-bold truncate">${escapeHtml(state.currentTable)}</h2>
          <button class="pin-button ${isPinnedTable(state.currentTable) ? 'active' : ''}" title="${isPinnedTable(state.currentTable) ? 'Unpin table' : 'Pin table'}" onclick='togglePinnedTable(${jsArg(state.currentTable)}, event)'><i class="fa-solid fa-thumbtack"></i></button>
        </div>
        <p class="text-xs text-muted mt-1">${total.toLocaleString()} rows &middot; ${info.columns.length} columns${state.tableExactFilter ? ` &middot; filtered by ${escapeHtml(state.tableExactFilter.column)}` : ''}</p>
        ${state.tableExactFilter ? `<button class="toolbar-btn mt-3" onclick="clearRelationFilter()"><i class="fa-solid fa-filter-circle-xmark"></i>Clear relation filter</button>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <input id="table-search" class="form-field w-64" placeholder="Search table" value="${escapeHtml(state.filterText)}">
        <button class="icon-btn" title="Export CSV" onclick='exportCSV(${jsArg(state.currentTable)})'><i class="fa-solid fa-file-csv"></i></button>
        <button class="icon-btn" title="Export JSON" onclick='exportJSON(${jsArg(state.currentTable)})'><i class="fa-solid fa-file-code"></i></button>
      </div>
    </div>
    <div class="flex-1 overflow-auto">
      <table class="data-grid ${state.profile?.preferences.compactRows ? 'compact' : ''}">
        <thead><tr>${headers}</tr></thead>
        <tbody>${body || `<tr><td colspan="${state.tableColumns.length || 1}" class="text-center text-muted py-10">No rows found</td></tr>`}</tbody>
      </table>
    </div>
    <div class="px-6 py-3 border-t border-border flex items-center justify-between text-xs text-muted">
      <span>Page ${state.page} of ${totalPages}</span>
      <div class="flex items-center gap-2">
        <button class="icon-btn" title="Previous page" onclick="changePage(-1)" ${state.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
        <button class="icon-btn" title="Next page" onclick="changePage(1)" ${state.page >= totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>`;
  const search = document.getElementById('table-search');
  search.addEventListener('input', e => {
    state.filterText = e.target.value;
    state.page = 1;
    clearTimeout(state.tableSearchTimer);
    state.tableSearchTimer = setTimeout(() => {
      renderTable();
      const nextSearch = document.getElementById('table-search');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    }, 180);
  });
}

function sortTable(column) {
  if (state.sortCol === column) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else {
    state.sortCol = column;
    state.sortDir = 'asc';
  }
  renderTable();
}

function changePage(delta) {
  const totalPages = Math.max(1, Math.ceil(state.totalRows / state.pageSize));
  state.page = Math.min(totalPages, Math.max(1, state.page + delta));
  renderTable();
}

function clearRelationFilter() {
  state.tableExactFilter = null;
  state.page = 1;
  renderTable();
}

function openInspector(rowIndex) {
  const row = state.tableData?.[rowIndex];
  if (!row) return;
  state.selectedRow = row;
  const fields = state.tableColumns.map((c, i) => `
    <div class="py-3 border-b border-border last:border-b-0">
      <div class="text-xs text-muted uppercase tracking-widest font-semibold mb-1">${escapeHtml(c)}</div>
      <div class="text-sm break-words">${escapeHtml(row[i])}</div>
      ${fieldRelationActionHTML(c, row[i])}
    </div>`).join('');
  document.getElementById('inspector-content').innerHTML = `
    <div class="p-5 border-b border-border flex items-center justify-between">
      <div>
        <div class="text-xs text-muted uppercase tracking-widest font-semibold">Row Inspector</div>
        <h3 class="font-display text-lg font-semibold mt-1">${escapeHtml(state.currentTable)}</h3>
      </div>
      <button class="icon-btn" onclick="closeInspector()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="p-5">${fields}${relatedRowsHTML(row)}</div>`;
  document.getElementById('inspector-panel').classList.add('open');
  document.getElementById('inspector-overlay').classList.add('open');
  renderTable();
}

function fieldRelationActionHTML(columnName, value) {
  const fk = state.fkMap[state.currentTable]?.find(item => item.from === columnName);
  if (!fk || value === null || value === undefined) return '';
  return `<button class="toolbar-btn mt-2" onclick='openRelatedTable(${jsArg(fk.table)}, ${jsArg(fk.to)}, ${jsArg(value)})'><i class="fa-solid fa-arrow-up-right-from-square"></i>Open ${escapeHtml(fk.table)}</button>`;
}

function relatedRowsHTML(row) {
  const actions = [];
  state.tables.forEach(table => {
    state.fkMap[table].filter(fk => fk.table === state.currentTable).forEach(fk => {
      const idx = state.tableColumns.indexOf(fk.to);
      if (idx === -1) return;
      const value = row[idx];
      if (value === null || value === undefined) return;
      actions.push(`<button class="toolbar-btn" onclick='openRelatedTable(${jsArg(table)}, ${jsArg(fk.from)}, ${jsArg(value)})'><i class="fa-solid fa-link"></i>${escapeHtml(table)}.${escapeHtml(fk.from)}</button>`);
    });
  });
  if (!actions.length) return '';
  return `
    <div class="pt-5">
      <div class="text-xs text-muted uppercase tracking-widest font-semibold mb-3">Related Rows</div>
      <div class="flex flex-wrap gap-2">${actions.join('')}</div>
    </div>`;
}

function closeInspector() {
  document.getElementById('inspector-panel').classList.remove('open');
  document.getElementById('inspector-overlay').classList.remove('open');
}

function renderQuery() {
  const defaultSql = state.currentTable ? `SELECT * FROM ${quoteIdent(state.currentTable)} LIMIT 50;` : 'SELECT name, type FROM sqlite_master ORDER BY type, name;';
  document.getElementById('query-content').innerHTML = `
    <div class="px-6 py-4 border-b border-border">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 class="font-display text-2xl font-bold tracking-tight">Query Editor</h2>
          <p class="text-xs text-muted mt-1">Run SQLite queries against the open database.</p>
        </div>
        <button class="px-3 py-2 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent-hover transition-colors" onclick="runQuery()"><i class="fa-solid fa-play mr-1.5"></i>Run</button>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div>
          <textarea id="sql-editor" class="query-editor">${escapeHtml(defaultSql)}</textarea>
          <div class="flex flex-wrap gap-2 mt-3">${snippetButtonsHTML()}</div>
        </div>
        <div class="glass-sm p-4 max-h-56 overflow-auto">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="font-display font-semibold text-sm">Query History</h3>
            <button class="toolbar-btn" onclick="clearQueryHistory()"><i class="fa-solid fa-eraser"></i>Clear</button>
          </div>
          <div id="query-history-list" class="space-y-2">${queryHistoryHTML()}</div>
        </div>
      </div>
    </div>
    <div id="query-result" class="flex-1 overflow-auto p-6"></div>`;
  document.getElementById('sql-editor').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });
}

function snippetButtonsHTML() {
  return [
    ['top100', 'Top 100 rows', 'fa-list-ol'],
    ['duplicates', 'Find duplicates', 'fa-clone'],
    ['sizes', 'Table sizes', 'fa-weight-hanging']
  ].map(([id, label, icon]) => `<button class="toolbar-btn" onclick="applySnippet('${id}')"><i class="fa-solid ${icon}"></i>${label}</button>`).join('');
}

function queryHistoryHTML() {
  if (!state.queryHistory.length) return '<div class="text-xs text-muted">Run a query and it will appear here.</div>';
  return state.queryHistory.slice(0, 12).map(item => `
    <button class="w-full text-left glass-sm p-3 hover:bg-white/[0.06] transition-colors" onclick='setQueryEditor(${jsArg(item.sql)}, true)'>
      <span class="block text-xs font-semibold truncate">${escapeHtml(item.sql.replace(/\s+/g, ' '))}</span>
      <span class="block text-[11px] text-muted mt-1">${formatDate(item.ranAt)}</span>
    </button>`).join('');
}

function setQueryEditor(sql, runAfter = false) {
  const editor = document.getElementById('sql-editor');
  if (!editor) return;
  editor.value = sql;
  editor.focus();
  if (runAfter) runQuery();
}

function applySnippet(id) {
  if (!state.db || !state.tables.length) {
    showToast('Open a database before using snippets.', 'error');
    return;
  }
  const table = state.currentTable || state.tables[0];
  const columns = state.tableInfo[table].columns;
  let sql = '';
  if (id === 'top100') sql = `SELECT * FROM ${quoteIdent(table)} LIMIT 100;`;
  if (id === 'duplicates') {
    const column = columns.find(c => !c.pk)?.name || columns[0]?.name || 'id';
    sql = `SELECT ${quoteIdent(column)}, COUNT(*) AS duplicate_count FROM ${quoteIdent(table)} GROUP BY ${quoteIdent(column)} HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC LIMIT 50;`;
  }
  if (id === 'sizes') {
    sql = state.tables.map(t => `SELECT '${escapeSqlText(t)}' AS table_name, COUNT(*) AS row_count FROM ${quoteIdent(t)}`).join('\nUNION ALL\n') + '\nORDER BY row_count DESC;';
  }
  setQueryEditor(sql);
}

function saveQueryHistory(sql) {
  const normalized = sql.trim();
  if (!normalized) return;
  const existing = state.queryHistory.filter(item => item.sql !== normalized);
  state.queryHistory = [{ sql: normalized, ranAt: new Date().toISOString() }, ...existing].slice(0, 30);
  state.profile.queryHistory = state.queryHistory;
  saveProfile();
  const list = document.getElementById('query-history-list');
  if (list) list.innerHTML = queryHistoryHTML();
}

function clearQueryHistory() {
  state.queryHistory = [];
  state.profile.queryHistory = [];
  saveProfile();
  const list = document.getElementById('query-history-list');
  if (list) list.innerHTML = queryHistoryHTML();
  showToast('Query history cleared', 'success');
}

function runQuery() {
  if (!state.db) {
    showToast('Open a database before running a query.', 'error');
    return;
  }
  const sql = document.getElementById('sql-editor').value.trim();
  if (!sql) return;
  try {
    const results = state.db.exec(sql);
    saveQueryHistory(sql);
    const target = document.getElementById('query-result');
    if (!results.length) {
      target.innerHTML = emptyState('Query executed successfully with no returned rows.');
      buildSidebar();
      updateDBInfo();
      return;
    }
    target.innerHTML = results.map(result => {
      const header = result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
      const body = result.values.map(row => `<tr>${row.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
      return `<div class="glass overflow-auto mb-5"><table class="data-grid"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
    }).join('');
    showToast('Query executed', 'success');
  } catch (e) {
    document.getElementById('query-result').innerHTML = `<div class="glass p-5 text-rose-200 text-sm">${escapeHtml(e.message)}</div>`;
    showToast('Query failed', 'error');
  }
}

function chartsDdRow(value, text, active, iconClass, handlerName) {
  return `<button type="button" class="custom-dd-item ${active ? 'active' : ''}" role="option" aria-selected="${active}" onclick='${handlerName}(${jsArg(value)})'><i class="fa-solid ${iconClass}"></i><span class="truncate">${escapeHtml(text)}</span></button>`;
}

function chartsDdMarkup(fluid, disabled, ariaLabel, displayText, menuInnerHtml) {
  const wrap = `custom-dd${fluid ? ' custom-dd--fluid custom-dd--lg' : ''}${disabled ? ' custom-dd--disabled' : ''}`;
  if (disabled) {
    return `<div class="${wrap}"><button type="button" class="custom-dd-trigger" disabled aria-label="${escapeHtml(ariaLabel)}"><span class="custom-dd-label truncate">${escapeHtml(displayText)}</span><i class="fa-solid fa-chevron-down text-[10px] opacity-50 flex-shrink-0"></i></button></div>`;
  }
  return `<div class="${wrap}"><button type="button" class="custom-dd-trigger" onclick="toggleCustomDropdown(this)" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(ariaLabel)}"><span class="custom-dd-label truncate">${escapeHtml(displayText)}</span><i class="fa-solid fa-chevron-down text-[10px] opacity-70 flex-shrink-0"></i></button><div class="custom-dd-menu" role="listbox">${menuInnerHtml}</div></div>`;
}

function chartPickTable(table) {
  closeAllCustomDropdowns();
  state.chartTable = table;
  state.chartLabel = null;
  state.chartValue = null;
  renderCharts();
}

function chartPickLabel(col) {
  closeAllCustomDropdowns();
  state.chartLabel = col;
  drawChart();
}

function chartPickValue(col) {
  closeAllCustomDropdowns();
  state.chartValue = col;
  drawChart();
}

function chartPickType(type) {
  closeAllCustomDropdowns();
  state.chartType = type;
  drawChart();
}

function renderCharts() {
  if (!state.db || !state.tables.length) {
    document.getElementById('charts-content').innerHTML = emptyState('Open a database to build charts.');
    return;
  }
  const table = state.chartTable && state.tableInfo[state.chartTable] ? state.chartTable : state.tables[0];
  state.chartTable = table;
  const columns = state.tableInfo[table].columns;
  const numeric = columns.filter(c => /INT|REAL|NUM|DEC|DOUBLE|FLOAT/i.test(c.type || ''));
  const labels = columns.filter(c => !numeric.includes(c));
  const labelCol = state.chartLabel && columns.some(c => c.name === state.chartLabel) ? state.chartLabel : (labels[0]?.name || columns[0]?.name);
  const valueCol = state.chartValue && numeric.some(c => c.name === state.chartValue) ? state.chartValue : numeric[0]?.name;
  state.chartLabel = labelCol;
  state.chartValue = valueCol;
  const typeDefs = [
    { v: 'bar', label: 'Bar', icon: 'fa-chart-column' },
    { v: 'line', label: 'Line', icon: 'fa-chart-line' },
    { v: 'doughnut', label: 'Doughnut', icon: 'fa-chart-pie' }
  ];
  const chartType = typeDefs.some(d => d.v === state.chartType) ? state.chartType : 'bar';
  state.chartType = chartType;
  const typeLabel = typeDefs.find(d => d.v === chartType)?.label || 'Bar';
  const tableRows = state.tables.map(t => chartsDdRow(t, t, t === table, 'fa-table', 'chartPickTable')).join('');
  const labelRows = columns.map(c => chartsDdRow(c.name, c.name, c.name === labelCol, 'fa-font', 'chartPickLabel')).join('');
  const valueRows = numeric.map(c => chartsDdRow(c.name, c.name, c.name === valueCol, 'fa-hashtag', 'chartPickValue')).join('');
  const typeRows = typeDefs.map(d => chartsDdRow(d.v, d.label, chartType === d.v, d.icon, 'chartPickType')).join('');
  const tableDd = chartsDdMarkup(true, false, 'Table', table, tableRows);
  const labelDd = chartsDdMarkup(true, false, 'Label column', labelCol, labelRows);
  const valueDd = numeric.length
    ? chartsDdMarkup(true, false, 'Value column', valueCol || '—', valueRows)
    : chartsDdMarkup(true, true, 'Value column', 'No numeric columns', '');
  const typeDd = chartsDdMarkup(true, false, 'Chart type', typeLabel, typeRows);
  document.getElementById('charts-content').innerHTML = `
    <div class="mb-6 fade-up">
      <h2 class="font-display text-2xl font-bold tracking-tight mb-1">Charts</h2>
      <p class="text-muted text-sm">Create a quick chart from numeric table columns.</p>
    </div>
    <div class="glass charts-filters p-5 mb-5">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        ${tableDd}
        ${labelDd}
        ${valueDd}
        ${typeDd}
      </div>
    </div>
    <div class="glass charts-body p-5">
      ${numeric.length ? '<div class="chart-container" style="height:360px"><canvas id="chart-canvas"></canvas></div>' : '<div class="text-sm text-muted">This table has no numeric columns to chart.</div>'}
    </div>`;
  if (numeric.length) drawChart();
}

function drawChart() {
  if (state.chartInstance) state.chartInstance.destroy();
  const chartTypes = ['bar', 'line', 'doughnut'];
  const type = chartTypes.includes(state.chartType) ? state.chartType : 'bar';
  const labelCol = state.chartLabel;
  const valueCol = state.chartValue;
  if (!state.chartTable || !labelCol || !valueCol) return;
  try {
    const result = state.db.exec(`SELECT ${quoteIdent(labelCol)}, ${quoteIdent(valueCol)} FROM ${quoteIdent(state.chartTable)} WHERE ${quoteIdent(valueCol)} IS NOT NULL LIMIT 20`);
    const labels = result.length ? result[0].values.map(r => String(r[0])) : [];
    const values = result.length ? result[0].values.map(r => Number(r[1]) || 0) : [];
    const canvas = document.getElementById('chart-canvas');
    if (!canvas) return;
    state.chartInstance = new Chart(canvas, {
      type,
      data: { labels, datasets: [{ label: valueCol, data: values, backgroundColor: '#E8A83888', borderColor: '#E8A838', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#E5E7EB' } } }, scales: type === 'doughnut' ? {} : { x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,.06)' } }, y: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,.06)' } } } }
    });
  } catch (e) {
    showToast('Chart failed: ' + e.message, 'error');
  }
}

function renderCompare() {
  document.getElementById('compare-content').innerHTML = `
    <div class="mb-6 fade-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h2 class="font-display text-2xl font-bold tracking-tight mb-1">Database Comparison</h2>
        <p class="text-muted text-sm">Upload two SQLite files or compare another file against the current database.</p>
      </div>
      <button class="toolbar-btn self-start sm:self-auto" onclick="switchView('upload')"><i class="fa-solid fa-house"></i>Landing Page</button>
    </div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
      ${compareUploadCard('left', 'Database A')}
      ${compareUploadCard('right', 'Database B')}
    </div>
    <div id="compare-results">${comparisonHTML()}</div>`;
  ['left','right'].forEach(side => {
    document.getElementById(`compare-${side}-input`).addEventListener('change', e => {
      if (e.target.files[0]) loadCompareFile(e.target.files[0], side);
    });
  });
}

function compareUploadCard(side, label) {
  const item = state.compare[side];
  return `
    <div class="glass p-5">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 class="font-display text-lg font-semibold">${label}</h3>
          <p class="text-xs text-muted mt-1">${item ? `${escapeHtml(item.filename)} &middot; ${item.tables.length} tables` : 'No file selected'}</p>
        </div>
        ${side === 'left' && state.db ? `<button class="toolbar-btn" onclick="useCurrentForCompare()"><i class="fa-solid fa-database"></i>Use Current</button>` : ''}
      </div>
      <input type="file" id="compare-${side}-input" accept=".db,.sqlite,.sqlite3" class="hidden">
      <button class="toolbar-btn w-full" onclick="document.getElementById('compare-${side}-input').click()"><i class="fa-solid fa-upload"></i>Upload ${label}</button>
    </div>`;
}

async function loadCompareFile(file, side) {
  const validExts = ['.db', '.sqlite', '.sqlite3'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) return showToast('Choose a SQLite database file.', 'error');
  try {
    const buffer = await file.arrayBuffer();
    const db = new state.SQL.Database(new Uint8Array(buffer));
    const schema = extractSchema(db);
    db.close?.();
    state.compare[side] = { filename: file.name, size: file.size, ...schema };
    renderCompare();
  } catch (e) {
    showToast('Could not read comparison database: ' + e.message, 'error');
  }
}

function useCurrentForCompare() {
  if (!state.db) return;
  state.compare.left = {
    filename: state.dbFileName || 'Current database',
    size: state.dbFileSize,
    tables: [...state.tables],
    tableInfo: JSON.parse(JSON.stringify(state.tableInfo)),
    fkMap: JSON.parse(JSON.stringify(state.fkMap))
  };
  renderCompare();
}

function comparisonHTML() {
  const left = state.compare.left;
  const right = state.compare.right;
  if (!left || !right) return emptyState('Upload both databases to see schema differences.');
  const diff = compareSchemas(left, right);
  const tableDiffs = [
    ...diff.addedTables.map(t => diffRow('added', 'Added table', t, `${right.tableInfo[t].columns.length} columns`)),
    ...diff.removedTables.map(t => diffRow('removed', 'Removed table', t, `${left.tableInfo[t].columns.length} columns`)),
    ...diff.changedTables.map(item => diffRow('changed', 'Changed table', item.table, item.changes.join(', ')))
  ].join('');
  return `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
      ${statMini('Added', diff.addedTables.length, 'diff-added')}
      ${statMini('Removed', diff.removedTables.length, 'diff-removed')}
      ${statMini('Changed', diff.changedTables.length, 'diff-changed')}
      ${statMini('Unchanged', diff.unchangedTables.length, '')}
    </div>
    <div class="glass p-5">
      <div class="flex items-center justify-between gap-4 mb-4">
        <h3 class="font-display text-lg font-semibold">Schema Differences</h3>
        <button class="toolbar-btn" onclick="downloadCompareReport()"><i class="fa-solid fa-file-arrow-down"></i>Export JSON</button>
      </div>
      <div class="space-y-3">${tableDiffs || '<div class="text-sm text-muted">No schema differences found.</div>'}</div>
    </div>`;
}

function statMini(label, value, cls) {
  return `<div class="compare-card ${cls}"><div class="text-xs text-muted uppercase tracking-widest font-semibold">${label}</div><div class="font-display text-2xl font-bold mt-1">${value}</div></div>`;
}

function diffRow(kind, title, name, detail) {
  const cls = kind === 'added' ? 'diff-added' : kind === 'removed' ? 'diff-removed' : 'diff-changed';
  const icon = kind === 'added' ? 'fa-plus' : kind === 'removed' ? 'fa-minus' : 'fa-pen';
  return `
    <div class="compare-card ${cls}">
      <div class="flex items-start gap-3">
        <i class="fa-solid ${icon} mt-1"></i>
        <div class="min-w-0">
          <div class="text-xs text-muted uppercase tracking-widest font-semibold">${title}</div>
          <div class="font-display font-semibold mt-1">${escapeHtml(name)}</div>
          <div class="text-xs text-muted mt-1">${escapeHtml(detail)}</div>
        </div>
      </div>
    </div>`;
}

function compareSchemas(left, right) {
  const leftTables = new Set(left.tables);
  const rightTables = new Set(right.tables);
  const addedTables = right.tables.filter(t => !leftTables.has(t));
  const removedTables = left.tables.filter(t => !rightTables.has(t));
  const changedTables = [];
  const unchangedTables = [];
  left.tables.filter(t => rightTables.has(t)).forEach(table => {
    const changes = columnDiffs(left.tableInfo[table].columns, right.tableInfo[table].columns);
    if (changes.length) changedTables.push({ table, changes });
    else unchangedTables.push(table);
  });
  return { addedTables, removedTables, changedTables, unchangedTables };
}

function columnDiffs(leftColumns, rightColumns) {
  const leftMap = Object.fromEntries(leftColumns.map(c => [c.name, c]));
  const rightMap = Object.fromEntries(rightColumns.map(c => [c.name, c]));
  const changes = [];
  Object.keys(rightMap).filter(c => !leftMap[c]).forEach(c => changes.push(`added column ${c}`));
  Object.keys(leftMap).filter(c => !rightMap[c]).forEach(c => changes.push(`removed column ${c}`));
  Object.keys(leftMap).filter(c => rightMap[c]).forEach(c => {
    const a = leftMap[c];
    const b = rightMap[c];
    if ((a.type || 'ANY') !== (b.type || 'ANY') || !!a.pk !== !!b.pk || !!a.notnull !== !!b.notnull) changes.push(`changed column ${c}`);
  });
  return changes;
}

function downloadCompareReport() {
  const left = state.compare.left;
  const right = state.compare.right;
  if (!left || !right) return;
  const report = {
    left: left.filename,
    right: right.filename,
    generatedAt: new Date().toISOString(),
    diff: compareSchemas(left, right)
  };
  downloadFile(JSON.stringify(report, null, 2), 'db-lens-schema-comparison.json', 'application/json');
}

function exportCSV(tableName) {
  try {
    const r = state.db.exec(`SELECT * FROM ${quoteIdent(tableName)}`);
    if (r.length === 0) {
      showToast('Table is empty', 'info');
      return;
    }
    const cols = r[0].columns;
    const rows = r[0].values;
    let csv = cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(v => {
        if (v === null) return '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',') + '\n';
    });
    downloadFile(csv, `${tableName}.csv`, 'text/csv');
    showToast(`Exported ${rows.length} rows as CSV`, 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

function exportJSON(tableName) {
  try {
    const r = state.db.exec(`SELECT * FROM ${quoteIdent(tableName)}`);
    if (r.length === 0) {
      showToast('Table is empty', 'info');
      return;
    }
    const cols = r[0].columns;
    const rows = r[0].values.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    downloadFile(JSON.stringify(rows, null, 2), `${tableName}.json`, 'application/json');
    showToast(`Exported ${rows.length} rows as JSON`, 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

function safeFileStem(name) {
  return (name || 'database').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'database';
}

function schemaReportLines() {
  const lines = [`DB Lens schema report`, `Database: ${state.dbFileName || 'Untitled'}`, `Tables: ${state.tables.length}`, `Generated: ${new Date().toLocaleString()}`, ''];
  state.tables.forEach(table => {
    const info = state.tableInfo[table];
    lines.push(`${table} (${info.rowCount} rows)`);
    info.columns.forEach(column => lines.push(`  ${column.name} ${column.type || 'ANY'}${column.pk ? ' primary key' : ''}${column.notnull ? ' not null' : ''}`));
    info.fks.forEach(fk => lines.push(`  foreign key ${fk.from} -> ${fk.table}.${fk.to}`));
    lines.push('');
  });
  return lines;
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '');
}

function buildPdfBlob(lines) {
  const pageLines = [];
  for (let i = 0; i < lines.length; i += 46) pageLines.push(lines.slice(i, i + 46));
  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length;
  };
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  pageLines.forEach(page => {
    const stream = `BT /F1 10 Tf 13 TL 50 790 Td ${page.map(line => `(${pdfEscape(line).slice(0, 96)}) Tj T*`).join(' ')} ET`;
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadFile(content, filename, mimeType) {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

function loadSampleDatabase() {
  document.getElementById('loading-overlay').classList.remove('hidden');
  setTimeout(async () => {
    try {
      const db = new state.SQL.Database();
      db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE, role TEXT, department TEXT, salary REAL, created_at TEXT DEFAULT (datetime('now')))`);
      db.run(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, owner_id INTEGER REFERENCES users(id), status TEXT, budget REAL, start_date TEXT, end_date TEXT)`);
      db.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER REFERENCES projects(id), assignee_id INTEGER REFERENCES users(id), title TEXT NOT NULL, priority TEXT, status TEXT, hours_spent REAL, due_date TEXT)`);
      db.run(`CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER REFERENCES tasks(id), user_id INTEGER REFERENCES users(id), body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`);
      const users = [
        ['Alice Chen','alice@company.com','admin','Engineering',125000],
        ['Bob Martinez','bob@company.com','lead','Engineering',110000],
        ['Carol Davis','carol@company.com','developer','Engineering',95000],
        ['Eve Johnson','eve@company.com','designer','Design',88000],
        ['Grace Kim','grace@company.com','manager','Product',115000],
        ['Henry Park','henry@company.com','analyst','Analytics',90000]
      ];
      users.forEach(u => db.run('INSERT INTO users (name,email,role,department,salary) VALUES (?,?,?,?,?)', u));
      const projects = [
        ['Platform Redesign',1,'active',250000,'2026-01-15','2026-06-30'],
        ['Mobile App v2',2,'active',180000,'2026-02-01','2026-08-15'],
        ['Data Pipeline',5,'planning',120000,'2026-03-01','2026-09-30']
      ];
      projects.forEach(p => db.run('INSERT INTO projects (name,owner_id,status,budget,start_date,end_date) VALUES (?,?,?,?,?,?)', p));
      const priorities = ['low','medium','high','critical'];
      const statuses = ['open','in_progress','review','done'];
      const titles = ['Set up component library','Design login flow','Implement auth API','Write unit tests','Create database schema','Build search feature','Optimize queries','Design settings page','Implement notifications','Add export feature','Build reporting module','Add audit log'];
      titles.forEach((title, i) => {
        db.run('INSERT INTO tasks (project_id,assignee_id,title,priority,status,hours_spent,due_date) VALUES (?,?,?,?,?,?,?)', [(i % 3) + 1, (i % 6) + 1, title, priorities[i % priorities.length], statuses[i % statuses.length], Math.round(Math.random() * 40 * 10) / 10, `2026-${String((i % 6) + 4).padStart(2,'0')}-${String((i % 28) + 1).padStart(2,'0')}`]);
      });
      const notes = ['This looks good, approved.','Can we add more detail here?','Fixed the issue, please review.','Blocked by dependency update.','Added test coverage for this.','Needs design review before merging.'];
      for (let i = 1; i <= 12; i++) {
        db.run('INSERT INTO comments (task_id,user_id,body) VALUES (?,?,?)', [i, (i % 6) + 1, notes[i % notes.length]]);
      }
      const sampleBytes = db.export();
      const sampleBuffer = sampleBytes.buffer.slice(sampleBytes.byteOffset, sampleBytes.byteOffset + sampleBytes.byteLength);
      await loadDatabase(db, { filename: 'sample_company.db', size: sampleBuffer.byteLength });
      if (state.profile.preferences.autoSaveUploads) {
        try {
          await saveDatabaseFile(sampleBuffer, { filename: 'sample_company.db', size: sampleBuffer.byteLength });
          showToast('Sample database loaded and saved locally', 'success');
        } catch (storageError) {
          state.currentDbId = null;
          state.currentDbMeta = null;
          localStorage.removeItem(STORAGE_KEYS.currentDbId);
          showToast('Sample loaded, but browser storage is full or unavailable.', 'error');
          console.error(storageError);
        }
      } else {
        showToast('Sample database loaded', 'success');
      }
    } catch (e) {
      document.getElementById('loading-overlay').classList.add('hidden');
      showToast('Failed to create sample database', 'error');
      console.error(e);
    }
  }, 300);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeInspector();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
    e.preventDefault();
    goBack();
  }
});

async function init() {
  loadProfile();
  applyTheme();
  updateProfileChrome();
  renderProfileSetupPrompt();
  await initSQL();
  setupFileHandlers();
  try {
    await openClientStore();
    await refreshSavedDatabases();
    const lastDbId = localStorage.getItem(STORAGE_KEYS.currentDbId);
    if (lastDbId && state.profile.preferences.reopenLast) {
      await loadSavedDatabase(lastDbId, { silent: true });
    } else {
      renderUploadSavedDatabases();
    }
  } catch (e) {
    state.storageReady = false;
    renderUploadSavedDatabases();
    showToast('IndexedDB is unavailable. Saved database history is disabled.', 'error');
    console.error(e);
  }
  if (state.profile.preferences.compactRows) state.pageSize = 100;
}

init();

