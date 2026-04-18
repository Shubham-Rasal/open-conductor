import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

import { fetchLatestRelease, pickMacInstaller } from "../lib/github-release";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MacIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
      fill="currentColor"
    />
  </svg>
);

const GITHUB_REPO = process.env.GITHUB_REPO ?? "Shubham-Rasal/open-conductor";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
/** README quick start: clone, install deps, run server + desktop from source */
const BUILD_FROM_SOURCE_URL = `${GITHUB_URL}/blob/main/README.md#quick-start`;

export default async function Home() {
  const release = await fetchLatestRelease(false);
  const version = release?.tag_name ?? "v0.1.0";
  const displayVersion = version.replace(/^v/i, "");

  const macAsset = release ? pickMacInstaller(release.assets) : undefined;
  const whatsNewHref = release?.html_url ?? `${GITHUB_URL}/releases`;

  return (
    <div className={styles.page}>
      {/* ── Nav ──────────────────────────────────────────── */}
      <header className={styles.nav}>
        <Link href="/" className={styles.navLogo}>
          <Image
            src="/oc-logo.png"
            alt=""
            width={28}
            height={28}
            className={styles.navLogoImg}
            priority
          />
          Open Conductor
        </Link>
        <nav className={styles.navLinks}>
          <a href={`${GITHUB_URL}/releases`} className={styles.navLink}>
            Releases
          </a>
          <a
            href="/download/mac"
            className={styles.navDownload}
            aria-label="Download Open Conductor for Mac"
          >
            <MacIcon />
            Download Open Conductor
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
        <a
          href={whatsNewHref}
          className={styles.heroKicker}
          target="_blank"
          rel="noopener noreferrer"
        >
          See what&apos;s new in {displayVersion}
        </a>

        <h1 className={styles.heroTitle}>Run a team of coding agents on your Mac.</h1>

        <p className={styles.heroDesc}>
          Create parallel Codex + Claude Code agents in isolated workspaces. See at
          a glance what they&apos;re working on, then review and merge their changes.
        </p>

        <div className={styles.heroActions}>
          <a
            href="/download/mac"
            className={styles.btnPrimary}
            aria-label={
              macAsset
                ? `Download Open Conductor ${displayVersion} for Mac (${formatBytes(macAsset.size)})`
                : `Download Open Conductor for Mac`
            }
          >
            Download Open Conductor
            {macAsset ? (
              <span className={styles.btnMeta}>{formatBytes(macAsset.size)}</span>
            ) : null}
          </a>
          <a
            href={BUILD_FROM_SOURCE_URL}
            className={styles.btnSecondary}
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn how it works
          </a>
        </div>

        <p className={styles.heroNote}>
          Open source and local-first—your code and keys stay on your machine.{" "}
          <a href={`${GITHUB_URL}#quick-start`} className={styles.heroNoteLink}>
            Other platforms →
          </a>
        </p>
      </section>

      {/* ── Product screenshot ─────────────────────────────── */}
      <section
        className={styles.showcase}
        aria-label="Open Conductor app preview"
      >
        <div className={styles.showcaseFrame}>
          <Image
            src="/conductor-product.png"
            alt="Open Conductor desktop app: workspace sidebar with Chat, Issues, and Agents; main area shows chat proposing an Add README task assigned to Claude Code with queued orchestration."
            width={1024}
            height={643}
            priority
            sizes="(max-width: 1200px) 100vw, 1100px"
            className={styles.showcaseImage}
          />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <div className={styles.featuresWrap}>
        <div className={styles.featuresIntro}>
          <h2 className={styles.featuresIntroTitle}>Everything in one place</h2>
          <p className={styles.featuresIntroDesc}>
            Steer agents, watch work move, and keep context tied to the repos you
            care about—without shipping your codebase to someone else&apos;s cloud.
          </p>
        </div>
        <section className={styles.features}>
          <div className={styles.feature}>
            <div className={styles.featureNum}>01</div>
            <h3 className={styles.featureTitle}>Yours end to end</h3>
            <p className={styles.featureDesc}>
              Runs locally with your API keys—no middleman between your agents and
              your code.
            </p>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureNum}>02</div>
            <h3 className={styles.featureTitle}>Mix the tools you already use</h3>
            <p className={styles.featureDesc}>
              Claude Code, Codex, OpenCode—wire them up and swap them in or out as
              the work changes.
            </p>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureNum}>03</div>
            <h3 className={styles.featureTitle}>Workspaces that mirror real projects</h3>
            <p className={styles.featureDesc}>
              Point at a checkout, track issues, and assign work to people or
              agents without losing the thread.
            </p>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureNum}>04</div>
            <h3 className={styles.featureTitle}>See it happen</h3>
            <p className={styles.featureDesc}>
              Live tasks and transcripts—nudge a run, pause it, or pick up where
              it left off.
            </p>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureNum}>05</div>
            <h3 className={styles.featureTitle}>Chat when you need a plan</h3>
            <p className={styles.featureDesc}>
              Sketch the next slice of work, then hand it to the queue when
              you&apos;re ready.
            </p>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureNum}>06</div>
            <h3 className={styles.featureTitle}>Open source</h3>
            <p className={styles.featureDesc}>
              MIT licensed—fork it, audit it, make it yours.
            </p>
          </div>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.footerLogo}>
            <Image src="/oc-logo.png" alt="" width={22} height={22} className={styles.footerLogoImg} />
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
