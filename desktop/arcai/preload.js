const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcaiDesktop", {
  notifications: {
    getDeviceId: () => ipcRenderer.invoke("arcai:notifications:device-id"),
    enable: () => ipcRenderer.invoke("arcai:notifications:enable"),
    show: (payload) => ipcRenderer.invoke("arcai:notifications:show", payload),
  },
});
