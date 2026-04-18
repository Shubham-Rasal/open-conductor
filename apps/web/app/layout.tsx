import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Open Conductor — A team of coding agents on your Mac",
    template: "%s · Open Conductor",
  },
  description:
    "Run parallel Codex and Claude Code agents in isolated workspaces. See what they’re doing, then review and merge—local-first and open source.",
  applicationName: "Open Conductor",
  openGraph: {
    title: "Open Conductor",
    description:
      "Run a team of coding agents on your Mac. Parallel workspaces, live progress, and changes you can review and merge.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Conductor",
    description:
      "Codex + Claude Code in parallel. Isolated workspaces, clear progress, merge when you’re ready.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/oc-logo.png",
    apple: "/oc-logo.png",
  },
};

export const viewport: Viewport = {
  /* Matches product dark --background (see conductor-theme.css .dark) */
  themeColor: "#14151c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
