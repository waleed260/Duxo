/**
 * §11 — Duxo Changelog: release history with notes per version.
 */

"use client";

import Link from "next/link";
import { ArrowLeft, Package, GitCommit } from "lucide-react";

interface Release {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  notes: string[];
}

const releases: Release[] = [
  {
    version: "0.1.0",
    date: "2026-07-23",
    type: "minor",
    notes: [
      "Initial MVP release — Phases 1–3 complete.",
      "Screen capture via scrap (DXGI on Windows, XShm on Linux).",
      "WebRTC streaming with STUN/TURN ICE fallback.",
      "Input forwarding (mouse, keyboard, clipboard) over data channel.",
      "Firebase Auth with Google OAuth and email/password.",
      "TOTP 2FA with encrypted secrets and backup codes.",
      "Allow/Deny host permission gate with JWT verification.",
      "Audit logging with SHA-256 hash chain.",
      "CI/CD: GitHub Actions for build, test, lint, and GitHub Pages deployment.",
      "Session state machine with 5-state lifecycle.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold mb-2">Changelog</h1>
      <p className="text-muted-foreground mb-10">
        Release history for the Duxo host agent and viewer.
      </p>

      <div className="flex flex-col gap-8">
        {releases.map((release) => (
          <div key={release.version} className="border-l-2 border-primary pl-4">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">v{release.version}</h2>
              <span className="text-xs text-muted-foreground">{release.date}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {release.type}
              </span>
            </div>
            <ul className="space-y-1">
              {release.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <GitCommit className="mt-0.5 h-3 w-3 shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
