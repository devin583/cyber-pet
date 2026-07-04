const api = window.petAPI;

let settings = null;
let toastTimer = null;

function $(id) { return document.getElementById(id); }

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- 表单填充 ----------

function fillForm() {
  document.querySelectorAll('input[name="scale"]').forEach(r => {
    r.checked = parseFloat(r.value) === settings.scale;
  });
  for (const id of ['openAtLogin', 'waterReminder', 'sitReminder', 'chimeHourly', 'localApi']) {
    $(id).checked = !!settings[id];
  }
  for (const id of ['waterIntervalMin', 'sitIntervalMin', 'apiPort']) {
    $(id).value = settings[id];
  }
  $('aiEnabled').checked = !!settings.aiEnabled;
  for (const id of ['weatherCity', 'aiBaseUrl', 'aiApiKey', 'aiModel']) {
    $(id).value = settings[id] || '';
  }
  $('api-example').textContent =
    `curl "http://127.0.0.1:${settings.apiPort}/say?text=你好呀"\n` +
    `curl -X POST http://127.0.0.1:${settings.apiPort}/notify -d '{"title":"CI","body":"构建通过"}'`;
}

// ---------- 素材包卡片 ----------

async function renderPacks() {
  const packs = await api.packPreviews();
  const grid = $('packs');
  grid.innerHTML = '';
  for (const p of packs) {
    const card = document.createElement('div');
    card.className = 'pack-card' + (p.active ? ' active' : '');
    card.innerHTML = `
      ${p.preview ? `<img src="${p.preview}" alt="">` : '<div style="height:72px"></div>'}
      <div class="pname"></div>
      <div class="pauthor"></div>`;
    card.querySelector('.pname').textContent = p.name;
    card.querySelector('.pauthor').textContent = p.author || '';
    card.addEventListener('click', () => {
      if (!p.active) {
        api.updateSettings({ pack: p.id });
        toast(`已切换到「${p.name}」`);
      }
    });
    grid.appendChild(card);
  }
}

// ---------- 事件绑定 ----------

document.querySelectorAll('input[name="scale"]').forEach(r => {
  r.addEventListener('change', () => api.updateSettings({ scale: parseFloat(r.value) }));
});

for (const id of ['openAtLogin', 'waterReminder', 'sitReminder', 'chimeHourly', 'localApi', 'aiEnabled']) {
  $(id).addEventListener('change', e => api.updateSettings({ [id]: e.target.checked }));
}

for (const id of ['aiBaseUrl', 'aiApiKey', 'aiModel']) {
  $(id).addEventListener('change', e => api.updateSettings({ [id]: e.target.value.trim() }));
}

$('btn-ai-test').addEventListener('click', async () => {
  if (!$('aiEnabled').checked || !$('aiApiKey').value) {
    toast('请先勾选启用并填写 API Key');
    return;
  }
  toast('测试中…');
  const r = await api.aiChat('用一句话跟主人打个招呼');
  if (r && r.reply) toast('✅ 连接成功:' + r.reply.slice(0, 40));
  else if (r && r.error) toast('❌ 接口报错:' + r.error.slice(0, 60));
  else toast('❌ 连接失败:检查地址、Key 与网络');
});

for (const id of ['waterIntervalMin', 'sitIntervalMin', 'apiPort']) {
  $(id).addEventListener('change', e => {
    const v = parseInt(e.target.value, 10);
    if (!Number.isNaN(v)) api.updateSettings({ [id]: v });
  });
}

$('weatherCity').addEventListener('change', e => {
  api.updateSettings({ weatherCity: e.target.value.trim() });
  toast('天气城市已保存');
});

$('btn-import').addEventListener('click', async () => {
  const r = await api.importPack();
  toast(r.msg);
  renderPacks();
});

$('btn-open-packs').addEventListener('click', () => api.openPacks());
$('btn-spec').addEventListener('click', () => api.openSpecDoc());
$('btn-integrations').addEventListener('click', () => api.openIntegrationsDoc());
$('btn-settings-file').addEventListener('click', () => api.openSettings());

// 主进程广播的设置变化(托盘/右键菜单/手改文件)同步回表单
api.onSettings(s => {
  settings = s;
  fillForm();
  renderPacks();
});

// ---------- 启动 ----------

(async function init() {
  const data = await api.init();
  settings = data.settings;
  fillForm();
  renderPacks();
})();
