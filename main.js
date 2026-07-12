const { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification, powerMonitor, shell, nativeImage, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');

const SMOKE = process.argv.includes('--smoke');

const DEFAULT_SETTINGS = {
  pack: 'default',
  scale: 1,
  waterReminder: false,
  sitReminder: false,
  reminderAnimation: true,
  waterIntervalMin: 60,
  sitIntervalMin: 45,
  chimeHourly: false,
  openAtLogin: false,
  weatherCity: '',      // 空 = 按 IP 定位;可填城市名,如 "Beijing"
  localApi: true,       // 本地通知 API 开关
  apiPort: 12580,       // http://127.0.0.1:12580/say?text=...
  aiEnabled: false,     // AI 聊天(可选):任意 OpenAI 兼容接口
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini'
};

let win = null;
let tray = null;
let settings = { ...DEFAULT_SETTINGS };
let currentPack = null;
let hidden = false;

// ---------- 路径 ----------

function builtinPacksDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'packs') : path.join(__dirname, 'packs');
}

function userPacksDir() {
  return path.join(app.getPath('userData'), 'packs');
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// ---------- 设置 ----------

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

// ---------- 素材包 ----------

function listPacks() {
  const map = new Map(); // 用户目录同名包覆盖内置包
  for (const base of [builtinPacksDir(), userPacksDir()]) {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(base, ent.name);
      const cfgPath = path.join(dir, 'pack.json');
      if (!fs.existsSync(cfgPath)) continue;
      let name = ent.name;
      try { name = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).name || ent.name; } catch {}
      map.set(ent.name, { id: ent.name, name, dir });
    }
  }
  return [...map.values()];
}

function loadPack(id) {
  const packs = listPacks();
  const meta = packs.find(p => p.id === id) || packs.find(p => p.id === 'default') || packs[0];
  if (!meta) {
    console.error('找不到任何素材包');
    return null;
  }
  try {
    const config = JSON.parse(fs.readFileSync(path.join(meta.dir, 'pack.json'), 'utf8'));
    if (!config.states || !config.states.idle) {
      throw new Error('素材包缺少必需的 idle 状态');
    }
    currentPack = { id: meta.id, dir: meta.dir, config };
    settings.pack = meta.id;
    return currentPack;
  } catch (e) {
    console.error(`加载素材包 ${meta.id} 失败:`, e.message);
    if (meta.id !== 'default') return loadPack('default');
    return null;
  }
}

// ---------- 窗口 ----------

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE) {
    win.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message);
    });
  }

  screen.on('display-metrics-changed', fitToWorkArea);
  screen.on('display-added', fitToWorkArea);
  screen.on('display-removed', fitToWorkArea);
}

function fitToWorkArea() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds(workArea);
}

// ---------- 设置窗口 ----------

let settingsWin = null;

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 700,
    height: 620,
    title: 'CyberPet 设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function broadcast(channel, data) {
  for (const w of [win, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, data);
  }
}

// ---------- 托盘 ----------

function buildTrayMenu() {
  const packs = listPacks();
  const menu = Menu.buildFromTemplate([
    {
      label: hidden ? '召唤桌宠' : '隐藏桌宠',
      click: () => toggleHidden()
    },
    { type: 'separator' },
    {
      label: '素材包',
      submenu: packs.map(p => ({
        label: p.name,
        type: 'radio',
        checked: currentPack && currentPack.id === p.id,
        click: () => switchPack(p.id)
      }))
    },
    {
      label: '大小',
      submenu: [
        { label: '小', type: 'radio', checked: settings.scale === 0.75, click: () => applySettings({ scale: 0.75 }) },
        { label: '中', type: 'radio', checked: settings.scale === 1, click: () => applySettings({ scale: 1 }) },
        { label: '大', type: 'radio', checked: settings.scale === 1.5, click: () => applySettings({ scale: 1.5 }) }
      ]
    },
    { type: 'separator' },
    {
      label: `喝水提醒(每 ${settings.waterIntervalMin} 分钟)`,
      type: 'checkbox',
      checked: settings.waterReminder,
      click: item => applySettings({ waterReminder: item.checked })
    },
    {
      label: `久坐提醒(每 ${settings.sitIntervalMin} 分钟)`,
      type: 'checkbox',
      checked: settings.sitReminder,
      click: item => applySettings({ sitReminder: item.checked })
    },
    {
      label: '整点报时',
      type: 'checkbox',
      checked: settings.chimeHourly,
      click: item => applySettings({ chimeHourly: item.checked })
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: settings.openAtLogin,
      click: item => applySettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    {
      label: '导入素材包…',
      click: async () => {
        const r = await importPackInteractive();
        if (win) win.webContents.send('say', r.msg);
      }
    },
    { label: '打开素材包文件夹', click: openPacksFolder },
    { label: '设置…', click: openSettingsWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', 'tray.png'))
    .resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('CyberPet 桌宠');
  tray.on('click', () => { if (hidden) toggleHidden(); });
  buildTrayMenu();
}

function toggleHidden() {
  hidden = !hidden;
  if (hidden) win.hide();
  else win.showInactive();
  buildTrayMenu();
}

// ---------- 设置应用 ----------

function applySettings(partial) {
  const packChanged = partial.pack && partial.pack !== settings.pack;
  Object.assign(settings, partial);
  if ('openAtLogin' in partial) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  }
  if (packChanged) {
    loadPack(settings.pack);
    broadcast('pack', currentPack);
  }
  if ('localApi' in partial || 'apiPort' in partial) startApiServer();
  persistSettings();
  broadcast('settings', settings);
  buildTrayMenu();
}

function switchPack(id) {
  applySettings({ pack: id });
}

function openPacksFolder() {
  const dir = userPacksDir();
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
}

function openSettingsFile() {
  persistSettings();
  shell.openPath(settingsFile());
}

// 设置文件被手动编辑后自动重载
function watchSettingsFile() {
  persistSettings();
  let timer = null;
  try {
    fs.watch(settingsFile(), () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const oldPack = settings.pack;
        loadSettings();
        if (settings.pack !== oldPack) {
          loadPack(settings.pack);
          broadcast('pack', currentPack);
        }
        startApiServer();
        broadcast('settings', settings);
        buildTrayMenu();
      }, 300);
    });
  } catch (e) {
    console.error('监听设置文件失败:', e.message);
  }
}

// ---------- 联网趣味内容(失败一律返回 null,由渲染进程降级) ----------

function httpRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 6000 } = {}) {
  return new Promise(resolve => {
    try {
      const req = net.request({ url, method });
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
      const timer = setTimeout(() => { try { req.abort(); } catch {} resolve(null); }, timeoutMs);
      req.on('response', res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => { clearTimeout(timer); resolve(data); });
        res.on('error', () => { clearTimeout(timer); resolve(null); });
      });
      req.on('error', () => { clearTimeout(timer); resolve(null); });
      if (body) req.write(body);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

const fetchText = (url, timeoutMs = 6000) => httpRequest(url, { timeoutMs });

// AI 聊天:任意 OpenAI 兼容接口(OpenAI / DeepSeek / Moonshot / 本地 Ollama…)
// 未启用或未配 key 时返回 null,渲染进程回落到免费的本地规则引擎
ipcMain.handle('ai-chat', async (_e, text) => {
  if (!settings.aiEnabled || !settings.aiApiKey) return null;
  const cfg = currentPack && currentPack.config;
  const persona = (cfg && cfg.persona) ||
    `你是一只名叫「${(cfg && cfg.name) || '团子'}」的桌面宠物猫,性格活泼可爱`;
  const body = JSON.stringify({
    model: settings.aiModel,
    max_tokens: 150,
    temperature: 0.9,
    messages: [
      {
        role: 'system',
        content: `${persona}。你趴在主人的电脑屏幕上陪伴他。用中文口语回复,一两句话,俏皮但不做作,` +
          '偶尔可以用"喵"收尾。不要用列表、markdown 或过长的说教。'
      },
      { role: 'user', content: String(text).slice(0, 500) }
    ]
  });
  const raw = await httpRequest(settings.aiBaseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
    body,
    timeoutMs: 20000
  });
  try {
    const j = JSON.parse(raw);
    if (j.error) return { error: j.error.message || String(j.error) };
    const reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return reply ? { reply: reply.trim() } : null;
  } catch {
    return null;
  }
});

// 一言:动画/文学/影视/诗词/哲学等分类的短句
ipcMain.handle('hitokoto', async () => {
  const raw = await fetchText('https://v1.hitokoto.cn/?c=a&c=b&c=d&c=i&c=j&c=k');
  try {
    const j = JSON.parse(raw);
    return { text: j.hitokoto, from: j.from || j.from_who || '' };
  } catch {
    return null;
  }
});

// 天气:wttr.in,免 key;settings.weatherCity 为空时按 IP 定位
ipcMain.handle('weather', async () => {
  const city = encodeURIComponent(settings.weatherCity || '');
  const raw = await fetchText(`https://wttr.in/${city}?format=%l:+%c+%t+湿度%h+%w&lang=zh-cn&m`);
  if (!raw || raw.length > 140 || /error|unknown|sorry/i.test(raw)) return null;
  return raw.trim();
});

// ---------- 素材包导入 ----------

function importPackFrom(src) {
  fs.mkdirSync(userPacksDir(), { recursive: true });
  let srcDir = src;
  let tmp = null;
  if (/\.zip$/i.test(src)) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpet-'));
    // Win10+ 与 macOS 都自带 bsdtar,可直接解 zip,无需第三方依赖
    const r = spawnSync('tar', ['-xf', src, '-C', tmp]);
    if (r.status !== 0) throw new Error('解压失败,请确认 zip 有效');
    srcDir = tmp;
  }
  // pack.json 可能在根目录,也可能在 zip 里的唯一子目录
  if (!fs.existsSync(path.join(srcDir, 'pack.json'))) {
    const hit = fs.readdirSync(srcDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('__MACOSX') && !d.name.startsWith('.'))
      .find(d => fs.existsSync(path.join(srcDir, d.name, 'pack.json')));
    if (!hit) throw new Error('找不到 pack.json');
    srcDir = path.join(srcDir, hit.name);
  }
  const config = JSON.parse(fs.readFileSync(path.join(srcDir, 'pack.json'), 'utf8'));
  if (!config.states || !config.states.idle) throw new Error('pack.json 缺少必需的 idle 状态');
  const id = String(config.name || path.basename(srcDir)).replace(/[\\/:*?"<>|.\s]+/g, '-') || 'imported';
  fs.cpSync(srcDir, path.join(userPacksDir(), id), { recursive: true });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  return id;
}

async function importPackInteractive() {
  const properties = process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'];
  const r = await dialog.showOpenDialog({
    title: '选择素材包(zip 或文件夹)',
    properties,
    filters: [{ name: '素材包', extensions: ['zip'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, msg: '取消导入了~' };
  try {
    const id = importPackFrom(r.filePaths[0]);
    applySettings({ pack: id });
    return { ok: true, msg: `导入成功!已换上「${currentPack.config.name || id}」` };
  } catch (e) {
    return { ok: false, msg: '导入失败:' + e.message };
  }
}

ipcMain.handle('import-pack', importPackInteractive);

// ---------- 本地通知 API(127.0.0.1,供外部脚本接入) ----------

let apiServer = null;

function startApiServer() {
  if (apiServer) { try { apiServer.close(); } catch {} apiServer = null; }
  if (!settings.localApi) return;
  apiServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const params = Object.fromEntries(u.searchParams);
      try { if (body) Object.assign(params, JSON.parse(body)); } catch {}
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (u.pathname === '/say') {
        const text = String(params.text || '').slice(0, 200);
        if (text && win && !hidden) win.webContents.send('say', text);
        res.end('{"ok":true}');
      } else if (u.pathname === '/notify') {
        const title = String(params.title || 'CyberPet').slice(0, 60);
        const text = String(params.body || params.text || '').slice(0, 200);
        if (Notification.isSupported()) new Notification({ title, body: text }).show();
        if (win && !hidden) win.webContents.send('say', text ? `${title}:${text}` : title);
        res.end('{"ok":true}');
      } else {
        res.statusCode = 404;
        res.end('{"ok":false,"msg":"支持 /say 与 /notify"}');
      }
    });
  });
  apiServer.on('error', e => console.error('本地 API 启动失败:', e.message));
  apiServer.listen(settings.apiPort || 12580, '127.0.0.1');
}

// ---------- 提醒调度 ----------

const reminderClock = { water: Date.now(), sit: Date.now() };

const REMINDER_META = {
  water: { title: '喝水时间到 💧', fallback: '该喝水啦!休息一下吧~' },
  sit: { title: '久坐提醒 🧘', fallback: '坐太久啦,起来活动活动~' }
};

function pickReminderText(type) {
  const lines = currentPack?.config?.dialog?.[`reminder_${type}`];
  if (Array.isArray(lines) && lines.length) {
    return lines[Math.floor(Math.random() * lines.length)];
  }
  return REMINDER_META[type].fallback;
}

function startSchedulers() {
  setInterval(() => {
    const now = Date.now();
    const jobs = [
      ['water', settings.waterReminder, settings.waterIntervalMin],
      ['sit', settings.sitReminder, settings.sitIntervalMin]
    ];
    for (const [type, enabled, intervalMin] of jobs) {
      if (!enabled) { reminderClock[type] = now; continue; }
      if (now - reminderClock[type] >= intervalMin * 60000) {
        reminderClock[type] = now;
        fireReminder(type);
      }
    }
  }, 30000);

  // 系统空闲时间 → 渲染进程用来决定睡觉
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('sys-idle', powerMonitor.getSystemIdleTime());
    }
  }, 30000);

  // 整点报时
  let lastChimeHour = new Date().getHours();
  setInterval(() => {
    const d = new Date();
    if (settings.chimeHourly && d.getMinutes() === 0 && d.getHours() !== lastChimeHour) {
      lastChimeHour = d.getHours();
      if (win && !hidden) win.webContents.send('chime', d.getHours());
    }
  }, 20000);
}

function fireReminder(type, { preview = false } = {}) {
  const text = pickReminderText(type);
  if (win && !hidden) win.webContents.send('reminder', { type, text, preview });
  if (!preview && Notification.isSupported()) {
    new Notification({ title: REMINDER_META[type].title, body: text }).show();
  }
}

// ---------- IPC ----------

ipcMain.handle('init', () => ({
  pack: currentPack,
  settings,
  packs: listPacks()
}));

ipcMain.handle('list-packs', () => listPacks());

ipcMain.on('set-ignore', (_e, flag) => {
  if (win) win.setIgnoreMouseEvents(flag, { forward: true });
});

// 聊天输入框需要键盘焦点,平时窗口不可聚焦以免抢焦点
ipcMain.on('set-focusable', (_e, flag) => {
  if (!win) return;
  win.setFocusable(flag);
  if (flag) win.focus();
});

ipcMain.on('update-settings', (_e, partial) => applySettings(partial));

ipcMain.handle('preview-reminder', () => {
  if (!win || win.isDestroyed()) return false;
  if (hidden) {
    hidden = false;
    win.showInactive();
    buildTrayMenu();
  }
  fireReminder('water', { preview: true });
  return true;
});

ipcMain.on('reminder-action', (_e, { type, action, preview }) => {
  if (preview || action !== 'snooze' || !REMINDER_META[type]) return;
  const intervalMin = type === 'water' ? settings.waterIntervalMin : settings.sitIntervalMin;
  // 调整基准时钟，使下一次提醒恰好落在 10 分钟后。
  reminderClock[type] = Date.now() - intervalMin * 60000 + 10 * 60000;
});

ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

ipcMain.on('hide', () => { if (!hidden) toggleHidden(); });
ipcMain.on('open-packs', openPacksFolder);
ipcMain.on('open-settings', openSettingsFile);
ipcMain.on('open-settings-window', openSettingsWindow);

function openDoc(name) {
  const doc = app.isPackaged
    ? path.join(process.resourcesPath, 'docs', name)
    : path.join(__dirname, 'docs', name);
  shell.openPath(doc);
}

ipcMain.on('open-spec-doc', () => openDoc('asset-pack-spec.md'));
ipcMain.on('open-integrations-doc', () => openDoc('integrations.md'));

// 素材包卡片:名称、作者、预览图(idle 第一帧)
ipcMain.handle('pack-previews', () => listPacks().map(p => {
  let author = '', preview = null;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(p.dir, 'pack.json'), 'utf8'));
    author = c.author || '';
    const f = c.states && c.states.idle && c.states.idle.frames[0];
    if (f) preview = 'file://' + path.join(p.dir, f).replace(/\\/g, '/');
  } catch {}
  return { id: p.id, name: p.name, author, preview, active: currentPack && currentPack.id === p.id };
}));
ipcMain.on('quit', () => app.quit());

ipcMain.on('ready', () => {
  if (SMOKE) {
    console.log('[smoke] renderer ready, pack =', currentPack && currentPack.id);
    // 冒烟测试同时验证设置窗口能正常加载
    openSettingsWindow();
    settingsWin.webContents.on('console-message', (_e, _l, msg) => console.log('[settings]', msg));
    settingsWin.webContents.on('did-finish-load', () => console.log('[smoke] settings window loaded'));
    setTimeout(() => app.quit(), 2500);
  }
});

// ---------- 启动 ----------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (hidden) toggleHidden();
  });

  app.whenReady().then(() => {
    loadSettings();
    loadPack(settings.pack);
    createWindow();
    createTray();
    startSchedulers();
    startApiServer();
    watchSettingsFile();
  });
}

app.on('window-all-closed', () => app.quit());
