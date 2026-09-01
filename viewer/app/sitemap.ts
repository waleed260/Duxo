import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * The public pages only — everything `robots.ts` disallows is omitted here,
 * because a sitemap that lists a route the robots file forbids is a
 * contradiction search engines resolve by trusting neither.
 *
 * /login and /signup are deliberately absent too: they are reachable and
 * indexable, but they are not answers to anything anyone searches for.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
