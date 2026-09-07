import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WebVitals } from "@/components/WebVitals";
import { SITE_URL } from "@/lib/site";

/**
 * Duxo root layout.
 *
 * §9.1 — dark-first, single accent, trustworthy SaaS feel. Type is the
 * three-role system in §9.2 — Bricolage Grotesque for display, Manrope for
 * UI and reading, JetBrains Mono for machine text — declared as @font-face
 * in styles/globals.css and tokenised in tailwind.config.ts.
 *
 * The faces are vendored under public/fonts rather than linked, and that is
 * load-bearing twice over: the CSP below sends `font-src 'self'`, so a CDN
 * stylesheet is blocked outright and the page would fall back silently to a
 * system face; and avoiding next/font/google keeps the build off the
 * network, which is the Rs. 0 / offline-build promise (§0.3, §1.5).
 */

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
  // §9.8's token rule cannot reach here: `themeColor` is Next's metadata
  // API and it emits a <meta> tag, so it takes a CSS colour rather than a
  // class name. This is the app chrome's accent from tailwind.config.ts.
  // eslint-disable-next-line no-restricted-syntax
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
    /*
      `suppressHydrationWarning` covers the <html> element only, and it is
      required rather than cosmetic: the inline script below adds the `js`
      class before React hydrates, so the live DOM reads `dark js` while the
      server sent `dark`. React reported that as a hydration mismatch on
      every single page load — a real warning that buried real ones. The
      alternative, rendering `js` server-side, would defeat the script's
      whole purpose (see its comment).
    */
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/*
          The hero sets both faces above the fold, so they are preloaded to
          keep the swap off the first paint. Same-origin, but `crossOrigin`
          is still required — fonts are always fetched in CORS mode, and a
          preload without it is discarded and refetched.
        */}
        <link
          rel="preload"
          href="/fonts/manrope-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <link
          rel="preload"
          href="/fonts/bricolage-grotesque-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.firebaseio.com https://*.googleapis.com https://*.clerk.com https://*.clerk.accounts.dev; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.clerk.com https://*.clerk.accounts.dev; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://*.clerk.com https://*.clerk.accounts.dev; frame-src 'self' https://*.firebaseapp.com https://*.clerk.com https://*.clerk.accounts.dev; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:"
        />
        {/*
          Marks the document as JS-capable before first paint. The landing
          page's `.reveal` animations only take their hidden opacity:0 start
          state under `html.js`, so a failed or disabled bundle degrades to
          fully visible content instead of a stack of blank sections.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
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
