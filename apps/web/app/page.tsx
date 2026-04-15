import styles from "./page.module.css";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: ReleaseAsset[];
}

async function getLatestRelease(): Promise<Release | null> {
  const repo = process.env.GITHUB_REPO ?? "open-conductor/open-conductor";
  const token = process.env.GITHUB_TOKEN;
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as Release;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Platform = {
  label: string;
  arch: string;
  desc: string;
  matchers: string[];
};

const PLATFORMS: Platform[] = [
  {
    label: "macOS",
    arch: "Apple Silicon + Intel",
    desc: "macOS 13 Ventura or later",
    matchers: [".dmg", "mac", "darwin"],
  },
  {
    label: "Windows",
    arch: "x64",
    desc: "Windows 10 or later",
    matchers: [".exe", "setup", "win"],
  },
  {
    label: "Linux",
    arch: "x64",
    desc: "AppImage · Debian/Ubuntu",
    matchers: [".AppImage", ".deb", "linux"],
  },
];

function findAsset(
  assets: ReleaseAsset[],
  matchers: string[]
): ReleaseAsset | undefined {
  return assets.find((a) =>
    matchers.some((m) => a.name.toLowerCase().includes(m.toLowerCase()))
  );
}

const MacIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
      fill="currentColor"
    />
  </svg>
);

const WinIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 5.557L10.538 4.5v7.145H3V5.557zm0 12.886L10.538 19.5V12.36H3v6.083zm8.462 1.169L21 21v-8.64h-9.538v7.252zm0-14.224V12.36H21V3L11.462 5.388z"
      fill="currentColor"
    />
  </svg>
);

const LinuxIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2c4.41 0 8 3.59 8 8s-3.59 8-8 8-8-3.59-8-8 3.59-8 8-8zm-1 3v2H9v2h2v5h2v-5h2V9h-2V7h-2z"
      fill="currentColor"
    />
  </svg>
);

const PLATFORM_ICONS = {
  macOS: <MacIcon />,
  Windows: <WinIcon />,
  Linux: <LinuxIcon />,
} as const;

const GITHUB_REPO = process.env.GITHUB_REPO ?? "open-conductor/open-conductor";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export default async function Home() {
  const release = await getLatestRelease();
  const version = release?.tag_name ?? "v0.1.0";
  const publishedAt = release?.published_at
    ? formatDate(release.published_at)
    : null;

  return (
    <div className={styles.page}>
      {/* ── Nav ──────────────────────────────────────────── */}
      <header className={styles.nav}>
        <a href="/" className={styles.navLogo}>
          <span className={styles.navLogoMark}>◆</span>
          Open Conductor
        </a>
        <nav className={styles.navLinks}>
          <a href={`${GITHUB_URL}/releases`} className={styles.navLink}>
            Releases
          </a>
          <a href={`${GITHUB_URL}/blob/main/README.md`} className={styles.navLink}>
            Docs
          </a>
          <a
            href={GITHUB_URL}
            className={styles.navGithub}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </a>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          {version}
          {publishedAt && <span className={styles.heroBadgeDate}>— {publishedAt}</span>}
        </div>

        <h1 className={styles.heroTitle}>
          Managed local
          <br />
          <em>agent swarms.</em>
        </h1>

        <p className={styles.heroDesc}>
          Open Conductor gives you a unified desktop interface for spawning,
          directing, and reviewing multiple AI coding agents — all running on
          your own hardware. No cloud dependency. No telemetry.
        </p>

        <div className={styles.heroActions}>
          {release && release.assets.length > 0 ? (
            <>
              {(() => {
                const macAsset = findAsset(
                  release.assets,
                  PLATFORMS[0]!.matchers
                );
                return macAsset ? (
                  <a
                    href={macAsset.browser_download_url}
                    className={styles.btnPrimary}
                  >
                    Download for macOS
                    <span className={styles.btnMeta}>
                      {formatBytes(macAsset.size)}
                    </span>
                  </a>
                ) : (
                  <a href={`${GITHUB_URL}/releases/latest`} className={styles.btnPrimary}>
                    Download Latest
                  </a>
                );
              })()}
              <a href="#download" className={styles.btnSecondary}>
                All platforms
              </a>
            </>
          ) : (
            <a
              href={`${GITHUB_URL}/releases`}
              className={styles.btnPrimary}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Releases on GitHub
            </a>
          )}
        </div>

        <p className={styles.heroNote}>
          Requires a self-hosted Go backend and PostgreSQL.{" "}
          <a href={`${GITHUB_URL}#quick-start`} className={styles.heroNoteLink}>
            Setup guide →
          </a>
        </p>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureNum}>01</div>
          <h3 className={styles.featureTitle}>Local-first architecture</h3>
          <p className={styles.featureDesc}>
            Every agent runs on your machine against your own API keys. Open
            Conductor never proxies your data through external servers.
          </p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureNum}>02</div>
          <h3 className={styles.featureTitle}>Parallel agent coordination</h3>
          <p className={styles.featureDesc}>
            Spawn multiple coding agents against separate issues simultaneously.
            Track progress, review diffs, and merge results from a single pane.
          </p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureNum}>03</div>
          <h3 className={styles.featureTitle}>Issue-driven workflow</h3>
          <p className={styles.featureDesc}>
            Create issues, assign agents, and watch them work. Built-in issue
            tracker integrates directly with the agent task queue.
          </p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureNum}>04</div>
          <h3 className={styles.featureTitle}>Fully open source</h3>
          <p className={styles.featureDesc}>
            MIT licensed. Inspect every line, fork the codebase, run it on your
            own infrastructure. No black boxes.
          </p>
        </div>
      </section>


      {/* ── Download ─────────────────────────────────────── */}
      <section className={styles.download} id="download">
        <div className={styles.downloadHeader}>
          <h2 className={styles.downloadTitle}>Download</h2>
          {release && (
            <a
              href={release.html_url}
              className={styles.downloadVersion}
              target="_blank"
              rel="noopener noreferrer"
            >
              {version}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 17L17 7M17 7H7M17 7v10" />
              </svg>
            </a>
          )}
        </div>

        <div className={styles.platforms}>
          {PLATFORMS.map((platform) => {
            const asset = release
              ? findAsset(release.assets, platform.matchers)
              : undefined;

            return (
              <div key={platform.label} className={styles.platformCard}>
                <div className={styles.platformIcon}>
                  {PLATFORM_ICONS[platform.label as keyof typeof PLATFORM_ICONS]}
                </div>
                <div className={styles.platformInfo}>
                  <div className={styles.platformName}>{platform.label}</div>
                  <div className={styles.platformArch}>{platform.arch}</div>
                  <div className={styles.platformReq}>{platform.desc}</div>
                </div>
                {asset ? (
                  <a
                    href={asset.browser_download_url}
                    className={styles.platformDownload}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 3v13m0 0l-4-4m4 4l4-4M3 20h18" />
                    </svg>
                    {formatBytes(asset.size)}
                  </a>
                ) : (
                  <a
                    href={`${GITHUB_URL}/releases/latest`}
                    className={styles.platformDownloadFallback}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub Releases →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {release?.body && (
          <details className={styles.releaseNotes}>
            <summary className={styles.releaseNotesSummary}>
              Release notes for {version}
            </summary>
            <div className={styles.releaseNotesBody}>
              {release.body.split("\n").map((line, i) => (
                <p key={i}>{line || <br />}</p>
              ))}
            </div>
          </details>
        )}
      </section>


      {/* ── Footer ───────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.footerLogo}>
            <span className={styles.navLogoMark}>◆</span>
            Open Conductor
          </span>
          <span className={styles.footerSep}>·</span>
          <span className={styles.footerCopy}>MIT License</span>
        </div>
        <div className={styles.footerRight}>
          <a
            href={GITHUB_URL}
            className={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/releases`}
            className={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Releases
          </a>
          <a
            href={`${GITHUB_URL}/issues`}
            className={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Issues
          </a>
        </div>
      </footer>
    </div>
  );
}
