const { contextBridge, ipcRenderer } = require('electron');

// Preload for the first-run database setup page ONLY.
//
// Deliberately separate from the main preload.js: this window gets a three
// method surface and nothing else, so no part of the authenticated application
// API is reachable from the setup page. The main preload is never loaded here.
contextBridge.exposeInMainWorld('setup', {
  getDefaults: () => ipcRenderer.invoke('dbsetup:defaults'),
  testConnection: (config) => ipcRenderer.invoke('dbsetup:test', config),
  save: (config) => ipcRenderer.invoke('dbsetup:save', config),
  proceed: () => ipcRenderer.invoke('dbsetup:continue')
});
