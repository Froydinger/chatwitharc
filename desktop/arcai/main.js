const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow, globalShortcut, screen, dialog, shell, Menu, session, systemPreferences } = require("electron");
const { autoUpdater } = require("electron-updater");

const ARC_URL = "https://askarc.chat";
const APP_NAME = "ArcAI";
const DOWNLOADS_URL = `${ARC_URL}/downloads`;
const SHORTCUT = "Control+Alt+Space";
const WINDOW_ICON = path.join(__dirname, "assets", "icon.png");
const DESKTOP_AUTH_PORT = 48879;

app.setName(APP_NAME);

let floating = null;
let full = null;
let lastBounds = null;
let showedWelcome = false;
let checkingForUpdate = false;
let authServer = null;

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

function isAuthUrl(value = "") {
  try {
    const url = new URL(value);
    return (
      url.hostname === "accounts.google.com" ||
      url.hostname === "oauth2.googleapis.com" ||
      url.hostname.endsWith(".supabase.co") ||
      (url.hostname === "askarc.chat" && (url.hash.includes("access_token") || url.searchParams.has("code")))
    );
  } catch (_) {
    return false;
  }
}

function isDesktopAuthCallback(value = "") {
  try {
    const url = new URL(value);
    return TRUSTED_ORIGINS.has(url.origin) && url.pathname === "/desktop-auth-callback";
  } catch (_) {
    return false;
  }
}

function loadAuthCallbackInApp(href) {
  let target = ARC_URL;
  try {
    const url = new URL(href);
    if (url.hash.includes("access_token")) {
      target = `${ARC_URL}/${url.hash}`;
    }
  } catch (_) {
    target = ARC_URL;
  }

  for (const win of [full, floating]) {
    if (!win || win.isDestroyed()) continue;
    win.loadURL(target).catch(() => {});
    win.show();
    win.focus();
  }
}

function startDesktopAuthBridge() {
  if (authServer) return;

  authServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", ARC_URL);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/auth-callback") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (typeof payload.href !== "string" || !isDesktopAuthCallback(payload.href)) {
          throw new Error("Invalid auth callback");
        }
        loadAuthCallbackInApp(payload.href);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error("Desktop auth callback failed:", error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
      }
    });
  });

  authServer.listen(DESKTOP_AUTH_PORT, "127.0.0.1", () => {
    console.log(`ArcAI desktop auth bridge listening on ${DESKTOP_AUTH_PORT}`);
  });
  authServer.on("error", (error) => {
    console.error("Desktop auth bridge failed:", error);
  });
}

async function checkForUpdates({ quiet = false } = {}) {
  if (checkingForUpdate) return;
  checkingForUpdate = true;

  try {
    if (!app.isPackaged) {
      if (!quiet) {
        await dialog.showMessageBox({
          type: "info",
          title: "Updates are checked in the installed app",
          message: "Updates are checked in the installed app",
          detail: "Run the signed ArcAI app from Applications to test the update installer flow.",
          buttons: ["OK"]
        });
      }
      return;
    }

    const updateCheck = await autoUpdater.checkForUpdates();
    const updateInfo = updateCheck?.updateInfo;

    if (!updateInfo?.version) {
      throw new Error("No update metadata returned");
    }

    if (updateInfo.version === app.getVersion()) {
      if (!quiet) {
        await dialog.showMessageBox({
          type: "info",
          title: "ArcAI is up to date",
          message: "ArcAI is up to date",
          detail: `You're running ArcAI ${app.getVersion()}.`,
          buttons: ["OK"]
        });
      }
      return;
    }

    const choice = await dialog.showMessageBox({
      type: "info",
      title: "ArcAI update available",
      message: `ArcAI ${updateInfo.version} is available`,
      detail: `You're running ${app.getVersion()}. ArcAI will download the update, install it, and restart into the new version.`,
      buttons: ["Install and Restart", "Later"],
      defaultId: 0,
      cancelId: 1
    });

    if (choice.response === 0) {
      await autoUpdater.downloadUpdate();
      const ready = await dialog.showMessageBox({
        type: "info",
        title: "ArcAI update ready",
        message: "ArcAI update ready",
        detail: "ArcAI will restart now to finish installing the update.",
        buttons: ["Restart Now"],
        defaultId: 0
      });
      if (ready.response === 0) autoUpdater.quitAndInstall(false, true);
    }
  } catch (error) {
    console.error("Update check failed:", error);
    if (!quiet) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Couldn't check for updates",
        message: "Couldn't check for updates",
        detail: "ArcAI couldn't reach the updater feed. You can still install the newest build from the downloads page.",
        buttons: ["Open Downloads", "OK"],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) shell.openExternal(DOWNLOADS_URL);
      });
    }
  } finally {
    checkingForUpdate = false;
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
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
    if (isAuthUrl(url)) {
      shell.openExternal(url);
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    if (isAuthUrl(url)) {
      shell.openExternal(url);
    } else {
      shell.openExternal(url);
    }
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
    icon: WINDOW_ICON,
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
    icon: WINDOW_ICON,
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
  configureAutoUpdater();
  configurePermissions();
  startDesktopAuthBridge();
  globalShortcut.register(SHORTCUT, toggleFloating);
  showFull();
  showWelcomeOnce();
});

app.on("activate", showFull);

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("will-quit", () => {
  if (authServer) authServer.close();
  globalShortcut.unregisterAll();
});
