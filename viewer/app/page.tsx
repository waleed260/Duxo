import Link from "next/link";
import {
  Download,
  Github,
  Shield,
  MonitorSmartphone,
  Lock,
  Fingerprint,
  EyeOff,
  Layers,
  Terminal,
  ExternalLink,
  Server,
  Globe,
  Zap,
  Quote,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Manifesto />
        <Features />
        <HowItWorks />
        <FinalSection />
      </main>
      <Footer />
    </>
  );
}

/* ─── Tag chip ─── */
function Tag({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-border-default bg-surface-overlay/60 px-3 py-1 text-xs text-text-secondary">
      {icon}
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════
   HERO — asymmetric editorial layout
   Left: bold headline, copy, CTAs, GitHub link
   Right: code-window visual element
   ════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-default">
      {/* CSS dot-grid texture */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.025]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Decorative accent blob — top right */}
      <div
        className="pointer-events-none absolute -right-40 -top-40 z-0 h-[500px] w-[500px] rounded-full opacity-[0.06]"
        style={{
          background:
            "radial-gradient(circle, #ef443b 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 pt-16 pb-12 md:grid-cols-5 md:pt-20 md:pb-16">
        {/* Left column: headline + CTAs (3/5) */}
        <div className="flex flex-col gap-6 md:col-span-3">
          <ScrollReveal>
            <a
              href="https://github.com/duxo-org/duxo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-pill border border-border-default bg-surface-raised px-4 py-2 text-xs text-text-secondary transition-colors duration-instant hover:border-border-strong hover:text-text-primary"
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              Open source on GitHub
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <h1 className="text-3xl font-weight-emphasis leading-tight tracking-tight text-text-primary sm:text-4xl md:text-5xl lg:text-6xl">
              Remote access{" "}
              <span className="block text-accent">you can trust.</span>
            </h1>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <p className="max-w-lg text-md leading-relaxed text-text-secondary">
              End-to-end encrypted remote desktop for Windows and Linux.
              Open source, zero telemetry, no account required to connect.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/download">
                <Button size="lg" leadingIcon={<Download className="h-5 w-5" />}>
                  Download host agent
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg">
                  Sign in to connect
                </Button>
              </Link>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={400}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <Tag icon={<Lock className="h-3 w-3" aria-hidden="true" />}>
                E2E encrypted over WebRTC
              </Tag>
              <Tag icon={<Fingerprint className="h-3 w-3" aria-hidden="true" />}>
                Permission gate
              </Tag>
              <Tag icon={<Zap className="h-3 w-3" aria-hidden="true" />}>
                Zero cost
              </Tag>
            </div>
          </ScrollReveal>
        </div>

        {/* Right column: code-window visual (2/5) */}
        <div className="relative md:col-span-2 md:-mr-6 md:mt-4">
          <ScrollReveal delay={200} variant="scale">
            <div className="rounded-sm border border-border-default bg-surface-overlay/60 backdrop-blur-sm shadow-2xl shadow-accent/5">
              {/* Terminal header */}
              <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Terminal className="h-3 w-3 text-accent" aria-hidden="true" />
                  <span className="font-mono">duxo session</span>
                </div>
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-pill bg-accent/80" />
                  <span className="h-2 w-2 rounded-pill bg-text-secondary/30" />
                  <span className="h-2 w-2 rounded-pill bg-text-secondary/30" />
                </div>
              </div>

              {/* Code content */}
              <div className="p-5 font-mono text-xs leading-relaxed sm:p-6">
                <div className="text-text-secondary">
                  <span className="text-accent">$</span>{" "}
                  <span className="text-text-primary">./duxo-host</span>
                </div>
                <div className="mt-1.5 text-text-secondary">
                  <span className="text-success">OK</span> Session created
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-text-secondary">Code:</span>
                  <span className="text-2xl font-weight-emphasis tracking-[0.15em] text-accent">
                    4A2K 9B7D
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-text-secondary">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-pill bg-accent" />
                  Waiting for connection…
                </div>

                <div className="my-4 border-t border-border-default" />

                <div className="text-text-secondary">
                  <span className="text-text-primary">viewer@remote</span> connected
                </div>
                <div className="text-text-secondary">
                  <span className="text-accent">$</span>{" "}
                  <span className="text-text-primary">Full control</span>{" "}
                  <span className="text-success">[active]</span>
                </div>
              </div>
            </div>

            {/* Decorative accent dot behind the window */}
            <div
              className="pointer-events-none absolute -bottom-3 -right-3 -z-10 h-24 w-24 rounded-full opacity-[0.08]"
              style={{
                background:
                  "radial-gradient(circle, #ef443b 0%, transparent 70%)",
              }}
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   MANIFESTO — editorial two-column statement
   Why remote access should be open
   ════════════════════════════════════════════════ */
function Manifesto() {
  return (
    <section className="border-b border-border-default bg-surface-raised/50">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <ScrollReveal>
          <div className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-text-secondary">
            <Quote className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>Philosophy</span>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <blockquote className="max-w-3xl text-2xl font-weight-emphasis leading-snug text-text-primary sm:text-3xl md:text-4xl">
            Remote access shouldn&apos;t require{" "}
            <span className="text-accent">trusting a corporation</span>
            {" "}with your screen.
          </blockquote>
        </ScrollReveal>

        <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-12">
          <ScrollReveal delay={200}>
            <div className="flex flex-col gap-4">
              <p className="text-md leading-relaxed text-text-secondary">
                Every major remote desktop tool routes your session through
                servers you don&apos;t control. They log connection metadata,
                inject telemetry, and charge recurring fees for basic features.
              </p>
              <p className="text-md leading-relaxed text-text-secondary">
                Duxo was built differently. Your screen data never touches our
                infrastructure — WebRTC connects peers directly, end-to-end
                encrypted by default. The only thing we see is a session ID
                and an 8-digit code.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="flex flex-col gap-4">
              <p className="text-md leading-relaxed text-text-secondary">
                No telemetry. No account required to connect. No VC-funded
                roadmap that deprioritizes self-hosting. Open source (MIT)
                means the code you run is the code you can audit.
              </p>
              <p className="text-md leading-relaxed text-text-secondary">
                This isn&apos;t a charity — it&apos;s a statement that secure
                remote access is infrastructure, not a product to be metered.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FEATURES — asymmetric grid with scroll reveals
   Wraps the entire grid section for reveal, not individual cards
   to avoid breaking the grid layout.
   ════════════════════════════════════════════════ */
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
    gradient: "from-accent/8 to-transparent",
  },
  {
    icon: Fingerprint,
    title: "Permission gate",
    body: "Every connection requires an explicit Allow click from the host. No silent takeovers, no backdoors.",
    tags: ["Security", "Access control"],
    gradient: "from-accent/10 to-transparent",
  },
  {
    icon: Shield,
    title: "Zero-budget security",
    body: "JWT verification client-side, OS keychain storage, rate-limited codes, SHA-256 audit chain. No paid services needed.",
    tags: ["JWT", "Keychain", "Audit"],
    gradient: "from-accent/8 to-transparent",
  },
  {
    icon: Server,
    title: "Self-healing connection",
    body: "ICE restart with exponential backoff reconnects after transient drops — no new 8-digit code needed mid-session.",
    tags: ["ICE restart", "Resilient"],
    gradient: "from-accent/10 to-transparent",
  },
  {
    icon: Layers,
    title: "Two platforms, one binary",
    body: "Windows DXGI and Linux X11 capture paths in a single portable binary. No installers, no admin needed.",
    tags: ["Portable", "No installer"],
    gradient: "from-accent/8 to-transparent",
  },
];

function Features() {
  return (
    <section id="features" className="border-b border-border-default scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-text-secondary">
            <Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>Capabilities</span>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h2 className="max-w-2xl text-2xl font-weight-emphasis sm:text-3xl md:text-4xl">
            Built for the{" "}
            <span className="text-accent">edge case you didn&apos;t think of.</span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`group relative overflow-hidden rounded-sm border border-border-default bg-surface-raised p-6 transition-all duration-300 hover:border-border-strong ${
                  /* Asymmetric overlap offsets — staggered vertical rhythm */
                  i % 3 === 0 ? "md:-mt-4 md:mb-4" : ""
                } ${i % 3 === 2 ? "md:mt-4 md:-mb-4" : ""}`}
              >
                {/* Hover gradient */}
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                />

                {/* Decorative corner */}
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full border border-accent/5" />

                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-accent/10 text-accent">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-weight-emphasis">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {f.body}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   HOW IT WORKS — architectural flow + stats
   ════════════════════════════════════════════════ */
function HowItWorks() {
  const stats = [
    { icon: Github, value: 100, suffix: "%", label: "Open source" },
    { icon: Zap, value: 0, prefix: "$", suffix: "", label: "Cost to use" },
    { icon: EyeOff, value: 0, suffix: "", label: "Telemetry events" },
    { icon: Layers, value: 2, suffix: "", label: "Platforms" },
  ];

  return (
    <section id="demo" className="border-b border-border-default scroll-mt-20">
      {/* Stats bar */}
      <div className="border-b border-border-default bg-surface-raised">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-10 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1.5 text-center">
              <s.icon className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-2xl font-weight-emphasis text-accent tabular-nums">
                {s.prefix || ""}<AnimatedCounter value={s.value} />{s.suffix}
              </span>
              <span className="text-xs text-text-secondary">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Architectural flow diagram */}
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-text-secondary">
            <Globe className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>Architecture</span>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h2 className="max-w-2xl text-2xl font-weight-emphasis sm:text-3xl md:text-4xl">
            Peer-to-peer by default,{" "}
            <span className="text-accent">relay when needed.</span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-10 rounded-sm border border-border-default bg-surface-raised p-6 sm:p-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
              {/* Viewer */}
              <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
                <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-accent/30 bg-surface-overlay">
                  <MonitorSmartphone className="h-8 w-8 text-accent" />
                </div>
                <span className="text-xs font-weight-emphasis text-text-primary">Viewer</span>
                <span className="text-[10px] text-text-secondary">Browser / Next.js</span>
              </div>

              {/* Connection line */}
              <div className="flex w-full flex-col items-center gap-1 sm:w-auto">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Lock className="h-3 w-3 text-success" aria-hidden="true" />
                  <span>WebRTC P2P</span>
                  <Lock className="h-3 w-3 text-success" aria-hidden="true" />
                </div>
                <div className="flex w-full items-center gap-2 sm:flex-col">
                  <div className="h-px flex-1 bg-gradient-to-r from-accent/0 via-accent/40 to-accent/0 sm:h-16 sm:w-px sm:from-accent/0 sm:via-accent/40 sm:to-accent/0" />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                  <span>STUN</span>
                  <span className="text-text-secondary/40">|</span>
                  <span>Metered TURN</span>
                  <span className="text-text-secondary/40">|</span>
                  <span>Oracle Coturn</span>
                </div>
              </div>

              {/* Host */}
              <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
                <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-border-strong bg-surface-overlay">
                  <Server className="h-8 w-8 text-text-primary" />
                </div>
                <span className="text-xs font-weight-emphasis text-text-primary">Host</span>
                <span className="text-[10px] text-text-secondary">Tauri / Rust</span>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-text-secondary">
              Signaling via Firebase RTDB &middot;{" "}
              Video/input never touches our infrastructure
            </div>
          </div>
        </ScrollReveal>

        {/* Three steps */}
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Generate a code",
              desc: "Launch Duxo on the host machine. An 8-digit code appears — share it with your viewer.",
            },
            {
              step: "02",
              title: "Connect & approve",
              desc: "Enter the code from any browser. The host sees your email and must click Allow.",
            },
            {
              step: "03",
              title: "Full remote control",
              desc: "Real-time screen, mouse, keyboard, clipboard — all over an encrypted P2P connection.",
            },
          ].map((item) => (
            <ScrollReveal key={item.step} delay={Number.parseInt(item.step) * 80}>
              <div className="flex flex-col gap-3 rounded-sm border border-border-default bg-surface-raised p-5">
                <span className="text-xs font-mono text-accent">{item.step}</span>
                <h3 className="text-md font-weight-emphasis">{item.title}</h3>
                <p className="text-sm leading-relaxed text-text-secondary">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FINAL SECTION — combined CTA + trust signals
   ════════════════════════════════════════════════ */
function FinalSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative accent blob */}
      <div
        className="pointer-events-none absolute -left-40 -bottom-40 z-0 h-[500px] w-[500px] rounded-full opacity-[0.04]"
        style={{
          background:
            "radial-gradient(circle, #ef443b 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <ScrollReveal>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
            <h2 className="text-2xl font-weight-emphasis sm:text-3xl md:text-4xl">
              Start connecting.
            </h2>
            <p className="text-md leading-relaxed text-text-secondary">
              No sign-up required to download. Generate a code, share it,
              connect from any browser. It&apos;s that simple.
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
            <p className="mt-4 text-xs text-text-secondary">
              Open source (MIT) &mdash; no telemetry, no account needed.{" "}
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
        </ScrollReveal>
      </div>
    </section>
  );
}
