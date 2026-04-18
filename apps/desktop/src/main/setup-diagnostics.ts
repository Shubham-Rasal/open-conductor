import { execFile } from "child_process";

import { app } from "electron";

import { bundledArtifactsPresent } from "./bundled-artifacts";

export type SetupDiagnostics = {
  /** True when the packaged app ships server + migrate binaries and SQL migrations. */
  bundledBinariesPresent: boolean;
  packaged: boolean;
  dockerCliAvailable: boolean;
  dockerDaemonRunning: boolean;
  goCliAvailable: boolean;
  platform: NodeJS.Platform;
};

function execOk(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true },
      (err) => {
        resolve(!err);
      }
    );
    child.on("error", () => resolve(false));
  });
}

/**
 * Best-effort detection of common tools (Docker CLI, Docker daemon, Go).
 * Used to tailor onboarding copy for non-coders vs developers.
 */
export async function getSetupDiagnostics(): Promise<SetupDiagnostics> {
  const dockerCli = await execOk("docker", ["--version"], 4000);
  const dockerDaemon = dockerCli ? await execOk("docker", ["info"], 8000) : false;
  const goCli = await execOk("go", ["version"], 3000);

  return {
    packaged: app.isPackaged,
    bundledBinariesPresent: app.isPackaged && bundledArtifactsPresent(process.resourcesPath),
    dockerCliAvailable: dockerCli,
    dockerDaemonRunning: dockerDaemon,
    goCliAvailable: goCli,
    platform: process.platform,
  };
}
