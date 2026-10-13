'use strict';
// Gives the game's pages a small, fixed set of update calls as window.snowdayDesktop. The page
// never gets Node or Electron itself. The browser versions of the game have no snowdayDesktop,
// so their menus simply show no Update item.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'snowday:') {
  const listeners = new Set();
  ipcRenderer.on('snowday:update-status', (_e, s) => {
    for (const fn of listeners) {
      try {
        fn(s);
      } catch (err) {
        console.error(err);
      }
    }
  });
  contextBridge.exposeInMainWorld('snowdayDesktop', {
    updates: {
      status: () => ipcRenderer.invoke('snowday:update-status'),
      check: () => ipcRenderer.invoke('snowday:update-check'),
      install: () => ipcRenderer.invoke('snowday:update-install'),
      seen: () => ipcRenderer.invoke('snowday:update-seen'),
      getApp: () => ipcRenderer.invoke('snowday:get-app'),
      onStatus(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  });
}
