export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: ReleaseAsset[];
}

const DEFAULT_REPO = "Shubham-Rasal/open-conductor";

function repo(): string {
  return process.env.GITHUB_REPO ?? DEFAULT_REPO;
}

export async function fetchLatestRelease(live: boolean): Promise<Release | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo()}/releases/latest`,
      live
        ? { headers, cache: "no-store" }
        : { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as Release;
  } catch {
    return null;
  }
}

/** Prefer Apple Silicon .dmg, then Intel, aligned with electron-builder outputs. */
export function pickMacInstaller(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  const dmgs = assets.filter((a) => {
    const n = a.name.toLowerCase();
    return n.endsWith(".dmg") && !n.includes("blockmap");
  });

  if (dmgs.length > 0) {
    const prefer = (sub: string) =>
      dmgs.find((d) => d.name.toLowerCase().includes(sub));
    return (
      prefer("arm64") ??
      prefer("aarch64") ??
      prefer("x64") ??
      prefer("intel") ??
      dmgs[0]
    );
  }

  return assets.find((a) => {
    const n = a.name.toLowerCase();
    return (
      n.endsWith(".zip") &&
      (n.includes("darwin") || n.includes("mac")) &&
      !n.includes("win") &&
      !n.includes("linux")
    );
  });
}

export function findAsset(
  assets: ReleaseAsset[],
  matchers: string[]
): ReleaseAsset | undefined {
  return assets.find((a) =>
    matchers.some((m) => a.name.toLowerCase().includes(m.toLowerCase()))
  );
}

export async function getMacInstallerDownloadUrl(): Promise<string | null> {
  const release = await fetchLatestRelease(true);
  if (!release?.assets.length) return null;
  const asset = pickMacInstaller(release.assets);
  return asset?.browser_download_url ?? null;
}
