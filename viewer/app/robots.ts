import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * There was no robots.txt at all, so crawlers had no guidance and no route to
 * the sitemap.
 *
 * The disallow list is the authed half of the app (§3.4) — the same set
 * `middleware.ts` protects. Those routes redirect a signed-out visitor to
 * /login, so a crawler cannot read them anyway; keeping them out of the index
 * stops /login appearing in results under a dozen different titles, each one a
 * dead end for whoever clicks it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/settings",
        "/history",
        "/session",
        "/verify-2fa",
        "/link-device",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
