import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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

/**
 * The origin this deployment is served from. Every absolute URL in the
 * metadata below — the canonical link, the Open Graph `url`, and the absolute
 * form of the OG image — is resolved against it.
 *
 * It was hardcoded to `https://duxo.app`, which is not this product: that
 * domain resolves, but it serves an unrelated application that shares the
 * name, returning the same SPA shell for every path. So the canonical URL and
 * every share card attributed Duxo's pages to someone else's site.
 *
 * A hardcoded origin is the wrong shape for this regardless of the value — the
 * origin is a property of the deployment, not of the source. Set
 * NEXT_PUBLIC_SITE_URL in the environment; the localhost fallback is what
 * `next dev` should use anyway, and it makes a misconfigured deploy obvious in
 * the rendered tags rather than silently correct-looking and pointed elsewhere.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Duxo — Remote access, built in the open",
  description:
    "Open-source, end-to-end encrypted remote desktop for Windows and Linux. Zero-budget, zero telemetry.",
  icons: { icon: "/favicon.svg" },
  applicationName: "Duxo",
  authors: [{ name: "Duxo Contributors" }],
  keywords: ["remote desktop", "open source", "webrtc", "windows", "linux", "e2ee"],
  openGraph: {
    title: "Duxo — Remote access, built in the open",
    description:
      "Open-source, end-to-end encrypted remote desktop for Windows and Linux. Zero-budget, zero telemetry.",
    type: "website",
    url: SITE_URL,
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
          content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com https://*.clerk.com https://*.clerk.accounts.dev; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.clerk.com https://*.clerk.accounts.dev; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://*.clerk.com https://*.clerk.accounts.dev; frame-src 'self' https://*.firebaseapp.com https://*.clerk.com https://*.clerk.accounts.dev; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:"
        />
      </head>
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        <ClerkProvider>
          <ErrorBoundary><WebVitals />{children}</ErrorBoundary>
        </ClerkProvider>
      </body>
    </html>
  );
}
