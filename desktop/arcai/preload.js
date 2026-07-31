const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcaiDesktop", {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke("arcai:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("arcai:window:toggle-maximize"),
    close: () => ipcRenderer.invoke("arcai:window:close"),
  },
  notifications: {
    getDeviceId: () => ipcRenderer.invoke("arcai:notifications:device-id"),
    enable: () => ipcRenderer.invoke("arcai:notifications:enable"),
    show: (payload) => ipcRenderer.invoke("arcai:notifications:show", payload),
  },
});
