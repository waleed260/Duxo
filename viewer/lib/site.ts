/**
 * The origin this deployment is served from.
 *
 * One definition, imported by `app/layout.tsx` (canonical link, Open Graph
 * url, and the absolute form of the OG image), `app/robots.ts` and
 * `app/sitemap.ts`. Those three disagreeing is the normal way a site ends up
 * advertising one origin and pointing search engines at another.
 *
 * It was previously hardcoded in layout.tsx to a domain that serves a
 * different product entirely. An origin is a property of the deployment, not
 * of the source: set NEXT_PUBLIC_SITE_URL. The localhost fallback is what
 * `next dev` should use anyway, and it makes a misconfigured deploy obvious in
 * the rendered tags rather than silently correct-looking and pointed elsewhere.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
