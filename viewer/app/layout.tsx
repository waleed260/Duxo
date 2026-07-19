import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

/**
 * Duxo root layout.
 *
 * §9.1 — dark-first, single accent, trustworthy SaaS feel. Fonts use the
 * Noto Sans family (with system fallback in tailwind.config) per §9.2.
 *
 * We avoid next/font/google so the build never depends on the network —
 * keeps the Rs. 0 / offline-build promise intact (§0.3, §1.5).
 */

export const metadata: Metadata = {
  title: "Duxo — Remote access, built in the open",
  description:
    "Open-source, end-to-end encrypted remote desktop for Windows and Linux. Zero-budget, zero telemetry.",
  applicationName: "Duxo",
  authors: [{ name: "Duxo Contributors" }],
  keywords: ["remote desktop", "open source", "webrtc", "windows", "linux"],
  openGraph: {
    title: "Duxo — Remote access, built in the open",
    description:
      "Open-source, end-to-end encrypted remote desktop for Windows and Linux.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
