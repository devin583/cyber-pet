const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  init: () => ipcRenderer.invoke('init'),
  listPacks: () => ipcRenderer.invoke('list-packs'),
  setIgnore: flag => ipcRenderer.send('set-ignore', flag),
  setFocusable: flag => ipcRenderer.send('set-focusable', flag),
  hitokoto: () => ipcRenderer.invoke('hitokoto'),
  aiChat: text => ipcRenderer.invoke('ai-chat', text),
  weather: () => ipcRenderer.invoke('weather'),
  updateSettings: partial => ipcRenderer.send('update-settings', partial),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  openPacks: () => ipcRenderer.send('open-packs'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
  openSpecDoc: () => ipcRenderer.send('open-spec-doc'),
  openIntegrationsDoc: () => ipcRenderer.send('open-integrations-doc'),
  packPreviews: () => ipcRenderer.invoke('pack-previews'),
  importPack: () => ipcRenderer.invoke('import-pack'),
  ready: () => ipcRenderer.send('ready'),
  onReminder: cb => ipcRenderer.on('reminder', (_e, data) => cb(data)),
  onChime: cb => ipcRenderer.on('chime', (_e, hour) => cb(hour)),
  onSay: cb => ipcRenderer.on('say', (_e, text) => cb(text)),
  onSysIdle: cb => ipcRenderer.on('sys-idle', (_e, sec) => cb(sec)),
  onPack: cb => ipcRenderer.on('pack', (_e, pack) => cb(pack)),
  onSettings: cb => ipcRenderer.on('settings', (_e, s) => cb(s))
});
