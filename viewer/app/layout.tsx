import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WebVitals } from "@/components/WebVitals";

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
  metadataBase: new URL("https://waleed260.github.io/Duxo"),
  title: "Duxo — Remote access, built in the open",
  description:
    "Open-source, end-to-end encrypted remote desktop for Windows and Linux. Zero-budget, zero telemetry.",
  applicationName: "Duxo",
  authors: [{ name: "Duxo Contributors" }],
  keywords: ["remote desktop", "open source", "webrtc", "windows", "linux", "e2ee"],
  openGraph: {
    title: "Duxo — Remote access, built in the open",
    description:
      "Open-source, end-to-end encrypted remote desktop for Windows and Linux. Zero-budget, zero telemetry.",
    type: "website",
    url: "https://duxo.app",
    siteName: "Duxo",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Duxo — Remote access, built in the open",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Duxo — Remote access, built in the open",
    description:
      "Open-source, end-to-end encrypted remote desktop for Windows and Linux.",
    images: ["/images/og-image.jpg"],
  },
};



export const viewport: Viewport = {
  themeColor: "#ef443b",
  colorScheme: "dark",
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
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com; frame-src 'self' https://*.firebaseapp.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
        />
      </head>
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        <ErrorBoundary><WebVitals />{children}</ErrorBoundary>
      </body>
    </html>
  );
}
