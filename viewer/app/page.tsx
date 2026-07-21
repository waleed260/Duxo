import Link from "next/link";
import ImageWithBasePath from "@/components/ImageWithBasePath";
import {
  Download,
  Github,
  Shield,
  MonitorSmartphone,
  Lock,
  Fingerprint,
  ArrowRight,
  Globe,
  CheckCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <DemoSection />
        <StatsSection />
        <SecuritySection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ImageWithBasePath
          src="/images/hero-bg.jpg"
          alt=""
          fill
          className="object-cover opacity-30"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-base/80 via-surface-base/60 to-surface-base" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-base/40 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-spacing-6 py-spacing-8 text-center">
        <div className="flex items-center gap-spacing-2 rounded-pill border border-border-default bg-surface-raised/80 px-spacing-4 py-spacing-1 text-xs text-text-secondary backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-pill bg-success" />
          Open source &middot; MIT licensed &middot; v0.1.0
        </div>

        <div className="mt-spacing-6 flex flex-col gap-spacing-4">
          <h1 className="text-4xl font-weight-emphasis text-text-primary">
            Remote access,{" "}
            <span className="text-accent">built in the open.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-md text-text-secondary">
            Connect to any Windows or Linux machine, end-to-end encrypted over
            WebRTC. Open source, zero telemetry, zero cost.
          </p>
        </div>

        <div className="mt-spacing-6 flex flex-wrap items-center justify-center gap-spacing-4">
          <Link href="/download">
            <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
              Download for free
            </Button>
          </Link>
          <Link href="https://github.com/duxo-org/duxo" target="_blank">
            <Button variant="secondary" size="lg" leadingIcon={<Github className="h-5 w-5" />}>
              View on GitHub
            </Button>
          </Link>
        </div>

        <div className="relative mt-spacing-8 w-full max-w-4xl">
          <div className="animate-glow-pulse rounded-md border border-border-default bg-surface-raised p-spacing-2">
            <div className="flex items-center gap-spacing-2 border-b border-border-default px-spacing-3 py-spacing-2">
              <div className="flex gap-spacing-1">
                <span className="h-2.5 w-2.5 rounded-pill bg-accent" />
                <span className="h-2.5 w-2.5 rounded-pill bg-text-secondary" />
                <span className="h-2.5 w-2.5 rounded-pill bg-text-secondary" />
              </div>
              <span className="ml-spacing-2 text-xs text-text-secondary">
                duxo session — live preview
              </span>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-surface-overlay">
              <ImageWithBasePath
                src="/images/network.jpg"
                alt="Duxo remote desktop session preview"
                fill
                className="object-cover opacity-60"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-spacing-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-md border border-accent/30 bg-surface-base/60 backdrop-blur">
                    <MonitorSmartphone className="h-8 w-8 text-accent" />
                  </div>
                  <div className="flex flex-col items-center gap-spacing-1">
                    <div className="h-0.5 w-16 bg-accent/60 animate-connection-pulse" />
                    <div className="h-0.5 w-12 bg-accent/40 animate-connection-pulse" style={{ animationDelay: "0.5s" }} />
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border-strong bg-surface-base/60 backdrop-blur">
                    <Shield className="h-8 w-8 text-text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>
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
  },
  {
    icon: MonitorSmartphone,
    title: "Cross-platform",
    body: "Full control on Windows and Linux X11. Wayland ships view-only, honestly scoped. One binary, any machine.",
  },
  {
    icon: Fingerprint,
    title: "Host permission gate",
    body: "Every connection requires an explicit Allow click from the host. No silent takeovers, no backdoors.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-spacing-6 py-spacing-8">
      <div className="mb-spacing-7 text-center">
        <h2 className="text-2xl font-weight-emphasis">Why Duxo</h2>
        <p className="mt-spacing-2 text-md text-text-secondary">
          Built different. Built transparent.
        </p>
      </div>

      <div className="grid gap-spacing-5 sm:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="flex flex-col gap-spacing-4 rounded-md border border-border-default bg-surface-raised p-spacing-6 transition-colors duration-fast hover:border-border-strong"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="text-md font-weight-emphasis">{f.title}</h3>
            <p className="text-sm text-text-secondary">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="mx-auto max-w-6xl px-spacing-6 py-spacing-8">
      <div className="mb-spacing-7 text-center">
        <h2 className="text-2xl font-weight-emphasis">See it in action</h2>
        <p className="mt-spacing-2 text-md text-text-secondary">
          A remote desktop session from start to finish
        </p>
      </div>

      <div className="grid gap-spacing-5 sm:grid-cols-2">
        <div className="flex flex-col gap-spacing-4 rounded-md border border-border-default bg-surface-raised p-spacing-6">
          <div className="flex items-center gap-spacing-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
              <span className="text-lg font-weight-emphasis">1</span>
            </div>
            <div>
              <h3 className="text-md font-weight-emphasis">Generate a code</h3>
              <p className="text-xs text-text-secondary">On the host machine</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            Launch Duxo on the machine you want to control. An 8-digit code appears.
            No account needed — just a browser and the binary.
          </p>
          <div className="rounded-sm bg-surface-overlay px-spacing-4 py-spacing-3 text-center">
            <span className="font-mono text-2xl tracking-widest text-accent">4A2K &mdash; 9B7D</span>
          </div>
        </div>

        <div className="flex flex-col gap-spacing-4 rounded-md border border-border-default bg-surface-raised p-spacing-6">
          <div className="flex items-center gap-spacing-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
              <span className="text-lg font-weight-emphasis">2</span>
            </div>
            <div>
              <h3 className="text-md font-weight-emphasis">Connect & approve</h3>
              <p className="text-xs text-text-secondary">From any browser</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            Enter the code at duxo.app from any browser. The host sees your email
            and must click Allow. No silent takeovers, ever.
          </p>
          <div className="flex items-center justify-center gap-spacing-3 rounded-sm bg-surface-overlay px-spacing-4 py-spacing-3">
            <MonitorSmartphone className="h-5 w-5 text-text-secondary" />
            <ArrowRight className="h-4 w-4 text-accent" />
            <span className="rounded-sm border border-border-default px-spacing-2 py-spacing-1 text-xs text-accent">
              Allow
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-spacing-4 rounded-md border border-border-default bg-surface-raised p-spacing-6 sm:col-span-2">
          <div className="flex items-center gap-spacing-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
              <span className="text-lg font-weight-emphasis">3</span>
            </div>
            <div>
              <h3 className="text-md font-weight-emphasis">Remote control</h3>
              <p className="text-xs text-text-secondary">End-to-end encrypted session</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            Once approved, you get full remote control with clipboard sync,
            file transfer, and adaptive quality. Everything is encrypted end-to-end.
          </p>
          <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-surface-overlay">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-spacing-8">
                <div className="flex flex-col items-center gap-spacing-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-accent/30 bg-surface-base/60 backdrop-blur">
                    <MonitorSmartphone className="h-7 w-7 text-accent" />
                  </div>
                  <span className="text-xs text-text-secondary">Viewer</span>
                </div>
                <div className="flex flex-col items-center gap-spacing-2">
                  <div className="flex items-center gap-spacing-2 text-xs text-text-secondary">
                    <Lock className="h-3 w-3 text-accent" />
                    <span>DTLS-SRTP</span>
                  </div>
                  <div className="h-0.5 w-24 bg-accent/60 animate-connection-pulse" />
                  <div className="flex items-center gap-spacing-2 text-xs text-success">
                    <CheckCircle className="h-3 w-3" />
                    <span>Connected</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-spacing-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border-strong bg-surface-base/60 backdrop-blur">
                    <Shield className="h-7 w-7 text-text-primary" />
                  </div>
                  <span className="text-xs text-text-secondary">Host</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="border-y border-border-default bg-surface-raised">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-spacing-6 px-spacing-6 py-spacing-7 sm:grid-cols-4">
        <div className="flex flex-col items-center gap-spacing-1 text-center">
          <span className="text-2xl font-weight-emphasis text-accent">100%</span>
          <span className="text-xs text-text-secondary">Open source</span>
        </div>
        <div className="flex flex-col items-center gap-spacing-1 text-center">
          <span className="text-2xl font-weight-emphasis text-accent">$0</span>
          <span className="text-xs text-text-secondary">Cost to use</span>
        </div>
        <div className="flex flex-col items-center gap-spacing-1 text-center">
          <span className="text-2xl font-weight-emphasis text-accent">0</span>
          <span className="text-xs text-text-secondary">Telemetry events</span>
        </div>
        <div className="flex flex-col items-center gap-spacing-1 text-center">
          <span className="text-2xl font-weight-emphasis text-accent">2</span>
          <span className="text-xs text-text-secondary">Platforms supported</span>
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section id="security" className="mx-auto max-w-6xl px-spacing-6 py-spacing-8">
      <div className="relative overflow-hidden rounded-md border border-border-default bg-surface-raised">
        <div className="absolute inset-0 z-0">
          <ImageWithBasePath
            src="/images/security.jpg"
            alt=""
            fill
            className="object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/80 to-transparent" />
        </div>
        <div className="relative z-10 flex flex-col gap-spacing-5 p-spacing-6 sm:max-w-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-weight-emphasis">Trust is the product</h2>
          <div className="flex flex-col gap-spacing-3 text-sm text-text-secondary">
            <p>
              You&apos;re downloading an unsigned executable and giving it control of
              your machine. Every screen reinforces legitimacy.
            </p>
            <ul className="flex flex-col gap-spacing-2">
              <li className="flex items-start gap-spacing-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent" />
                Public source code, CI-verifiable builds
              </li>
              <li className="flex items-start gap-spacing-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent" />
                Plain-language explanations of every security warning
              </li>
              <li className="flex items-start gap-spacing-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent" />
                Host user controls every connection — no silent takeovers
              </li>
            </ul>
          </div>
          <div>
            <Link href="/download">
              <Button variant="secondary" size="md">
                Read the security model
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-spacing-6 py-spacing-8 text-center">
      <div className="flex flex-col items-center gap-spacing-5 rounded-md border border-border-default bg-surface-raised p-spacing-7">
        <Globe className="h-8 w-8 text-accent" />
        <h2 className="text-2xl font-weight-emphasis">
          Ready to connect?
        </h2>
        <p className="max-w-md text-md text-text-secondary">
          No sign-up required. Download the host binary, generate a code,
          and connect from any browser.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-spacing-4">
          <Link href="/download">
            <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
              Download for free
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
