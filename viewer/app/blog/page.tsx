/**
 * §11 — Duxo Blog: product updates, engineering deep-dives, security advisories.
 *
 * Static content page served alongside the viewer from GitHub Pages.
 * Posts are simple markdown rendered as React components.
 * In production this could be migrated to MDX or a headless CMS.
 */

"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, Tag } from "lucide-react";

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  author: string;
}

const posts: BlogPost[] = [
  {
    slug: "getting-started-with-duxo",
    title: "Getting Started with Duxo — Remote Desktop, Self-Hosted",
    excerpt:
      "Learn how to install the Duxo host agent on your machine and connect from any browser. No account required for LAN connections.",
    date: "2026-07-23",
    tags: ["guide", "getting-started"],
    author: "Duxo Team",
  },
  {
    slug: "security-architecture",
    title: "How Duxo Keeps Your Connection Secure",
    excerpt:
      "A deep dive into Duxo's end-to-end security model: WebRTC with DTLS-SRTP, JWT-authenticated signalling, and the Allow/Deny permission gate.",
    date: "2026-07-15",
    tags: ["security", "architecture"],
    author: "Duxo Team",
  },
  {
    slug: "v0-1-0-release",
    title: "Duxo v0.1.0 — MVP Release",
    excerpt:
      "The first public release of Duxo with screen capture, input forwarding, WebRTC streaming, and Firebase-based authentication.",
    date: "2026-07-10",
    tags: ["release"],
    author: "Duxo Team",
  },
];

export default function BlogPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-muted-foreground mb-10">
        Product updates, engineering deep-dives, and security advisories.
      </p>

      <div className="flex flex-col gap-8">
        {posts.map((post) => (
          <article key={post.slug} className="group">
            <Link href={`/blog/${post.slug}`}>
              <h2 className="text-xl font-semibold group-hover:text-primary transition-colors mb-2">
                {post.title}
              </h2>
            </Link>
            <p className="text-muted-foreground mb-3">{post.excerpt}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {post.date}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {post.tags.join(", ")}
              </span>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
