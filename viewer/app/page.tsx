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
  ArrowUpRight,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SiteNav } from "@/components/landing/SiteNav";
import { SiteFooter } from "@/components/landing/SiteFooter";

/**
 * Duxo marketing homepage.
 *
 * Built to the design language captured in viewer/DESIGN.md. The three
 * rules that matter, because they're what the page will drift away from if
 * edited casually:
 *
 *  1. ONE canvas. `#050506` runs unbroken from the nav to the footer. There
 *     are no alternating light/dark bands and no rules between sections —
 *     sections are separated by space alone. Depth comes from ambient
 *     radial glows and from cards, never from a background change.
 *  2. Display type is weight 400, `leading-none` (line-height exactly 1),
 *     tracking -0.03em. Hierarchy is carried by size and colour, never by
 *     weight. Nothing on this page is bold.
 *  3. Every button is a pill. Sage `#8fbe8e` fills the primary action and
 *     nothing else; ember `#e8552b` tags categories and never acts as a
 *     button. Sentence case throughout, including CTAs.
 *
 * Text tops out at `white/94` — pure white is never used, which is what
 * keeps a near-black page from glaring.
 *
 * Anchor ids (#features, #demo, #security) are kept stable because the
 * shared Navbar/Footer (used on /download, /session, etc.) deep-link to
 * them, and e2e/landing.spec.ts asserts the nav links resolve.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050506] text-white/94 antialiased" style={{ colorScheme: "dark" }}>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm text-black transition-transform duration-150 focus-visible:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main-content">
        <Hero />
        <StatBand />
        <WhyDuxo />
        <Features />
        <Architecture />
        <Steps />
        <Trust />
        <FAQ />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared style atoms
   ───────────────────────────────────────────── */

/** Pill buttons. All variants carry a border so their box heights match. */
const btnBase =
  "touch-manipulation inline-flex items-center gap-2 rounded-full border px-6 py-3 text-[15px] leading-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const btnPrimary = `${btnBase} border-transparent bg-[#8fbe8e] text-[#0a0b0c] hover:bg-[#a2caa1] focus-visible:outline-[#8fbe8e]`;

const btnGhost = `${btnBase} border-transparent bg-white/10 text-white/94 hover:bg-white/[0.16] focus-visible:outline-white`;

const btnQuiet =
  "touch-manipulation inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-[15px] leading-none text-white/70 transition-colors duration-150 hover:border-white/40 hover:text-white/94 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2";

/** Display heading — weight 400, line-height 1, tracking -0.03em. */
const displayH2 =
  "text-balance text-[38px] leading-none tracking-[-0.03em] text-white/94 sm:text-[48px] lg:text-[60px]";

const bodyLead = "text-[17px] leading-[1.5] tracking-[-0.01em] sm:text-[18px]";

/** Section rhythm — space, never a rule or a background change. */
const band = "px-6 py-24 sm:py-28 lg:py-36";

const container = "mx-auto w-full max-w-[1180px]";

/** Standard content card: hairline border, fill a shade above the canvas. */
const card = "rounded-2xl border border-white/[0.07] bg-[#0d0e11]";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[12px] uppercase tracking-[0.08em] text-white/40">
      {children}
    </span>
  );
}

/**
 * Ambient glow — the only saturated colour on the canvas. Kept under ~25%
 * alpha and heavily spread so it reads as light in the room rather than as
 * a gradient panel with edges.
 *
 * Deliberately NOT negatively z-indexed: the page's canvas colour sits on
 * the root element, and a negative z-index would drop the glow behind that
 * background and render it invisible. It stays at the default level and
 * every sibling that should sit on top of it is marked `relative`, which is
 * enough because the glow always comes first in DOM order.
 */
function Glow({
  className = "",
  from = "rgba(143,190,142,0.20)",
}: {
  className?: string;
  from?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full blur-[120px] ${className}`}
      style={{ background: `radial-gradient(circle, ${from} 0%, transparent 70%)` }}
      aria-hidden="true"
    />
  );
}

/* ════════════════════════════════════════════════
   HERO — split: copy left, a live-session mock right,
   both floating on the canvas over two ambient glows.
   The nav is fixed and inset, so this reserves its own
   top padding to clear it.
   ════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Glow className="left-[-10%] top-[-10%] h-[560px] w-[560px]" />
      <Glow
        className="right-[-8%] top-[6%] h-[520px] w-[520px]"
        from="rgba(232,85,43,0.14)"
      />

      <div
        className={`${container} relative grid items-center gap-14 px-6 pb-24 pt-36 sm:pt-40 lg:grid-cols-2 lg:gap-16 lg:pb-32 lg:pt-48`}
      >
        <div className="flex flex-col gap-7">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[13px] tracking-[-0.01em] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8fbe8e]" aria-hidden="true" />
              Open source · MIT licensed
            </span>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <h1 className="text-balance text-[46px] leading-none tracking-[-0.03em] text-white/94 sm:text-[60px] lg:text-[72px]">
              Remote access without the trust exercise
            </h1>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <p className={`max-w-[46ch] text-white/60 ${bodyLead}`}>
              Duxo connects two machines directly over an encrypted
              peer-to-peer channel. No servers in the middle, no account
              required to receive a session, no cost.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link href="/download" className={btnPrimary}>
                Download Duxo
              </Link>
              <a
                href="https://github.com/waleed260/Duxo"
                target="_blank"
                rel="noopener noreferrer"
                className={btnQuiet}
              >
                <GithubIcon className="h-4 w-4" aria-hidden="true" />
                View source
              </a>
            </div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={200}>
          <SessionMock />
        </ScrollReveal>
      </div>
    </section>
  );
}

/**
 * Hero visual — the handshake the product is actually about, drawn rather
 * than screenshotted: a code is generated, the host is asked, the host
 * allows. Ada floats glass cards over photography; Duxo has no photography
 * to float over, so the glass sits on the canvas glow instead.
 */
function SessionMock() {
  return (
    <div className="relative rounded-[22px] border border-white/[0.12] bg-white/[0.03] p-4 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between pb-4">
        <span className="text-[13px] tracking-[-0.01em] text-white/50">Duxo host agent</span>
        <span className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.08em] text-[#8fbe8e]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8fbe8e]" aria-hidden="true" />
          Waiting
        </span>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-[#0d0e11] p-5">
        <span className="text-[12px] uppercase tracking-[0.08em] text-white/40">
          Connection code
        </span>
        <div className="mt-3 flex gap-1.5">
          {["4", "1", "9", "2", "7", "3", "0", "6"].map((d, i) => (
            <span
              key={`${d}-${i}`}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[18px] leading-none tracking-[-0.02em] text-white/94"
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-[#0d0e11] p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
            <Fingerprint className="h-4 w-4 text-white/70" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] tracking-[-0.01em] text-white/94">
              Allow this session?
            </span>
            <span className="text-[13px] text-white/40">Requested just now</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#8fbe8e] px-4 py-2 text-[13px] leading-none text-[#0a0b0c]">
          Allow
        </span>
      </div>

      <p className="mt-4 text-center text-[13px] tracking-[-0.01em] text-white/40">
        Video and input flow peer-to-peer once approved
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════
   STAT BAND — one wide panel, ambient glow bleeding
   through, stats split by hairlines.
   ════════════════════════════════════════════════ */
function StatBand() {
  const stats = [
    { value: "100", unit: "%", label: "Open source" },
    { value: "$0", unit: "", label: "Cost to use" },
    { value: "0", unit: "", label: "Telemetry events" },
    { value: "2", unit: "", label: "Platforms supported" },
  ];

  return (
    <section className="px-6">
      <ScrollReveal>
        <div className={`${container} relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0d0e11]`}>
          <Glow className="left-1/4 top-[-60%] h-[420px] w-[520px]" />
          <div className="relative grid grid-cols-2 gap-y-10 px-6 py-12 sm:grid-cols-4 sm:gap-y-0 sm:px-10">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`flex flex-col gap-2.5 px-2 sm:px-6 ${
                  i > 0 ? "sm:border-l sm:border-white/[0.07]" : ""
                }`}
              >
                <span className="flex items-baseline gap-1 text-[40px] leading-none tracking-[-0.02em] text-white/94 sm:text-[48px]">
                  {s.value}
                  {s.unit && <span className="text-[24px] text-white/60">{s.unit}</span>}
                </span>
                <span className="text-[12px] uppercase tracking-[0.08em] text-white/40">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ════════════════════════════════════════════════
   WHY DUXO
   ════════════════════════════════════════════════ */
function WhyDuxo() {
  return (
    <section className={band}>
      <div className={`${container} grid gap-10 lg:grid-cols-2 lg:gap-20`}>
        <ScrollReveal>
          <Eyebrow>Why Duxo exists</Eyebrow>
          <h2 className={`mt-5 ${displayH2}`}>
            Remote access shouldn’t mean trusting a company with your screen
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="flex max-w-[58ch] flex-col gap-5 lg:pt-2">
            <p className={`text-white/60 ${bodyLead}`}>
              Most remote desktop tools quietly route your session through a
              server they control, log connection metadata, and charge a
              subscription for basic features. Duxo connects two machines
              directly — the only things that ever reach our infrastructure
              are a session ID and an 8-digit code.
            </p>
            <p className={`text-white/60 ${bodyLead}`}>
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
   FEATURES — card grid. Three cards carry a faint
   colour wash in one corner, as on the reference.
   ════════════════════════════════════════════════ */
const features = [
  {
    icon: Lock,
    title: "End-to-end encrypted",
    body: "DTLS-SRTP over WebRTC secures every session. Even the relay that helps two machines find each other can’t decrypt your traffic.",
    wash: "rgba(143,190,142,0.10)",
  },
  {
    icon: Fingerprint,
    title: "Explicit consent",
    body: "Every connection needs an Allow click on the host machine. No silent takeovers, no backdoor for anyone.",
    wash: null,
  },
  {
    icon: MonitorSmartphone,
    title: "Cross-platform",
    body: "Full mouse and keyboard control on Windows and Linux (X11), shipped as one portable binary with no installer.",
    wash: "rgba(232,85,43,0.10)",
  },
  {
    icon: Shield,
    title: "Zero-budget security",
    body: "Client-side token verification, OS keychain storage, rate-limited codes, and a SHA-256 audit chain.",
    wash: null,
  },
  {
    icon: Server,
    title: "Self-healing connection",
    body: "A dropped network reconnects automatically via ICE restart — no new code, no re-approval needed.",
    wash: "rgba(143,190,142,0.10)",
  },
  {
    icon: Layers,
    title: "One binary, no installer",
    body: "Windows and Linux capture paths ship together. Nothing to install, no admin rights required.",
    wash: null,
  },
];

function Features() {
  return (
    <section id="features" className={`scroll-mt-28 ${band}`}>
      <div className={container}>
        <ScrollReveal>
          <Eyebrow>Capabilities</Eyebrow>
          <h2 className={`mt-5 max-w-[20ch] ${displayH2}`}>
            Everything a session needs, nothing that watches you
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <ScrollReveal key={f.title} delay={100 + (i % 3) * 80}>
              <div className={`relative h-full overflow-hidden p-6 sm:p-7 ${card}`}>
                {f.wash && (
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-[60px]"
                    style={{ background: f.wash }}
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex h-full flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
                    <f.icon className="h-4.5 w-4.5 text-white/70" aria-hidden="true" />
                  </span>
                  <h3 className="mt-2 text-[20px] leading-tight tracking-[-0.02em] text-white/94">
                    {f.title}
                  </h3>
                  <p className="text-[15px] leading-[1.55] tracking-[-0.01em] text-white/50">
                    {f.body}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   HOW IT WORKS — the data path, drawn on the canvas
   inside one wide panel.
   ════════════════════════════════════════════════ */
function Architecture() {
  return (
    <section id="demo" className={`scroll-mt-28 ${band}`}>
      <div className={container}>
        <ScrollReveal>
          {/* The ch cap goes on the h2, not on a wrapper: `ch` resolves
              against the element's OWN font-size, so on a 16px wrapper it
              collapses to ~192px and stacks the 60px heading one word per
              line. Every other section caps the heading directly. */}
          <Eyebrow>How it works</Eyebrow>
          <h2 className={`mt-5 max-w-[22ch] ${displayH2}`}>
            Peer-to-peer by default, relay only when forced
          </h2>
          <p className={`mt-6 max-w-[62ch] text-white/60 ${bodyLead}`}>
            Signaling carries an offer, an answer, and ICE candidates — then
            it gets out of the way. Screen frames and input never pass
            through Duxo’s infrastructure.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className={`relative mt-14 overflow-hidden ${card}`}>
            <Glow className="left-1/2 top-[-40%] h-[420px] w-[560px] -translate-x-1/2" />

            <div className="relative flex flex-col gap-12 p-6 sm:p-10 lg:p-14">
              <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between sm:gap-6">
                <Node icon={MonitorSmartphone} label="Viewer" sub="Browser" />

                {/* Nudged up by half the node's label block so the channel
                    rule lands on the icons' centre line rather than on the
                    node columns' overall centre. */}
                <div className="flex w-full flex-1 flex-col items-center gap-3 sm:-mt-12">
                  <span className="text-[12px] uppercase tracking-[0.08em] text-white/40">
                    WebRTC · end-to-end encrypted
                  </span>
                  <div className="relative h-px w-full bg-white/[0.14]">
                    <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8fbe8e]" />
                  </div>
                  <span className="text-[13px] tracking-[-0.01em] text-white/40">
                    Video · input · clipboard
                  </span>
                </div>

                <Node icon={Server} label="Host" sub="Tauri / Rust" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SubCard
                  title="Signaling"
                  body="Firebase Realtime Database exchanges the offer, answer, and ICE candidates, then holds nothing but a session ID."
                />
                <SubCard
                  title="Traversal"
                  body="STUN first, then Metered TURN with an Oracle Coturn fallback — a relay can forward the stream but never decrypt it."
                />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function Node({
  icon: Icon,
  label,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
        <Icon className="h-6 w-6 text-white/94" aria-hidden="true" />
      </span>
      <span className="text-[15px] tracking-[-0.01em] text-white/94">{label}</span>
      <span className="text-[13px] text-white/40">{sub}</span>
    </div>
  );
}

function SubCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      <span className="text-[12px] uppercase tracking-[0.08em] text-white/40">{title}</span>
      <p className="mt-2.5 text-[15px] leading-[1.55] tracking-[-0.01em] text-white/60">
        {body}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════
   STEPS
   ════════════════════════════════════════════════ */
function Steps() {
  const steps = [
    {
      step: "01",
      title: "Generate a code",
      desc: "Launch the Duxo host agent on the machine you want to reach. An 8-digit code appears.",
    },
    {
      step: "02",
      title: "Connect and approve",
      desc: "Enter the code from any browser — no install needed. The host must click Allow.",
    },
    {
      step: "03",
      title: "Full remote control",
      desc: "Real-time screen, mouse, keyboard, and clipboard, all over one encrypted connection.",
    },
  ];

  return (
    <section className={band}>
      <div className={container}>
        <ScrollReveal>
          <Eyebrow>Getting connected</Eyebrow>
          <h2 className={`mt-5 max-w-[20ch] ${displayH2}`}>Three steps, about a minute</h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {steps.map((item, i) => (
            <ScrollReveal key={item.step} delay={100 + i * 80}>
              <div className={`flex h-full flex-col gap-3 p-6 sm:p-7 ${card}`}>
                <span className="text-[13px] tracking-[-0.01em] text-[#8fbe8e]">{item.step}</span>
                <h3 className="text-[20px] leading-tight tracking-[-0.02em] text-white/94">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-[1.55] tracking-[-0.01em] text-white/50">
                  {item.desc}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   TRUST — always / never, as two cards.
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
    <section id="security" className={`scroll-mt-28 ${band}`}>
      <div className={container}>
        <ScrollReveal>
          <Eyebrow>Security and privacy</Eyebrow>
          <h2 className={`mt-5 max-w-[22ch] ${displayH2}`}>
            What Duxo does, and what it never will
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <ScrollReveal delay={150}>
            <div className={`relative h-full overflow-hidden p-6 sm:p-8 ${card}`}>
              <div
                className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full blur-[70px]"
                style={{ background: "rgba(143,190,142,0.12)" }}
                aria-hidden="true"
              />
              <div className="relative">
                <h3 className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-[#8fbe8e]">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Always
                </h3>
                <ul className="mt-6 flex flex-col gap-4">
                  {does.map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 text-[15px] leading-[1.55] tracking-[-0.01em] text-white/70"
                    >
                      <Check
                        className="mt-1 h-4 w-4 shrink-0 text-[#8fbe8e]"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={250}>
            <div className={`h-full p-6 sm:p-8 ${card}`}>
              <h3 className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-white/40">
                <X className="h-4 w-4" aria-hidden="true" />
                Never
              </h3>
              <ul className="mt-6 flex flex-col gap-4">
                {never.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[15px] leading-[1.55] tracking-[-0.01em] text-white/70"
                  >
                    <X className="mt-1 h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
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
   FAQ
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
    <section className={band}>
      <div className={container}>
        <ScrollReveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className={`mt-5 max-w-[20ch] ${displayH2}`}>Answers before you download</h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          {faqs.map((item, i) => (
            <ScrollReveal key={item.q} delay={100 + (i % 2) * 80}>
              <div className={`flex h-full flex-col gap-3 p-6 sm:p-7 ${card}`}>
                <h3 className="text-[19px] leading-snug tracking-[-0.02em] text-white/94">
                  {item.q}
                </h3>
                {/* Capped measure — the answers are the longest prose on the
                    page and the card would otherwise run them past ~90ch. */}
                <p className="max-w-[62ch] text-[15px] leading-[1.6] tracking-[-0.01em] text-white/50">
                  {item.a}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   FINAL CTA — one panel, ambient glow, centred.
   ════════════════════════════════════════════════ */
function FinalCTA() {
  return (
    <section className="px-6 pb-24 pt-12 sm:pb-28">
      <ScrollReveal>
        <div
          className={`${container} relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0d0e11] px-6 py-20 text-center sm:px-10 sm:py-24`}
        >
          <Glow className="left-1/2 top-[-30%] h-[460px] w-[620px] -translate-x-1/2" />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center">
            <Eyebrow>Get started</Eyebrow>
            <h2 className={`mt-5 ${displayH2}`}>Start connecting</h2>
            <p className={`mt-5 max-w-[48ch] text-white/60 ${bodyLead}`}>
              No sign-up required to download. Generate a code, share it,
              connect from any browser.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/download" className={btnPrimary}>
                Download for free
              </Link>
              <Link href="/login" className={btnGhost}>
                Sign in
              </Link>
            </div>
            <a
              href="https://github.com/waleed260/Duxo"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 rounded text-[14px] tracking-[-0.01em] text-white/40 transition-colors duration-150 hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
            >
              Open source (MIT) — no telemetry, no account needed
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
