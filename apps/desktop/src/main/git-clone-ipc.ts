import { BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

function deriveRepoFolderName(url: string): string {
  const t = url.trim().replace(/\.git$/i, "");
  const idx = t.indexOf("github.com");
  if (idx >= 0) {
    const after = t.slice(idx + "github.com".length).replace(/^[/:]/, "");
    const parts = after.split("/").filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1].replace(/\.git$/i, "");
  }
  const parts = t.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1]?.replace(/\.git$/i, "") || "repo";
}

export function registerGitCloneIpc(): void {
  ipcMain.removeHandler("open-conductor:git-clone");
  ipcMain.handle(
    "open-conductor:git-clone",
    async (_evt, payload: { url?: string; parentPath?: string }) => {
      const url = String(payload?.url ?? "").trim();
      const parentPath = String(payload?.parentPath ?? "").trim();
      if (!url || !parentPath) {
        return { ok: false as const, error: "URL and parent folder are required." };
      }
      if (!existsSync(parentPath)) {
        return { ok: false as const, error: "Parent folder does not exist." };
      }
      const folder = deriveRepoFolderName(url);
      const target = join(parentPath, folder);
      if (existsSync(target)) {
        return {
          ok: false as const,
          error: "That folder already exists. Remove it or choose another parent directory.",
        };
      }
      return await new Promise<{ ok: boolean; target?: string; error?: string }>((resolve) => {
        const child = spawn("git", ["clone", "--", url, target], { shell: false });
        let stderr = "";
        child.stderr?.on("data", (c) => {
          stderr += String(c);
        });
        child.on("error", (err) => resolve({ ok: false, error: err.message }));
        child.on("close", (code) => {
          if (code === 0) resolve({ ok: true, target });
          else resolve({ ok: false, error: stderr.trim() || `git exited with code ${code}` });
        });
      });
    }
  );
}

/** Native folder picker for workspace parent / local repo path (desktop only). */
export function registerPickDirectoryIpc(): void {
  ipcMain.removeHandler("open-conductor:pick-directory");
  ipcMain.handle("open-conductor:pick-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose folder",
      buttonLabel: "Choose",
    });
    if (canceled || !filePaths[0]) {
      return { ok: false as const };
    }
    return { ok: true as const, path: filePaths[0] };
  });
}
