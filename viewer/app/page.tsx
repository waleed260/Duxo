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
  CheckCircle,
  Code,
  EyeOff,
  Layers,
  Terminal,
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
    <span className="rounded-pill border border-border-default bg-surface-raised px-3 py-1 text-xs text-text-secondary">
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

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ImageWithBasePath
          src="/images/hero-bg.jpg"
          alt=""
          fill
          className="object-cover opacity-20"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-base via-surface-base/80 to-surface-base" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 py-8 text-center">
        <div className="flex flex-col gap-5 text-center">
          <h1 className="max-w-4xl text-4xl font-weight-emphasis text-text-primary">
            Remote access,{" "}
            <span className="text-accent">built in the open.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-md text-text-secondary">
            Connect to any Windows or Linux machine, end-to-end encrypted over
            WebRTC. Open source, zero telemetry, zero cost.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
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

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Tag>E2E encrypted</Tag>
          <Tag>Cross-platform</Tag>
          <Tag>Permission gate</Tag>
          <Tag>Open source</Tag>
          <Tag>Zero cost</Tag>
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
    image: "/images/security.jpg",
    tags: ["WebRTC", "DTLS-SRTP", "Privacy"],
  },
  {
    icon: MonitorSmartphone,
    title: "Cross-platform",
    body: "Full control on Windows and Linux X11. Wayland ships view-only, honestly scoped. One binary, any machine.",
    image: "/images/devices.jpg",
    tags: ["Windows", "Linux", "X11"],
  },
  {
    icon: Fingerprint,
    title: "Host permission gate",
    body: "Every connection requires an explicit Allow click from the host. No silent takeovers, no backdoors.",
    image: "/images/network.jpg",
    tags: ["Security", "Access control", "Privacy"],
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-7 text-center">
        <h2 className="text-2xl font-weight-emphasis">Why Duxo</h2>
        <p className="mt-2 text-md text-text-secondary">
          Built different. Built transparent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="relative overflow-hidden rounded-md border border-border-default bg-surface-raised"
          >
            <div className="absolute inset-0 z-0">
              <ImageWithBasePath
                src={f.image}
                alt=""
                fill
                className="object-cover opacity-10"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/70 to-transparent" />
            </div>
            <div className="relative z-10 flex flex-col gap-4 p-6 sm:max-w-xl">
              <IconBox>
                <f.icon className="h-5 w-5" />
              </IconBox>
              <h3 className="text-xl font-weight-emphasis">{f.title}</h3>
              <p className="text-sm text-text-secondary">{f.body}</p>
              <div className="flex flex-wrap gap-2">
                {f.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const stats = [
  { icon: Github, value: 100, suffix: "%", label: "Open source" },
  { icon: Code, value: 0, prefix: "$", suffix: "", label: "Cost to use" },
  { icon: EyeOff, value: 0, suffix: "", label: "Telemetry events" },
  { icon: Layers, value: 2, suffix: "", label: "Platforms supported" },
];

function StatsSection() {
  return (
    <section className="border-y border-border-default bg-surface-raised">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-12 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-2 text-center">
            <s.icon className="h-4 w-4 text-accent" />
            <span className="text-2xl font-weight-emphasis text-accent">
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
    <section id="demo" className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-7 text-center">
        <h2 className="text-2xl font-weight-emphasis">See it in action</h2>
        <p className="mt-2 text-md text-text-secondary">
          A remote desktop session from start to finish
        </p>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border-default bg-surface-raised">
        <div className="absolute inset-0 z-0">
          <ImageWithBasePath
            src="/images/network.jpg"
            alt=""
            fill
            className="object-cover opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/70 to-surface-raised" />
        </div>
        <div className="relative z-10 p-6">
          <div className="animate-glow-pulse rounded-sm border border-border-default bg-surface-overlay/60 backdrop-blur">
            <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Terminal className="h-3 w-3 text-accent" />
                duxo session
              </div>
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-pill bg-accent" />
                <span className="h-2 w-2 rounded-pill bg-text-secondary" />
                <span className="h-2 w-2 rounded-pill bg-text-secondary" />
              </div>
            </div>
            <div className="relative w-full overflow-hidden rounded-sm py-12">
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-accent/30 bg-surface-base/60 backdrop-blur">
                      <MonitorSmartphone className="h-6 w-6 text-accent" />
                    </div>
                    <span className="text-xs text-text-secondary">Viewer</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Lock className="h-4 w-4 text-accent" />
                    <div className="h-0.5 w-24 bg-accent/60 animate-connection-pulse" />
                    <div className="flex items-center gap-2 text-xs text-success">
                      <CheckCircle className="h-3 w-3" />
                      <span>Connected</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border-strong bg-surface-base/60 backdrop-blur">
                      <Shield className="h-6 w-6 text-text-primary" />
                    </div>
                    <span className="text-xs text-text-secondary">Host</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <span className="text-sm font-weight-emphasis">1</span>
                </div>
                <span className="text-sm font-weight-emphasis">Generate a code</span>
              </div>
              <p className="text-sm text-text-secondary">
                Launch Duxo on the host machine. An 8-digit code appears.
                No account needed.
              </p>
              <div className="rounded-sm bg-surface-overlay px-3 py-2 text-center">
                <span className="font-mono text-sm tracking-widest text-accent">4A2K &mdash; 9B7D</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <span className="text-sm font-weight-emphasis">2</span>
                </div>
                <span className="text-sm font-weight-emphasis">Connect & approve</span>
              </div>
              <p className="text-sm text-text-secondary">
                Enter the code from any browser. The host must click Allow.
              </p>
              <div className="flex items-center justify-center gap-2 rounded-sm bg-surface-overlay px-3 py-2">
                <MonitorSmartphone className="h-4 w-4 text-text-secondary" />
                <ArrowRight className="h-3 w-3 text-accent" />
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
              <p className="text-sm text-text-secondary">
                Full control with clipboard sync, file transfer, adaptive quality.
              </p>
              <div className="flex items-center justify-center gap-2 rounded-sm bg-surface-overlay px-3 py-2 text-sm text-success">
                <CheckCircle className="h-3 w-3" />
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
    <section className="mx-auto max-w-6xl px-6 py-8 text-center">
      <div className="flex flex-col items-center gap-5">
        <h2 className="text-2xl font-weight-emphasis">
          Ready to connect?
        </h2>
        <p className="max-w-md text-md text-text-secondary">
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
            <Button variant="secondary" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
