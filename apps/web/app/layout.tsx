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
    default: "Open Conductor — Local agent orchestration",
    template: "%s · Open Conductor",
  },
  description:
    "Chat, issues, and agent runs in one local app. Open source; your code stays on your machine.",
  applicationName: "Open Conductor",
  openGraph: {
    title: "Open Conductor",
    description:
      "Plan work, track issues, and run coding agents locally—with your keys and your repos.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Conductor",
    description:
      "Local-first orchestration for coding agents: chat, issues, and runs in one place.",
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
