import { existsSync } from "fs";
import { app, BrowserWindow, nativeImage, shell } from "electron";
import { join } from "path";
import { registerGitCloneIpc, registerPickDirectoryIpc } from "./git-clone-ipc";

const windowIconPath = join(__dirname, "../../resources/icon.png");

function createWindow(): void {
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
    ...(existsSync(windowIconPath) ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

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

app.whenReady().then(() => {
  registerGitCloneIpc();
  registerPickDirectoryIpc();

  if (process.platform === "darwin" && existsSync(windowIconPath)) {
    const img = nativeImage.createFromPath(windowIconPath);
    if (!img.isEmpty()) {
      app.dock.setIcon(img);
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
