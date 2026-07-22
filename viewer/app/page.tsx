import Link from "next/link";
import {
  Download,
  Github,
  Shield,
  MonitorSmartphone,
  Lock,
  Fingerprint,
  ArrowRight,
  CheckCircle,
  Code,
  EyeOff,
  Layers,
  Terminal,
  ExternalLink,
  Server,
  Globe,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { AnimatedCounter } from "@/components/AnimatedCounter";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <StatsSection />
        <DemoSection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill border border-border-default bg-surface-overlay px-3 py-1 text-xs text-text-secondary">
      {children}
    </span>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
      {children}
    </div>
  );
}

/**
 * §3.1 — Trust is the product's biggest UX problem.
 * Every screen should reinforce legitimacy: visible open-source badge,
 * link to source code, plain-language explanations.
 */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* CSS-patterned background grid — no external image needed, stays Rs. 0 */}
      <div className="absolute inset-0 z-0 opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Decorative gradient orbs */}
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-[0.04]"
        style={{
          background:
            "radial-gradient(circle, #ef443b 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-[0.04]"
        style={{
          background:
            "radial-gradient(circle, #ef443b 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pt-16 pb-8 text-center sm:pt-20">
        {/* §3.4 — "View source on GitHub" link near the TOP, not buried in footer */}
        <a
          href="https://github.com/duxo-org/duxo"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-8 inline-flex items-center gap-2 rounded-pill border border-border-default bg-surface-raised px-4 py-2 text-xs text-text-secondary transition-colors duration-instant hover:border-border-strong hover:text-text-primary"
        >
          <Github className="h-3.5 w-3.5" aria-hidden="true" />
          View source on GitHub
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>

        <div className="flex flex-col gap-5 text-center">
          <h1 className="max-w-4xl text-4xl font-weight-emphasis text-text-primary leading-tight sm:text-5xl">
            Remote access,{" "}
            <span className="text-accent">built in the open.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-md text-text-secondary leading-relaxed">
            Connect to any Windows or Linux machine, end-to-end encrypted over
            WebRTC. Open source, zero telemetry, zero cost.
          </p>
        </div>

        {/* CTA buttons in hero — §3.4 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/download">
            <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
              Download host agent
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="lg" leadingIcon={<Shield className="h-5 w-5" />}>
              Sign in to connect
            </Button>
          </Link>
        </div>

        {/* Tag cloud — §3.1 trust signals */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Tag>
            <Lock className="-ml-0.5 mr-1 inline h-3 w-3" aria-hidden="true" />
            E2E encrypted
          </Tag>
          <Tag>
            <Server className="-ml-0.5 mr-1 inline h-3 w-3" aria-hidden="true" />
            Cross-platform
          </Tag>
          <Tag>
            <Fingerprint className="-ml-0.5 mr-1 inline h-3 w-3" aria-hidden="true" />
            Permission gate
          </Tag>
          <Tag>
            <Code className="-ml-0.5 mr-1 inline h-3 w-3" aria-hidden="true" />
            Open source
          </Tag>
          <Tag>
            <Zap className="-ml-0.5 mr-1 inline h-3 w-3" aria-hidden="true" />
            Zero cost
          </Tag>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Lock,
    title: "End-to-end encrypted",
    body: "DTLS-SRTP over WebRTC. Even TURN relays can't decrypt your traffic. Your session, your data.",
    tags: ["WebRTC", "DTLS-SRTP", "Privacy"],
    gradient: "from-accent/10 to-transparent",
  },
  {
    icon: MonitorSmartphone,
    title: "Cross-platform",
    body: "Full control on Windows and Linux X11. Wayland ships view-only, honestly scoped. One binary, any machine.",
    tags: ["Windows", "Linux", "X11"],
    gradient: "from-accent/10 to-transparent",
  },
  {
    icon: Fingerprint,
    title: "Host permission gate",
    body: "Every connection requires an explicit Allow click from the host. No silent takeovers, no backdoors.",
    tags: ["Security", "Access control", "Privacy"],
    gradient: "from-accent/10 to-transparent",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-weight-emphasis sm:text-3xl">Why Duxo</h2>
        <p className="mt-3 text-md text-text-secondary">
          Built different. Built transparent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="group relative overflow-hidden rounded-md border border-border-default bg-surface-raised transition-colors duration-instant hover:border-border-strong"
          >
            {/* CSS gradient background — §9.2 no images needed */}
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 transition-opacity duration-normal group-hover:opacity-100`}
            />

            {/* Decorative corner accent */}
            <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full border border-accent/5" />

            <div className="relative z-10 flex flex-col gap-4 p-6">
              <IconBox>
                <f.icon className="h-5 w-5" />
              </IconBox>
              <h3 className="text-xl font-weight-emphasis">{f.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {f.body}
              </p>
              <div className="flex flex-wrap gap-2">
                {f.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Architecture diagram — CSS-only, no images */}
      <div className="mt-12 rounded-md border border-border-default bg-surface-raised p-6">
        <h3 className="mb-4 text-sm font-weight-emphasis text-text-secondary uppercase tracking-wider">
          Architecture
        </h3>
        <div className="flex flex-col items-center gap-3 text-xs sm:flex-row sm:gap-4">
          <div className="flex items-center gap-2 rounded-sm border border-border-default bg-surface-overlay px-4 py-2">
            <Globe className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span className="text-text-primary font-weight-emphasis">Viewer</span>
            <span className="text-text-secondary">(browser)</span>
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Lock className="h-3 w-3 text-accent" aria-hidden="true" />
            <div className="h-px w-8 bg-border-strong" />
            <span className="text-[10px]">WebRTC P2P</span>
            <div className="h-px w-8 bg-border-strong" />
            <Lock className="h-3 w-3 text-accent" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 rounded-sm border border-border-default bg-surface-overlay px-4 py-2">
            <Server className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span className="text-text-primary font-weight-emphasis">Host</span>
            <span className="text-text-secondary">(Tauri/Rust)</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const stats = [
  { icon: Github, value: 100, suffix: "%", label: "Open source" },
  { icon: Zap, value: 0, prefix: "$", suffix: "", label: "Cost to use" },
  { icon: EyeOff, value: 0, suffix: "", label: "Telemetry events" },
  { icon: Layers, value: 2, suffix: "", label: "Platforms supported" },
];

function StatsSection() {
  return (
    <section className="border-y border-border-default bg-surface-raised">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-14 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-2 text-center">
            <s.icon className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-2xl font-weight-emphasis text-accent tabular-nums">
              {s.prefix || ""}<AnimatedCounter value={s.value} />{s.suffix}
            </span>
            <span className="text-xs text-text-secondary">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-weight-emphasis sm:text-3xl">See it in action</h2>
        <p className="mt-3 text-md text-text-secondary">
          A remote desktop session from start to finish
        </p>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border-default bg-surface-raised">
        {/* CSS dot-grid background */}
        <div className="absolute inset-0 z-0 opacity-[0.02]">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        <div className="relative z-10 p-6 sm:p-8">
          {/* Terminal window frame */}
          <div className="animate-glow-pulse rounded-sm border border-border-default bg-surface-overlay/80 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Terminal className="h-3 w-3 text-accent" aria-hidden="true" />
                duxo session
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-pill bg-accent/80" />
                <span className="h-2 w-2 rounded-pill bg-text-secondary/40" />
                <span className="h-2 w-2 rounded-pill bg-text-secondary/40" />
              </div>
            </div>
            <div className="relative w-full overflow-hidden rounded-sm py-16">
              <div className="flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-10">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-accent/30 bg-surface-base/60 backdrop-blur transition-colors duration-instant group-hover:border-accent/50">
                      <MonitorSmartphone className="h-7 w-7 text-accent" />
                    </div>
                    <span className="text-xs text-text-secondary">Viewer</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
                    <div className="h-0.5 w-24 animate-connection-pulse bg-accent/60" />
                    <div className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" />
                      <span>Connected</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border-strong bg-surface-base/60 backdrop-blur">
                      <Shield className="h-7 w-7 text-text-primary" />
                    </div>
                    <span className="text-xs text-text-secondary">Host</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step-by-step guide */}
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <span className="text-sm font-weight-emphasis">1</span>
                </div>
                <span className="text-sm font-weight-emphasis">Generate a code</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Launch Duxo on the host machine. An 8-digit code appears.
                No account needed.
              </p>
              <div className="rounded-sm bg-surface-overlay px-3 py-2 text-center">
                <span className="font-mono text-sm tracking-[0.2em] text-accent">
                  4A2K &mdash; 9B7D
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <span className="text-sm font-weight-emphasis">2</span>
                </div>
                <span className="text-sm font-weight-emphasis">Connect &amp; approve</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Enter the code from any browser. The host must click Allow.
              </p>
              <div className="flex items-center justify-center gap-2 rounded-sm bg-surface-overlay px-3 py-2">
                <MonitorSmartphone className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <ArrowRight className="h-3 w-3 text-accent" aria-hidden="true" />
                <span className="rounded-sm border border-border-default px-2 py-0.5 text-sm text-accent">
                  Allow
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <span className="text-sm font-weight-emphasis">3</span>
                </div>
                <span className="text-sm font-weight-emphasis">Remote control</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Full control with clipboard sync, file transfer, adaptive quality.
              </p>
              <div className="flex items-center justify-center gap-2 rounded-sm bg-surface-overlay px-3 py-2 text-sm text-success">
                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                <span>Active session</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20 text-center">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
        <h2 className="text-2xl font-weight-emphasis sm:text-3xl">
          Ready to connect?
        </h2>
        <p className="text-md text-text-secondary leading-relaxed">
          No sign-up required. Download the host binary, generate a code,
          and connect from any browser.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/download">
            <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
              Download for free
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="lg" leadingIcon={<Shield className="h-5 w-5" />}>
              Sign in
            </Button>
          </Link>
        </div>

        {/* §0.9 — trust signal: explain why no paid cert needed */}
        <p className="mt-4 text-xs text-text-secondary">
          Open source (MIT) &mdash; no telemetry, no account needed to download.{" "}
          <a
            href="https://github.com/duxo-org/duxo"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-text-primary transition-colors duration-instant"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </section>
  );
}
