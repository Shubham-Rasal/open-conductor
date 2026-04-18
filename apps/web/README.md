# Open Conductor — website (`apps/web`)

Next.js (App Router) **marketing site** for [Open Conductor](https://github.com/Shubham-Rasal/open-conductor): landing copy, product screenshot, version kicker from GitHub Releases, and a **Download Open Conductor** flow for macOS. This app does **not** ship the in-product UI; that lives in the Electron desktop app (`apps/desktop`) talking to the Go API (`server`).

For the **full product** (server, desktop, agents), see the [repository root README](../../README.md).

---

## Contents

- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Build](#build)
- [Run production build locally](#run-production-build-locally)
- [Lint and typecheck](#lint-and-typecheck)
- [What this site includes](#what-this-site-includes)
- [Download behavior](#download-behavior)
- [Deploy](#deploy)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** ≥ 18  
- **pnpm** 9 (see root [`packageManager`](../../package.json))  
- Clone the monorepo and install dependencies from the **repository root** (`pnpm install`).

You do **not** need the Go server or desktop app running to develop this site unless you are testing something that depends on them.

---

## Quick start

From the **repository root**:

```bash
pnpm install
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server uses Next.js with Turbopack (see `package.json` scripts).

Optional: copy or merge variables from the root [`.env.example`](../../.env.example) if you want to override GitHub release fetching (see [Environment variables](#environment-variables)).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | No | Canonical site URL for `metadataBase` and Open Graph (e.g. `https://open-conductor.example.com`). On Vercel you often set this to the production URL. |
| `GITHUB_REPO` | No | `owner/repo` for the GitHub Releases API and outbound links. Default in code: `Shubham-Rasal/open-conductor`. Can be set in root `.env` (see [`.env.example`](../../.env.example)). |
| `GITHUB_TOKEN` | No | Fine-grained or classic token with `public_repo` (or equivalent) to raise GitHub API rate limits when fetching `/releases/latest`. |

These are read at **build time** or **request time** depending on usage; `NEXT_PUBLIC_*` variables are inlined for the client where referenced.

---

## Development

```bash
# From repository root
pnpm --filter web dev
```

- **Port:** `3000` (see `apps/web/package.json` → `next dev --port 3000`).  
- **Hot reload:** edits under `apps/web/app` refresh automatically.

---

## Build

```bash
pnpm --filter web build
```

Produces an optimized production build under `apps/web/.next`.

---

## Run production build locally

```bash
pnpm --filter web build
pnpm --filter web start
```

By default `next start` listens on port **3000** (override with `PORT`, e.g. `PORT=4000 pnpm --filter web start`).

---

## Lint and typecheck

```bash
pnpm --filter web lint
pnpm --filter web check-types
```

`check-types` runs `next typegen` and `tsc --noEmit`.

---

## What this site includes

| Area | Notes |
|------|--------|
| **Landing** | Hero, product screenshot (`public/conductor.png`), feature grid, footer. |
| **Theme** | Uses shared palette from `app/conductor-theme.css` (aligned with `packages/ui` tokens). |
| **`/download/mac`** | Server route that redirects to the latest **macOS** release asset from GitHub, or back to `/` if none is found. |

Release metadata (tag, published date, asset size in the UI) comes from the GitHub Releases API via `apps/web/lib/github-release.ts`.

---

## Download behavior

- Primary CTA and nav emphasize **Download Open Conductor** for Mac (`/download/mac`).
- **Learn how it works** points at the repo README quick start (build/run the full stack, including Windows and Linux from source when installers are not published here).

---

## Deploy

Typical targets: **Vercel**, **Netlify**, or any Node host that can run `next start` or use static output (this project uses the default Next server features, e.g. `fetch` revalidation on the home page).

Recommended for production:

1. Set **`NEXT_PUBLIC_SITE_URL`** to the deployed origin.  
2. Set **`GITHUB_REPO`** if the site should track a fork or different org.  
3. Set **`GITHUB_TOKEN`** if you hit anonymous GitHub API rate limits during builds or ISR.

Connect the repo root as the project root and configure the install/build commands to use the monorepo, for example:

- **Install:** `pnpm install` (from root)  
- **Build:** `pnpm --filter web build`  
- **Output / start:** run from `apps/web` with `pnpm start` or invoke `next start` with the correct working directory per your host’s docs.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **“See what’s new” shows a fallback version** | GitHub API failed or rate-limited; set `GITHUB_TOKEN`, or confirm `GITHUB_REPO` is correct. |
| **Download redirects to home with no file** | No `.dmg` (or matched mac asset) on the latest release; check [Releases](https://github.com/Shubham-Rasal/open-conductor/releases) and `pickMacInstaller` logic in `lib/github-release.ts`. |
| **macOS: “damaged and can’t be opened”** | Normal for **unsigned** builds downloaded in a browser. Remove quarantine: `xattr -dr com.apple.quarantine "/Applications/Open Conductor.app"` (or on the `.dmg` in `Downloads`), or use **Open Anyway** in **System Settings → Privacy & Security**. Details: [root README](https://github.com/Shubham-Rasal/open-conductor/blob/main/README.md#macos-unsigned-dmg-troubleshooting). |
| **Wrong repo in links** | Set `GITHUB_REPO` in `.env` to `your-org/your-fork`. |

---

## See also

- [Root README](../../README.md) — architecture, database, API server, desktop app, agents  
- [`packages/ui`](../../packages/ui) — shared design tokens (`styles/tokens.css`)
