import { existsSync } from "fs";
import { app, BrowserWindow, ipcMain, nativeImage, shell, dialog } from "electron";
import { join } from "path";
import { autoUpdater } from "electron-updater";
import { registerBundledRuntimeIpc, shutdownBundledStack } from "./bundled-runtime";
import { registerGitCloneIpc, registerPickDirectoryIpc } from "./git-clone-ipc";

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update available",
        message: `Open Conductor ${info.version} is available and downloading in the background.`,
        buttons: ["OK"],
      })
      .catch(console.error);
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update ready",
        message: "A new version has been downloaded. Restart to apply the update.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      })
      .catch(console.error);
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
  });

  // Check for updates after the window has been created (not in dev)
  if (!process.env["ELECTRON_RENDERER_URL"]) {
    autoUpdater.checkForUpdates().catch(console.error);
  }
}

/** Dev: repo `apps/desktop/resources/icon.png`. Packaged: copied to `Contents/Resources/icon.png`. */
function resolveAppIconPath(): string | undefined {
  const devPath = join(__dirname, "../../resources/icon.png");
  const packagedPath = join(process.resourcesPath, "icon.png");
  if (app.isPackaged) {
    if (existsSync(packagedPath)) return packagedPath;
    return undefined;
  }
  if (existsSync(devPath)) return devPath;
  return undefined;
}

/**
 * Dock tile when calling `app.dock.setIcon()` — prefer `icon-dock.png` (rounded alpha
 * from scripts/build-dock-icon.py) so the bitmap matches other squircle tiles; fall
 * back to `icon.png`.
 */
function resolveDockIconPath(): string | undefined {
  const devDir = join(__dirname, "../../resources");
  const dockName = "icon-dock.png";
  const plainName = "icon.png";
  const devDock = join(devDir, dockName);
  const devPlain = join(devDir, plainName);
  const packDock = join(process.resourcesPath, dockName);
  const packPlain = join(process.resourcesPath, plainName);
  if (app.isPackaged) {
    if (existsSync(packDock)) return packDock;
    if (existsSync(packPlain)) return packPlain;
    return undefined;
  }
  if (existsSync(devDock)) return devDock;
  if (existsSync(devPlain)) return devPlain;
  return undefined;
}

let mainWindow: BrowserWindow | null = null;

function sendFullscreenState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.webContents.send("open-conductor:fullscreen-changed", win.isFullScreen());
}

function createWindow(): void {
  const iconPath = resolveAppIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    transparent: true,
    backgroundColor: "#00000000",
    ...(process.platform === "win32"
      ? ({ backgroundMaterial: "acrylic" } as const)
      : {}),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow = win;

  win.on("enter-full-screen", () => sendFullscreenState(win));
  win.on("leave-full-screen", () => sendFullscreenState(win));
  win.webContents.on("did-finish-load", () => sendFullscreenState(win));

  // Open external links in browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(console.error);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]).catch(console.error);
    // Open DevTools automatically in dev mode
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html")).catch(console.error);
  }
}

let isHandlingBundledQuit = false;

app.whenReady().then(() => {
  ipcMain.handle("open-conductor:get-fullscreen", () => mainWindow?.isFullScreen() ?? false);

  registerBundledRuntimeIpc();
  registerGitCloneIpc();
  registerPickDirectoryIpc();

  // Dock: use our artwork via setIcon. `icon-dock.png` has rounded alpha so the tile
  // matches other apps; plain `icon.png` would look like a sharp square (see scripts/build-dock-icon.py).
  if (process.platform === "darwin") {
    const dockPath = resolveDockIconPath();
    if (dockPath) {
      const img = nativeImage.createFromPath(dockPath);
      if (!img.isEmpty()) {
        app.dock.setIcon(img);
      }
    }
  }

  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (e) => {
  e.preventDefault();
  if (isHandlingBundledQuit) return;
  isHandlingBundledQuit = true;
  void shutdownBundledStack().finally(() => {
    app.exit(0);
  });
});
