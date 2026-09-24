import Link from "next/link";
import type { Metadata } from "next";

import styles from "./page.module.css";

const GITHUB_REPO = process.env.GITHUB_REPO ?? "Shubham-Rasal/open-conductor";
const README_URL = `https://github.com/${GITHUB_REPO}/blob/main/README.md#quick-start`;

export const metadata: Metadata = {
  title: "Quick start",
  description: "Build and run Open Conductor locally from source.",
};

export default function QuickStartPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.topLink}>
          ← Back to home
        </Link>
        <h1 className={styles.title}>Quick start</h1>
        <p className={styles.desc}>
          Build and run Open Conductor locally from source using the same steps from the repository
          README.
        </p>

        <section className={styles.section}>
          <h2>1. Database</h2>
          <p>From the repository root:</p>
          <pre className={styles.code}>
            <code>{`cp .env.example .env
# Optional: change the path in DATABASE_URL`}</code>
          </pre>
        </section>

        <section className={styles.section}>
          <h2>2. Migrations</h2>
          <p>From the server directory:</p>
          <pre className={styles.code}>
            <code>{`cd server
go run ./cmd/migrate`}</code>
          </pre>
        </section>

        <section className={styles.section}>
          <h2>3. API server</h2>
          <pre className={styles.code}>
            <code>{`cd server
go run ./cmd/server`}</code>
          </pre>
          <p>Default listen address: http://localhost:8080 (override with PORT).</p>
        </section>

        <section className={styles.section}>
          <h2>4. Desktop app</h2>
          <p>In a second terminal, from repository root:</p>
          <pre className={styles.code}>
            <code>{`pnpm install
pnpm exec turbo dev --filter=@open-conductor/desktop`}</code>
          </pre>
          <p>
            The renderer uses http://localhost:8080 and ws://localhost:8080/ws. Start the Go server
            before the UI.
          </p>
        </section>

        <p className={styles.note}>
          Full setup details:{" "}
          <a href={README_URL} className={styles.link} target="_blank" rel="noopener noreferrer">
            repository README
          </a>
          .
        </p>
      </div>
    </main>
  );
}
