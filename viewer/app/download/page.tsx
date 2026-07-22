"use client";

import * as React from "react";
import { Download, Terminal, MonitorCheck, Apple, ShieldAlert } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";

/**
 * Duxo download page — §3.4 + §0.9.
 *
 * §3.4: auto-detect OS from user-agent, surface the right binary first
 * (Windows .exe vs Linux .AppImage), other still available below.
 *
 * §0.9: SmartScreen copy lives DIRECTLY on this page, not in a separate FAQ
 * users won't find. Uses the exact wording from the plan.
 */

type DetectedOS = "windows" | "linux" | "mac" | "unknown";

function detectOS(): DetectedOS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("mac")) return "mac";
  return "unknown";
}

const DOWNLOADS = {
  windows: {
    label: "Windows (.exe)",
    href: "https://github.com/duxo-org/duxo/releases/latest",
    note: "Portable .exe — no installer, no admin needed for basic use.",
  },
  linux: {
    label: "Linux (.AppImage)",
    href: "https://github.com/duxo-org/duxo/releases/latest",
    note: "chmod +x and run. No package manager, no root needed for X11.",
  },
  mac: {
    label: "macOS",
    href: "#",
    note: "macOS is out of MVP scope — $99/yr notarization excluded (see §0.1).",
  },
  unknown: {
    label: "Choose your platform",
    href: "https://github.com/duxo-org/duxo/releases/latest",
    note: "We couldn't detect your OS — pick a build below.",
  },
};

export default function DownloadPage() {
  const [os, setOs] = React.useState<DetectedOS>("unknown");
  React.useEffect(() => setOs(detectOS()), []);

  const primary = DOWNLOADS[os === "mac" ? "mac" : os === "unknown" ? "unknown" : os];
  const secondary = os === "windows" ? DOWNLOADS.linux : DOWNLOADS.windows;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-weight-emphasis">Download Duxo</h1>
        <p className="mt-2 text-md text-text-secondary">
          Open-source, free forever. The host agent generates an 8-digit code
          you share with the person connecting to you.
        </p>

        {/* Primary download — §3.4 auto-detected */}
        <div className="mt-6 rounded-md border border-border-default bg-surface-raised p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-weight-emphasis">{primary.label}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {primary.note}
              </p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-surface-overlay text-accent">
              <Terminal className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <a href={primary.href} aria-label={`Download Duxo for ${primary.label}`} className="mt-4 inline-block">
            <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
              Download
            </Button>
          </a>
        </div>

        {/* Secondary — other platform still visible (§3.4 "not hidden") */}
        {os !== "unknown" && os !== "mac" && (
          <div className="mt-4 rounded-md border border-border-default bg-surface-raised p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-md font-weight-emphasis">{secondary.label}</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {secondary.note}
                </p>
              </div>
              <a href={secondary.href}>
                <Button variant="secondary">Download</Button>
              </a>
            </div>
          </div>
        )}

        {/* SmartScreen / trust copy — §0.9, exact wording from the plan */}
        <section className="mt-7 rounded-md border border-border-strong bg-surface-overlay p-6">
          <h2 className="flex items-center gap-3 text-lg font-weight-emphasis">
            <ShieldAlert className="h-5 w-5 text-accent" aria-hidden="true" />
            Why Windows shows a warning
          </h2>
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            <p>
              Windows will show a <strong className="text-text-primary">
              &ldquo;Windows protected your PC&rdquo;</strong> warning because
              this is a new open-source app without a paid certificate. This is
              normal. Click <strong className="text-text-primary">
              &ldquo;More info&rdquo; → &ldquo;Run anyway.&rdquo;</strong>
            </p>
            <p>
              <strong className="text-text-primary">Why this happens:</strong>{" "}
              code signing certificates cost $70–450/year and this project is
              built on a Rs. 0 budget. We applied for free open-source signing
              (SignPath.io) — if approved, this warning will reduce over time.
            </p>
            <p>
              <strong className="text-text-primary">
                Your security is still protected:
              </strong>{" "}
              all source code is public on GitHub, every build is verifiable via
              GitHub Actions CI, and connections are encrypted end-to-end via
              WebRTC.
            </p>
          </div>
        </section>

        {os === "mac" && (
          <p className="mt-5 text-sm text-text-secondary">
            <Apple className="mr-2 inline h-4 w-4" aria-hidden="true" />
            macOS host support is planned as a Phase 5 feature once funded by
            usage or donations.
          </p>
        )}

        {os === "windows" && (
          <p className="mt-5 text-sm text-text-secondary">
            <MonitorCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Looking for Linux instead? Scroll up — both builds are listed.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
