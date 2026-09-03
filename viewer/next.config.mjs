import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export disabled — API routes require a server runtime.
  // output: "export",
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // Next 16 auto-writes AGENTS.md / CLAUDE.md into this dir on dev/build. The
  // repo carries its own agent conventions under .claude/, so keep these from
  // being generated rather than gitignoring regenerated churn.
  agentRules: false,

  // Turbopack otherwise walks up to find a workspace root and trips over a
  // stray package-lock.json in ~/Downloads (a parent of this checkout),
  // logging "ignored package-lock.json ... outside the current Git repository"
  // on every start. Pin the root to the viewer package.
  turbopack: {
    root: projectDir,
  },

  /**
   * The app shipped with no response headers at all. Its Content-Security-Policy
   * lives in a `<meta http-equiv>` tag in app/layout.tsx, and `frame-ancestors`
   * is one of the directives the spec says user agents MUST ignore in meta — so
   * the one directive that stops another site putting Duxo in an iframe was the
   * one that could not work there.
   *
   * That matters more here than on most sites. A framed /session or /dashboard
   * is a clickjacking target where the click being stolen is "Allow this person
   * to control my screen".
   *
   * Deliberately narrow: this adds the headers that cannot change what renders.
   * The full CSP is NOT moved out of the meta tag — it enumerates Clerk and
   * Firebase hosts, and getting that wrong breaks sign-in rather than
   * degrading it, which is not a change to make without a deployment to verify
   * against. The frame-ancestors policy below is additive: a second policy with
   * no other directives constrains framing only.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // The older header, for anything that predates frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send the origin cross-site, never the path: a session URL should
          // not travel to whatever a user clicks through to next.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
