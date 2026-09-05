import Link from "next/link";
import {
  Shield,
  MonitorSmartphone,
  Lock,
  Fingerprint,
  Check,
  X,
  Layers,
  Server,
  ChevronRight,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { ScrollReveal } from "@/components/ScrollReveal";
import { LightNav } from "@/components/landing/LightNav";

/**
 * Duxo marketing homepage.
 *
 * Visual language is intentionally isolated from the shared app chrome
 * (Navbar/Footer stay dark for the authenticated product). This page is a
 * self-contained monochrome-editorial surface — obsidian / paper-white /
 * graphite / warm-stone, with a single small chromatic accent (ember) used
 * only inside illustrations, never on text or CTAs.
 *
 * Anchor ids (#features, #demo, #security) are kept stable because the
 * shared Navbar/Footer (used on /download, /login, etc.) still deep-link
 * to them.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#121211] antialiased" style={{ colorScheme: "light" }}>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-20 rounded bg-black px-4 py-2 text-sm text-white transition-transform duration-150 focus-visible:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        Skip to content
      </a>
      <LightNav />
      <main id="main-content">
        <Hero />
        <StatsGrid />
        <WhyDuxo />
        <Features />
        <Architecture />
        <Steps />
        <Trust />
        <FAQ />
        <FinalCTA />
      </main>
      <LightFooter />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared style atoms
   ───────────────────────────────────────────── */
const ghostBtnDark =
  "touch-manipulation inline-flex items-center gap-1.5 rounded border border-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-black transition-colors duration-150 hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2";

const filledBtnLight =
  "touch-manipulation inline-flex items-center gap-1.5 rounded bg-white px-6 py-3.5 text-xs font-medium uppercase tracking-[0.1em] text-black transition-colors duration-150 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2";

const filledBtnDark =
  "touch-manipulation inline-flex items-center gap-1.5 rounded bg-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-[#2a2a28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#575551]">
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════
   HERO — transparent nav overlaid on an original dark
   "connection glow" backdrop (abstract, not photographic —
   deliberately not Planhat's forest-photo treatment), fading
   to white below. LightNav renders fixed, so this section
   reserves its own top padding to clear the bar.
   ════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0b0b0a]">
      {/* Layered color depth — warm amber + graphite glows over near-black */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(65% 60% at 10% 8%, rgba(232,120,60,0.28) 0%, transparent 60%)," +
            "radial-gradient(55% 55% at 90% -5%, rgba(149,141,126,0.20) 0%, transparent 60%)," +
            "radial-gradient(90% 70% at 50% 105%, rgba(232,85,43,0.14) 0%, transparent 70%)," +
            "linear-gradient(180deg, #100e0a 0%, #050403 60%, #000000 100%)",
        }}
        aria-hidden="true"
      />
      {/* Fluted-glass ribbing — a generic, non-photographic texture device
          (not Planhat's forest photo) that still reads as "shot through
          glass," giving the gradient physical depth. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(100deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 14px)",
        }}
        aria-hidden="true"
      />
      {/* Film-grain texture via SVG turbulence — procedural, not a stock photo */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35] mix-blend-overlay" aria-hidden="true">
        <filter id="hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.4 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
        viewBox="0 0 1440 780"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M -50 620 L 500 380 L 1000 480 L 1550 220"
          className="stroke-[#958d7e]"
          strokeWidth="1"
        />
        <circle cx="500" cy="380" r="3" className="fill-[#e8552b]" />
        <circle cx="1000" cy="480" r="3" className="fill-[#958d7e]" />
      </svg>

      <div className="relative mx-auto flex max-w-[1280px] flex-col gap-6 px-6 pt-28 pb-20 sm:pt-36 sm:pb-24 md:w-[55%] md:pt-44 md:pb-28">
        <ScrollReveal>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#d8b998]">
            Open source remote access
          </span>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h1 className="text-balance text-[42px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[56px] sm:tracking-[-0.04em] md:text-[64px] md:tracking-[-0.045em]">
            Remote access, without the trust exercise.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <p className="max-w-md text-lg leading-[1.4] tracking-[-0.01em] text-white/72">
            Duxo connects two machines directly over an encrypted
            peer-to-peer channel — no servers in the middle, no account
            required to receive a session, no cost.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="flex flex-wrap items-center gap-6 pt-2">
            <Link href="/download" className={filledBtnLight}>
              Download Duxo
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <a
              href="https://github.com/waleed260/Duxo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded text-xs font-medium uppercase tracking-[0.1em] text-white/65 transition-colors duration-150 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              <GithubIcon className="h-3.5 w-3.5" aria-hidden="true" />
              View source
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   STATS GRID — hairline-bordered table, standing in
   for a customer-logo grid Duxo doesn't have.
   ════════════════════════════════════════════════ */
function StatsGrid() {
  const stats = [
    { value: "100%", label: "Open source" },
    { value: "$0", label: "Cost to use" },
    { value: "0", label: "Telemetry events" },
    { value: "2", label: "Platforms supported" },
  ];

  return (
    <section className="border-b border-black bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 border-l border-black sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex min-h-[140px] flex-col items-center justify-center gap-1 border-b border-r border-black px-4 py-8 text-center sm:border-b-0"
          >
            <span className="text-3xl font-medium tracking-[-0.03em] text-black">{s.value}</span>
            <span className="text-xs tracking-[-0.01em] text-[#575551]">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   WHY DUXO — section heading pair.
   ════════════════════════════════════════════════ */
function WhyDuxo() {
  return (
    <section className="border-b border-black bg-white">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-6 py-16 sm:py-20 md:grid-cols-2 md:gap-16 md:py-24">
        <ScrollReveal>
          <Eyebrow>Why Duxo exists</Eyebrow>
          <h2 className="text-balance mt-4 text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-black sm:text-[42px] sm:tracking-[-0.035em]">
            Remote access shouldn’t require trusting a corporation with
            your screen.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="flex flex-col gap-4 pt-1">
            <p className="text-lg leading-[1.4] tracking-[-0.01em] text-[#575551]">
              Most remote desktop tools quietly route your session through a
              server they control, log connection metadata, and charge a
              subscription for basic features. Duxo connects two machines
              directly — the only things that ever reach our infrastructure
              are a session ID and an 8-digit code.
            </p>
            <p className="text-lg leading-[1.4] tracking-[-0.01em] text-[#575551]">
              No telemetry, no account required to receive a connection, and
              a full MIT-licensed source tree anyone can read and audit.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FEATURES — 3-column cards with a small mockup
   illustration, tinted panel, no shadow.
   ════════════════════════════════════════════════ */
const features = [
  {
    icon: Lock,
    title: "End-to-end encrypted",
    body: "DTLS-SRTP over WebRTC secures every session. Even the relay that helps two machines find each other can’t decrypt your traffic.",
  },
  {
    icon: Fingerprint,
    title: "Explicit consent",
    body: "Every connection needs an Allow click on the host machine. No silent takeovers, no backdoor for anyone.",
  },
  {
    icon: MonitorSmartphone,
    title: "Cross-platform",
    body: "Full mouse and keyboard control on Windows and Linux (X11), shipped as one portable binary with no installer.",
  },
  {
    icon: Shield,
    title: "Zero-budget security",
    body: "Client-side token verification, OS keychain storage, rate-limited codes, and a SHA-256 audit chain.",
  },
  {
    icon: Server,
    title: "Self-healing connection",
    body: "A dropped network reconnects automatically via ICE restart — no new code, no re-approval needed.",
  },
  {
    icon: Layers,
    title: "One binary, no installer",
    body: "Windows and Linux capture paths ship together. Nothing to install, no admin rights required.",
  },
];

function MockupPanel({ Icon }: { Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex h-32 flex-col justify-between rounded bg-[#f0eeea] p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-white">
          <Icon className="h-4 w-4 text-black" aria-hidden="true" />
        </div>
        <span className="rounded-full bg-[#e8552b] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
          Active
        </span>
      </div>
      <div className="h-px w-full bg-black/10" />
      <div className="flex gap-1.5">
        <span className="h-2 w-10 rounded-full bg-black/10" />
        <span className="h-2 w-6 rounded-full bg-black/10" />
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-b border-black bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:py-20 md:py-24">
        <ScrollReveal>
          <Eyebrow>Capabilities</Eyebrow>
          <h2 className="text-balance mt-4 max-w-2xl text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-black sm:text-[42px]">
            Everything a remote session needs.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="flex flex-col gap-4 rounded-lg bg-[#f5f5f3] p-6">
                <MockupPanel Icon={f.icon} />
                <h3 className="text-lg font-medium tracking-[-0.01em] text-black">{f.title}</h3>
                <p className="text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">{f.body}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   HOW IT WORKS — full-bleed dark band for the
   architecture diagram (Planhat-style light/dark
   rhythm), then a plain white row of three steps.
   ════════════════════════════════════════════════ */
function Architecture() {
  return (
    <section id="demo" className="scroll-mt-16 border-b border-black bg-black">
      <div className="mx-auto max-w-[1280px] px-6 py-16 text-center sm:py-20 md:py-24">
        <ScrollReveal>
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">
            How it works
          </span>
          <h2 className="text-balance mx-auto mt-4 max-w-2xl text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-white sm:text-[42px]">
            Peer-to-peer by default, relay only when needed.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="mx-auto mt-12 max-w-3xl rounded-lg border border-white/20 p-6 sm:p-10">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded border border-white/30">
                  <MonitorSmartphone className="h-7 w-7 text-white" aria-hidden="true" />
                </div>
                <span className="text-xs font-medium tracking-[-0.01em] text-white">Viewer</span>
                <span className="text-[11px] text-white/50">Browser</span>
              </div>

              <div className="flex flex-1 flex-col items-center gap-2 px-4">
                <div className="flex items-center gap-2 text-[11px] tracking-[-0.01em] text-white/70">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  WebRTC, end-to-end encrypted
                  <Lock className="h-3 w-3" aria-hidden="true" />
                </div>
                <div className="h-px w-full bg-white/20" />
                <div className="text-[10px] tracking-[-0.01em] text-white/50">
                  STUN &middot; Metered TURN &middot; Oracle Coturn
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded border border-white/30">
                  <Server className="h-7 w-7 text-white" aria-hidden="true" />
                </div>
                <span className="text-xs font-medium tracking-[-0.01em] text-white">Host</span>
                <span className="text-[11px] text-white/50">Tauri / Rust</span>
              </div>
            </div>

            <p className="mt-8 text-center text-xs tracking-[-0.01em] text-white/50">
              Signaling via Firebase Realtime Database &middot; video and
              input never touch our infrastructure
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section className="border-b border-black bg-white">
      <div className="mx-auto grid max-w-[1280px] gap-px overflow-hidden border-x border-black bg-black sm:grid-cols-3">
        {[
          {
            step: "01",
            title: "Generate a code",
            desc: "Launch the Duxo host agent on the machine you want to reach. An 8-digit code appears.",
          },
          {
            step: "02",
            title: "Connect & approve",
            desc: "Enter the code from any browser — no install needed. The host must click Allow.",
          },
          {
            step: "03",
            title: "Full remote control",
            desc: "Real-time screen, mouse, keyboard, and clipboard, all over one encrypted connection.",
          },
        ].map((item) => (
          <ScrollReveal key={item.step} delay={Number.parseInt(item.step) * 80}>
            <div className="flex h-full flex-col gap-3 bg-white p-8">
              <span className="text-xs tracking-[-0.01em] text-[#958d7e]">{item.step}</span>
              <h3 className="text-base font-medium tracking-[-0.01em] text-black">{item.title}</h3>
              <p className="text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">{item.desc}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   TRUST — "always / never" guarantees, monochrome.
   ════════════════════════════════════════════════ */
function Trust() {
  const does = [
    "Encrypts every session end-to-end with DTLS-SRTP over WebRTC",
    "Requires an explicit Allow click on the host before any control begins",
    "Stores secrets in your OS keychain, never in plaintext on disk",
    "Verifies every session with a signed token before video ever streams",
    "Rate-limits connection codes to stop brute-force guessing",
    "Publishes its full source under the MIT license for anyone to audit",
  ];

  const never = [
    "Never routes your screen or input through Duxo’s servers",
    "Never collects analytics, usage tracking, or telemetry of any kind",
    "Never requires the person receiving a connection to have an account",
    "Never shows ads or sells data — there is nothing to sell",
    "Never starts a session without a human approving it on the host",
    "Never charges for core remote access features",
  ];

  return (
    <section id="security" className="scroll-mt-16 border-b border-black bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:py-20 md:py-24">
        <ScrollReveal>
          <Eyebrow>Security & privacy</Eyebrow>
          <h2 className="text-balance mt-4 max-w-2xl text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-black sm:text-[42px]">
            What Duxo does — and what it never will.
          </h2>
        </ScrollReveal>

        <div className="mt-10 grid overflow-hidden rounded-lg border border-black md:grid-cols-2">
          <ScrollReveal delay={150}>
            <div className="flex h-full flex-col gap-4 border-b border-black p-6 sm:p-8 md:border-b-0 md:border-r">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.08em] text-black">
                <Check className="h-4 w-4" aria-hidden="true" />
                Always
              </h3>
              <ul className="flex flex-col gap-3">
                {does.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={250}>
            <div className="flex h-full flex-col gap-4 p-6 sm:p-8">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.08em] text-[#958d7e]">
                <X className="h-4 w-4" aria-hidden="true" />
                Never
              </h3>
              <ul className="flex flex-col gap-3">
                {never.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#958d7e]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FAQ — real remaining questions, hairline dividers,
   no accordion needed at this length.
   ════════════════════════════════════════════════ */
function FAQ() {
  const faqs = [
    {
      q: "Is Duxo actually free, or is there a catch?",
      a: "It’s free because it’s open source (MIT licensed) — there’s no paid tier, no usage limits, and no feature gated behind a subscription. You can also read the source yourself to confirm that.",
    },
    {
      q: "What operating systems does it support?",
      a: "The host agent runs on Windows and Linux, with full mouse and keyboard control on both (X11 on Linux; Wayland connects view-only for now). The viewer runs in any modern browser.",
    },
    {
      q: "Does the person receiving a connection need an account?",
      a: "No. Only the person initiating a session needs to sign in. Anyone can enter a connection code from a browser without creating an account.",
    },
    {
      q: "What happens if my network connection drops mid-session?",
      a: "Duxo attempts an ICE restart with exponential backoff to reconnect automatically, using the same session — you won’t need a new code or to re-approve the connection.",
    },
    {
      q: "Can I self-host or audit the infrastructure myself?",
      a: "Yes. The full source — host agent, viewer, and signaling — is on GitHub under the MIT license, so you can audit it, fork it, or run your own signaling and TURN infrastructure.",
    },
  ];

  return (
    <section className="border-b border-black bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:py-20 md:py-24">
        <ScrollReveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className="text-balance mt-4 max-w-2xl text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-black sm:text-[42px]">
            Answers before you download.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="mt-10 max-w-3xl divide-y divide-black border-t border-b border-black">
            {faqs.map((item) => (
              <div key={item.q} className="flex flex-col gap-2 py-6 sm:flex-row sm:gap-12">
                <h3 className="text-base font-medium tracking-[-0.01em] text-black sm:w-1/3">
                  {item.q}
                </h3>
                <p className="text-sm leading-[1.5] tracking-[-0.01em] text-[#575551] sm:w-2/3">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FINAL CTA — centered narrow block.
   ════════════════════════════════════════════════ */
function FinalCTA() {
  return (
    <section className="bg-white">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-20 text-center sm:py-28">
        <ScrollReveal>
          <Eyebrow>Get started</Eyebrow>
          <h2 className="text-balance mt-4 text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-black sm:text-[42px]">
            Start connecting.
          </h2>
          <p className="mt-4 text-lg leading-[1.4] tracking-[-0.01em] text-[#575551]">
            No sign-up required to download. Generate a code, share it,
            connect from any browser.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/download" className={filledBtnDark}>
              Download for free
            </Link>
            <Link href="/login" className={ghostBtnDark}>
              Sign in
            </Link>
          </div>
          <p className="mt-6 text-xs tracking-[-0.01em] text-[#958d7e]">
            Open source (MIT) — no telemetry, no account needed.{" "}
            <a
              href="https://github.com/waleed260/Duxo"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded underline hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
            >
              View on GitHub
            </a>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FOOTER — link groups, hairline top border.
   ════════════════════════════════════════════════ */
function LightFooter() {
  return (
    <footer className="border-t border-black bg-white">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-6 py-16 sm:grid-cols-3">
        <div>
          <span className="text-lg font-medium tracking-[-0.03em] text-black">Duxo</span>
          <p className="mt-3 text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">
            Remote access, built in the open. Zero-budget, end-to-end
            encrypted.
          </p>
        </div>

        <FooterGroup
          title="Product"
          links={[
            { href: "/download", label: "Download" },
            { href: "/#features", label: "Features" },
            { href: "/#demo", label: "How it works" },
            { href: "/login", label: "Sign in" },
          ]}
        />

        <FooterGroup
          title="Resources"
          links={[
            { href: "/#security", label: "Security" },
            {
              href: "https://github.com/waleed260/Duxo/blob/main/SECURITY.md",
              label: "Security policy",
            },
            {
              href: "https://github.com/waleed260/Duxo/blob/main/CONTRIBUTING.md",
              label: "Contributing",
            },
          ]}
        />
      </div>

      <div className="border-t border-black px-6 py-10 text-center sm:py-14">
        <span className="text-[15vw] font-medium leading-none tracking-[-0.04em] text-black sm:text-[100px]">
          Connect freely.
        </span>
      </div>

      <div className="border-t border-black px-6 py-5 text-center text-xs tracking-[-0.01em] text-[#958d7e]">
        © {new Date().getFullYear()} Duxo — open source, MIT licensed.
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav className="flex flex-col gap-2.5">
      <span className="text-xs font-medium uppercase tracking-[0.1em] text-[#575551]">{title}</span>
      {links.map((l) => {
        const isExternal = l.href.startsWith("http");
        return (
          <Link
            key={l.label}
            href={l.href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="rounded text-sm tracking-[-0.01em] text-black transition-colors duration-150 hover:text-[#575551] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
