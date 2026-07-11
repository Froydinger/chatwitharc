const { app, BrowserWindow, globalShortcut, screen, dialog, shell, Menu, session, systemPreferences } = require("electron");

const ARC_URL = "https://askarc.chat";
const APP_NAME = "ArcAI";
const RELEASES_API_URL = "https://api.github.com/repos/Froydinger/chatwitharc/releases/latest";
const DOWNLOADS_URL = `${ARC_URL}/downloads`;
const SHORTCUT = "Control+Alt+Space";

app.setName(APP_NAME);

let floating = null;
let full = null;
let lastBounds = null;
let showedWelcome = false;

const TRUSTED_ORIGINS = new Set([
  new URL(ARC_URL).origin,
  "https://chatwitharc.com",
  "https://www.chatwitharc.com"
]);

function isTrustedUrl(value = "") {
  try {
    return TRUSTED_ORIGINS.has(new URL(value).origin);
  } catch (_) {
    return false;
  }
}

function compareVersions(a, b) {
  const left = String(a).replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b).replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function getPlatformAsset(assets = []) {
  const patterns = process.platform === "darwin"
    ? [/arm64\.dmg$/i, /\.dmg$/i]
    : [/setup.*\.exe$/i, /\.exe$/i];

  for (const pattern of patterns) {
    const match = assets.find((asset) => pattern.test(asset.name || ""));
    if (match?.browser_download_url) return match;
  }

  return null;
}

async function checkForUpdates({ quiet = false } = {}) {
  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ArcAI-Desktop"
      }
    });

    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const latest = await response.json();
    const latestVersion = String(latest.tag_name || "").replace(/^v/i, "");
    const currentVersion = app.getVersion();

    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
      if (!quiet) {
        await dialog.showMessageBox({
          type: "info",
          title: "ArcAI is up to date",
          message: "ArcAI is up to date",
          detail: `You're running ArcAI ${currentVersion}.`,
          buttons: ["OK"]
        });
      }
      return;
    }

    const asset = getPlatformAsset(latest.assets);
    const result = await dialog.showMessageBox({
      type: "info",
      title: "ArcAI update available",
      message: `ArcAI ${latestVersion} is available`,
      detail: `You're running ${currentVersion}. Download the latest installer now?`,
      buttons: ["Download Update", "View Downloads", "Later"],
      defaultId: 0,
      cancelId: 2
    });

    if (result.response === 0) {
      shell.openExternal(asset?.browser_download_url || DOWNLOADS_URL);
    } else if (result.response === 1) {
      shell.openExternal(DOWNLOADS_URL);
    }
  } catch (error) {
    if (!quiet) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Couldn't check for updates",
        message: "Couldn't check for updates",
        detail: "ArcAI couldn't reach the release feed. You can still check the downloads page.",
        buttons: ["Open Downloads", "OK"],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) shell.openExternal(DOWNLOADS_URL);
      });
    }
  }
}

function installMenu() {
  const appMenu = process.platform === "darwin"
    ? [{
        label: APP_NAME,
        submenu: [
          { label: `About ${APP_NAME}`, role: "about" },
          { type: "separator" },
          { label: "Check for Updates...", click: () => checkForUpdates() },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { label: `Hide ${APP_NAME}`, role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { label: `Quit ${APP_NAME}`, role: "quit" }
        ]
      }]
    : [];

  const template = [
    ...appMenu,
    {
      label: "File",
      submenu: [
        { label: "New Chat", accelerator: "CmdOrCtrl+N", click: showFull },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit", label: `Quit ${APP_NAME}` }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { label: "Open Floating ArcAI", accelerator: SHORTCUT, click: toggleFloating },
        { label: "Open Full ArcAI", click: showFull }
      ]
    },
    {
      label: "Help",
      submenu: [
        { label: "Check for Updates...", click: () => checkForUpdates() },
        { label: "Downloads", click: () => shell.openExternal(DOWNLOADS_URL) }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function requestMacMediaAccess(mediaTypes = []) {
  if (process.platform !== "darwin") return true;

  const prompts = [];
  if (mediaTypes.includes("audio")) prompts.push(systemPreferences.askForMediaAccess("microphone"));
  if (mediaTypes.includes("video")) prompts.push(systemPreferences.askForMediaAccess("camera"));
  if (prompts.length === 0) return true;

  try {
    const results = await Promise.all(prompts);
    return results.every(Boolean);
  } catch (_) {
    return false;
  }
}

function configurePermissions() {
  const allowedPermissions = new Set([
    "clipboard-read",
    "clipboard-sanitized-write",
    "display-capture",
    "fullscreen",
    "geolocation",
    "media",
    "mediaKeySystem",
    "midi",
    "midiSysex",
    "notifications",
    "pointerLock",
    "speaker-selection",
    "storage-access",
    "window-management"
  ]);

  session.defaultSession.setPermissionRequestHandler(async (webContents, permission, callback, details = {}) => {
    const requestUrl = details.requestingUrl || webContents.getURL();
    if (!isTrustedUrl(requestUrl) || !allowedPermissions.has(permission)) {
      callback(false);
      return;
    }

    if (permission === "media") {
      const granted = await requestMacMediaAccess(details.mediaTypes || []);
      callback(granted);
      return;
    }

    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => {
    const requestUrl = requestingOrigin || details.requestingUrl || webContents?.getURL();
    return isTrustedUrl(requestUrl) && allowedPermissions.has(permission);
  });
}

function focusInput(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(
    "setTimeout(()=>{const i=document.querySelector('textarea,input');if(i){i.focus()}},250)"
  ).catch(() => {});
}

function addDragZone(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(
    "(()=>{if(document.getElementById('arcai-desktop-drag-zone'))return;const d=document.createElement('div');d.id='arcai-desktop-drag-zone';d.style.position='fixed';d.style.top='0';d.style.left='0';d.style.right='0';d.style.height='34px';d.style.webkitAppRegion='drag';d.style.zIndex='9999';d.style.pointerEvents='none';document.body.appendChild(d)})()"
  ).catch(() => {});
}

function attachWindowHandlers(win, shouldFocusInput = false) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.once("did-finish-load", () => {
    addDragZone(win);
    if (shouldFocusInput) focusInput(win);
  });
}

function createFloating() {
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.floor(display.width * (process.platform === "win32" ? 0.26 : 0.22));
  const height = Math.floor(display.height * 0.70);

  let x = Math.floor((display.width - width) / 2);
  let y = Math.floor(display.height * 0.30);

  if (lastBounds) {
    x = lastBounds.x;
    y = lastBounds.y;
  }

  floating = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 10 } : undefined,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    backgroundColor: "#0f1116",
    webPreferences: {
      contextIsolation: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  floating.loadURL(ARC_URL);
  attachWindowHandlers(floating, true);

  floating.on("move", () => {
    lastBounds = floating.getBounds();
  });

  floating.on("closed", () => {
    floating = null;
  });
}

function toggleFloating() {
  if (!floating) {
    createFloating();
    return;
  }

  if (floating.isVisible()) {
    floating.hide();
  } else {
    floating.show();
    floating.focus();
    focusInput(floating);
  }
}

function createFull() {
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.floor(display.width * 0.75);
  const height = Math.floor(display.height * 0.85);
  const x = Math.floor((display.width - width) / 2);
  const y = Math.floor((display.height - height) / 2);

  full = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: process.platform === "darwin" ? false : true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 10 } : undefined,
    resizable: true,
    movable: true,
    backgroundColor: "#0f1116",
    webPreferences: {
      contextIsolation: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  full.loadURL(ARC_URL);
  attachWindowHandlers(full);

  full.on("closed", () => {
    full = null;
  });
}

function showFull() {
  if (!full) {
    createFull();
  } else {
    full.show();
    full.focus();
  }
}

function showWelcomeOnce() {
  if (showedWelcome) return;
  showedWelcome = true;
  dialog.showMessageBox({
    type: "info",
    title: `${APP_NAME} Desktop`,
    message: "Welcome to ArcAI",
    detail: `Press ${process.platform === "darwin" ? "Control + Option + Space" : "Control + Alt + Space"} to open the floating assistant anywhere.\n\nUse File > New Chat for a fresh chat, Window > Open Full ArcAI for the full app, and ArcAI > Check for Updates when you want the newest build.`,
    buttons: ["OK"]
  }).catch(() => {});
}

app.whenReady().then(() => {
  installMenu();
  configurePermissions();
  globalShortcut.register(SHORTCUT, toggleFloating);
  showFull();
  showWelcomeOnce();
});

app.on("activate", showFull);

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
