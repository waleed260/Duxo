/**
 * §11 — Duxo Documentation: quick-start, architecture, and reference.
 *
 * Static content page. Sections map to the Duxo Master Plan structure.
 */

"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Terminal, Shield, Wifi, Download } from "lucide-react";

interface DocSection {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

const sections: DocSection[] = [
  {
    title: "Quick Start",
    description: "Install the host agent and connect from any browser in under 5 minutes.",
    icon: <Terminal className="h-5 w-5" />,
    href: "/docs/quick-start",
  },
  {
    title: "Architecture Overview",
    description: "How Duxo works: WebRTC streaming, signalling, and the session lifecycle.",
    icon: <BookOpen className="h-5 w-5" />,
    href: "/docs/architecture",
  },
  {
    title: "Security Model",
    description: "End-to-end encryption, JWT authentication, and the Allow/Deny permission gate.",
    icon: <Shield className="h-5 w-5" />,
    href: "/docs/security",
  },
  {
    title: "Network Setup",
    description: "STUN, TURN, and firewall configuration for remote connections.",
    icon: <Wifi className="h-5 w-5" />,
    href: "/docs/network",
  },
  {
    title: "Downloads & Releases",
    description: "Download the latest host agent and view release notes.",
    icon: <Download className="h-5 w-5" />,
    href: "/download",
  },
];

export default function DocsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold mb-2">Documentation</h1>
      <p className="text-muted-foreground mb-10">
        Everything you need to set up and use Duxo.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-lg border p-5 hover:border-primary/50 hover:bg-accent/5 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2 text-primary">
              {section.icon}
              <h2 className="font-semibold group-hover:text-primary transition-colors">
                {section.title}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {section.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-muted p-6">
        <h2 className="text-lg font-semibold mb-2">Still have questions?</h2>
        <p className="text-sm text-muted-foreground">
          Check the{" "}
          <Link href="/blog" className="text-primary hover:underline">
            blog
          </Link>{" "}
          for deep-dives, or open an issue on{" "}
          <a
            href="https://github.com/waleed260/Duxo/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </main>
  );
}
