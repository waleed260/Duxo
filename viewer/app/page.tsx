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
import { LightFooter } from "@/components/landing/LightFooter";

/**
 * Duxo marketing homepage.
 *
 * Visual language is intentionally isolated from the shared app chrome
 * (Navbar/Footer stay dark for the authenticated product). This page is a
 * self-contained monochrome-editorial surface — obsidian / paper-white /
 * graphite / warm-stone, with a single small chromatic accent (ember) used
 * only inside illustrations, never on text or CTAs.
 *
 * Type is set at weight 400 with tight negative tracking (-0.045em on
 * display sizes) rather than the app's medium weights — at 48px+ a light
 * face with closed-up letterfit is what makes the page read as editorial
 * instead of as product UI scaled up.
 *
 * Section rhythm alternates paper and full-bleed obsidian bands with no
 * hairline rules between them; edges are carried by the colour change and
 * by generous vertical padding, not by borders.
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
/**
 * Buttons all carry a 1px border — transparent on the filled variants — so a
 * filled and an outlined button sitting side by side resolve to the same box
 * height. Without it the outlined one is 2px taller and the pair reads as
 * misaligned.
 */
const btnBase =
  "touch-manipulation inline-flex items-center gap-1.5 rounded border px-6 py-3.5 text-xs font-medium uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const ghostBtnDark = `${btnBase} border-black text-black hover:bg-black hover:text-white focus-visible:outline-black`;

const filledBtnLight = `${btnBase} border-transparent bg-white text-black hover:bg-white/90 focus-visible:outline-white`;

const filledBtnDark = `${btnBase} border-transparent bg-black text-white hover:bg-[#2a2a28] focus-visible:outline-black`;

/** Display heading — weight 400, closed-up tracking. §see file header. */
const displayH2 =
  "text-balance font-normal leading-[1.06] tracking-[-0.04em] text-[34px] sm:text-[42px] sm:tracking-[-0.045em] lg:text-[48px]";

const bodyLead = "text-[17px] leading-[1.45] tracking-[-0.011em] sm:text-lg";

/** Vertical rhythm for a full-width band. */
const band = "px-6 py-20 sm:py-24 lg:py-32";

function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <span
      className={`block text-[11px] font-medium uppercase tracking-[0.14em] ${
        tone === "light" ? "text-white/55" : "text-[#8a857d]"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Faint plus-mark grid used as the ground inside showcase panels — a
 * drafting-paper cue that reads as "schematic" without competing with the
 * content sitting on top of it.
 *
 * Two layers: small plus glyphs at each intersection carry the schematic
 * read, and the continuous rules sit far fainter beneath them. A plain line
 * grid at a single weight reads as a data table instead, which is why the
 * rules are held to roughly a third of the glyphs' contrast. The radial mask
 * dissolves both before they reach the panel edge, so the panel keeps a
 * clean silhouette.
 */
const GRID_CELL = 88;

function PlusGrid({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const glyph = tone === "light" ? "rgba(255,255,255,0.30)" : "rgba(18,18,17,0.22)";
  const rule = tone === "light" ? "rgba(255,255,255,0.07)" : "rgba(18,18,17,0.05)";
  const half = GRID_CELL / 2;
  const plus = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID_CELL}" height="${GRID_CELL}">` +
      `<path d="M${half} ${half - 5}v10M${half - 5} ${half}h10" stroke="${glyph}" stroke-width="1"/>` +
      `</svg>`,
  );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        backgroundImage:
          `url("data:image/svg+xml,${plus}"),` +
          `linear-gradient(${rule} 1px, transparent 1px),` +
          `linear-gradient(90deg, ${rule} 1px, transparent 1px)`,
        backgroundSize: `${GRID_CELL}px ${GRID_CELL}px`,
        backgroundPosition: `${half}px ${half}px`,
        maskImage: "radial-gradient(70% 65% at 50% 50%, #000 25%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(70% 65% at 50% 50%, #000 25%, transparent 100%)",
      }}
    />
  );
}

/** Floating white micro-card — the recurring object inside showcase panels. */
function FloatCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg bg-white p-3.5 shadow-[0_10px_30px_-12px_rgba(18,18,17,0.28)] ${className}`}
    >
      {children}
    </div>
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

      <div className="relative mx-auto flex min-h-[620px] max-w-[1280px] flex-col justify-center gap-7 px-6 pt-32 pb-24 sm:min-h-[720px] sm:pt-40 sm:pb-32 md:w-[58%] md:pt-48 md:pb-40">
        <ScrollReveal>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#d8b998]">
            Open source remote access
          </span>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h1 className="text-balance text-[42px] font-normal leading-[1.05] tracking-[-0.04em] text-white sm:text-[56px] sm:tracking-[-0.045em] lg:text-[64px]">
            Remote access, without the trust exercise.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <p className={`max-w-lg text-white/70 ${bodyLead}`}>
            Duxo connects two machines directly over an encrypted
            peer-to-peer channel — no servers in the middle, no account
            required to receive a session, no cost.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="flex flex-wrap items-center gap-6 pt-3">
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
   STATS STRIP — stands in for the customer-logo grid
   Duxo doesn't have. Soft hairlines only between
   cells; no heavy frame around the band.
   ════════════════════════════════════════════════ */
function StatsGrid() {
  const stats = [
    { value: "100%", label: "Open source" },
    { value: "$0", label: "Cost to use" },
    { value: "0", label: "Telemetry events" },
    { value: "2", label: "Platforms supported" },
  ];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-14 sm:py-20">
        <ScrollReveal>
          <div className="grid grid-cols-2 gap-y-10 sm:grid-cols-4 sm:divide-x sm:divide-[#e4e2dd]">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5 px-4 text-center">
                <span className="text-[36px] font-normal leading-none tracking-[-0.04em] text-black sm:text-[42px]">
                  {s.value}
                </span>
                <span className="text-[13px] tracking-[-0.01em] text-[#8a857d]">{s.label}</span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════
   WHY DUXO — heading paired with body copy.
   ════════════════════════════════════════════════ */
function WhyDuxo() {
  return (
    <section className="bg-white">
      <div className={`mx-auto grid max-w-[1280px] gap-8 md:grid-cols-2 md:gap-20 ${band}`}>
        <ScrollReveal>
          <Eyebrow>Why Duxo exists</Eyebrow>
          <h2 className={`mt-5 ${displayH2}`}>
            Remote access shouldn’t require trusting a corporation with
            your screen.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="flex max-w-[58ch] flex-col gap-5 md:pt-2">
            <p className={`text-[#575551] ${bodyLead}`}>
              Most remote desktop tools quietly route your session through a
              server they control, log connection metadata, and charge a
              subscription for basic features. Duxo connects two machines
              directly — the only things that ever reach our infrastructure
              are a session ID and an 8-digit code.
            </p>
            <p className={`text-[#575551] ${bodyLead}`}>
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
   FEATURES — one wide showcase panel over a 3-up row
   of shorter panels. Panels are borderless tinted
   grounds; the only elevation on the page lives on
   the white micro-cards floating inside them.
   ════════════════════════════════════════════════ */
function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-white">
      <div className={`mx-auto max-w-[1280px] ${band}`}>
        <ScrollReveal>
          <Eyebrow>Capabilities</Eyebrow>
          <h2 className={`mt-5 max-w-3xl ${displayH2}`}>
            Everything a remote session needs, and nothing that watches you.
          </h2>
        </ScrollReveal>

        {/* Wide showcase — the session-handshake moment */}
        <ScrollReveal delay={120}>
          <div className="relative mt-14 overflow-hidden rounded-2xl bg-[#f2f1ef]">
            <PlusGrid />
            <div className="relative flex min-h-[340px] flex-col items-center justify-center gap-6 px-6 py-14 sm:min-h-[400px]">
              <FloatCard className="w-full max-w-sm">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8a857d]">
                  Connection code
                </span>
                <div className="mt-2 flex gap-1.5">
                  {["4", "1", "9", "2", "7", "3", "0", "6"].map((d, i) => (
                    <span
                      key={`${d}-${i}`}
                      className="flex h-10 flex-1 items-center justify-center rounded bg-[#f5f5f3] text-base tracking-[-0.02em] text-black"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </FloatCard>

              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#8a857d]">
                <span className="h-px w-8 bg-[#c9c5bd]" />
                Awaiting approval on host
                <span className="h-px w-8 bg-[#c9c5bd]" />
              </div>

              <FloatCard className="flex w-full max-w-sm items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-[#f5f5f3]">
                    <Fingerprint className="h-4 w-4 text-black" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[13px] tracking-[-0.01em] text-black">
                      Allow this session?
                    </span>
                    <span className="text-[11px] text-[#8a857d]">Requested just now</span>
                  </div>
                </div>
                <span className="rounded bg-[#e8552b] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white">
                  Allow
                </span>
              </FloatCard>
            </div>
          </div>
        </ScrollReveal>

        {/* 3-up supporting panels */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "End-to-end encrypted",
              body: "DTLS-SRTP over WebRTC secures every session. Even the relay that helps two machines find each other can’t decrypt your traffic.",
              visual: <EncryptedVisual />,
            },
            {
              icon: MonitorSmartphone,
              title: "Cross-platform",
              body: "Full mouse and keyboard control on Windows and Linux (X11), shipped as one portable binary with no installer.",
              visual: <PlatformVisual />,
            },
            {
              icon: Server,
              title: "Self-healing connection",
              body: "A dropped network reconnects automatically via ICE restart — no new code, no re-approval needed.",
              visual: <ReconnectVisual />,
            },
          ].map((f, i) => (
            <ScrollReveal key={f.title} delay={150 + i * 80}>
              <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[#f2f1ef]">
                <div className="relative flex h-44 items-center justify-center overflow-hidden px-6">
                  <PlusGrid />
                  <div className="relative w-full">{f.visual}</div>
                </div>
                <div className="flex flex-col gap-2.5 px-6 pb-7 pt-1">
                  <h3 className="text-[19px] font-normal tracking-[-0.025em] text-black">
                    {f.title}
                  </h3>
                  <p className="text-[15px] leading-[1.5] tracking-[-0.01em] text-[#575551]">
                    {f.body}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Secondary capabilities — plain text rows, no panel */}
        <ScrollReveal delay={200}>
          <div className="mt-16 grid gap-x-16 gap-y-10 border-t border-[#e4e2dd] pt-12 sm:grid-cols-3">
            {[
              {
                icon: Fingerprint,
                title: "Explicit consent",
                body: "Every connection needs an Allow click on the host machine. No silent takeovers, no backdoor for anyone.",
              },
              {
                icon: Shield,
                title: "Zero-budget security",
                body: "Client-side token verification, OS keychain storage, rate-limited codes, and a SHA-256 audit chain.",
              },
              {
                icon: Layers,
                title: "One binary, no installer",
                body: "Windows and Linux capture paths ship together. Nothing to install, no admin rights required.",
              },
            ].map((f) => (
              <div key={f.title} className="flex flex-col gap-2.5">
                <f.icon className="h-5 w-5 text-black" aria-hidden="true" />
                <h3 className="text-[17px] font-normal tracking-[-0.02em] text-black">{f.title}</h3>
                <p className="text-[15px] leading-[1.5] tracking-[-0.01em] text-[#575551]">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* Panel visuals — small, abstract, no photography. */

function EncryptedVisual() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-9 w-9 rounded bg-white" />
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-[#c9c5bd]" />
        ))}
      </span>
      <FloatCard className="!p-2.5">
        <Lock className="h-4 w-4 text-black" aria-hidden="true" />
      </FloatCard>
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-[#c9c5bd]" />
        ))}
      </span>
      <span className="h-9 w-9 rounded bg-white" />
    </div>
  );
}

function PlatformVisual() {
  return (
    <div className="flex items-center justify-center gap-3">
      {["Windows", "Linux"].map((os) => (
        <FloatCard key={os} className="flex items-center gap-2 !py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#e8552b]" />
          <span className="text-[12px] tracking-[-0.01em] text-black">{os}</span>
        </FloatCard>
      ))}
    </div>
  );
}

function ReconnectVisual() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <FloatCard className="flex w-full max-w-[200px] items-center justify-between !py-2.5">
        <span className="text-[11px] uppercase tracking-[0.1em] text-[#8a857d]">Link</span>
        <span className="text-[12px] tracking-[-0.01em] text-black">Restored</span>
      </FloatCard>
      <div className="flex w-full max-w-[200px] gap-1" aria-hidden="true">
        <span className="h-1.5 flex-1 rounded-full bg-[#c9c5bd]" />
        <span className="h-1.5 flex-1 rounded-full bg-[#c9c5bd]" />
        <span className="h-1.5 flex-1 rounded-full bg-[#e8552b]" />
        <span className="h-1.5 flex-1 rounded-full bg-black" />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   HOW IT WORKS — full-bleed obsidian band carrying a
   hairline schematic of the actual data path.
   ════════════════════════════════════════════════ */
function Architecture() {
  return (
    <section id="demo" className="scroll-mt-20 bg-black">
      <div className={`mx-auto max-w-[1280px] ${band}`}>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow tone="light">How it works</Eyebrow>
            <h2 className={`mt-5 text-white ${displayH2}`}>
              Peer-to-peer by default. Relay only when the network forces it.
            </h2>
            <p className={`mx-auto mt-5 max-w-xl text-white/60 ${bodyLead}`}>
              Signaling carries an offer, an answer, and ICE candidates —
              then it gets out of the way. Screen frames and input never
              pass through Duxo’s infrastructure.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="relative mt-16 overflow-hidden rounded-2xl bg-[#0f0f0e]">
            <PlusGrid tone="light" />
            <div className="relative flex flex-col items-center gap-10 px-6 py-14 sm:px-12 sm:py-20">
              <div className="flex w-full max-w-3xl flex-col items-center gap-8 sm:flex-row sm:justify-between sm:gap-6">
                <Node icon={MonitorSmartphone} label="Viewer" sub="Browser" />

                {/* Nudged up by half the node's label block so the channel
                    rule lands on the icons' centre line rather than on the
                    node columns' overall centre. */}
                <div className="flex w-full flex-1 flex-col items-center gap-3 sm:-mt-11">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-white/50">
                    WebRTC · end-to-end encrypted
                  </span>
                  <div className="relative h-px w-full bg-white/20">
                    <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8552b]" />
                  </div>
                  <span className="text-[11px] tracking-[-0.01em] text-white/40">
                    Video · input · clipboard
                  </span>
                </div>

                <Node icon={Server} label="Host" sub="Tauri / Rust" />
              </div>

              <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
                <DarkCard
                  title="Signaling"
                  body="Firebase Realtime Database exchanges the offer, answer, and ICE candidates, then holds nothing but a session ID."
                />
                <DarkCard
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
    <div className="flex shrink-0 flex-col items-center gap-2.5">
      <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/25 bg-white/[0.04]">
        <Icon className="h-6 w-6 text-white" aria-hidden="true" />
      </span>
      <span className="text-[13px] tracking-[-0.01em] text-white">{label}</span>
      <span className="text-[11px] text-white/45">{sub}</span>
    </div>
  );
}

function DarkCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-[#161615] p-5">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/45">
        {title}
      </span>
      <p className="mt-2 text-[14px] leading-[1.5] tracking-[-0.01em] text-white/75">{body}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════
   STEPS — three numbered columns, hairline separated.
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
      title: "Connect & approve",
      desc: "Enter the code from any browser — no install needed. The host must click Allow.",
    },
    {
      step: "03",
      title: "Full remote control",
      desc: "Real-time screen, mouse, keyboard, and clipboard, all over one encrypted connection.",
    },
  ];

  return (
    <section className="bg-white">
      <div className={`mx-auto max-w-[1280px] ${band}`}>
        <ScrollReveal>
          <Eyebrow>Getting connected</Eyebrow>
          <h2 className={`mt-5 max-w-2xl ${displayH2}`}>Three steps, about a minute.</h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-x-14 gap-y-10 sm:grid-cols-3">
          {steps.map((item, i) => (
            <ScrollReveal key={item.step} delay={120 + i * 90}>
              <div className="flex h-full flex-col gap-3 border-t border-black pt-6">
                <span className="text-[13px] tracking-[-0.01em] text-[#8a857d]">{item.step}</span>
                <h3 className="text-[19px] font-normal tracking-[-0.025em] text-black">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-[1.5] tracking-[-0.01em] text-[#575551]">
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
   TRUST — second obsidian band. "Always / never"
   guarantees, stated as commitments rather than
   feature bullets.
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
    <section id="security" className="scroll-mt-20 bg-black">
      <div className={`mx-auto max-w-[1280px] ${band}`}>
        <ScrollReveal>
          <Eyebrow tone="light">Security & privacy</Eyebrow>
          <h2 className={`mt-5 max-w-2xl text-white ${displayH2}`}>
            What Duxo does — and what it never will.
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <ScrollReveal delay={150}>
            <div className="flex h-full flex-col gap-5 border-t border-white/25 pt-7">
              <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
                Always
              </h3>
              <ul className="flex flex-col gap-4">
                {does.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-white/70"
                  >
                    <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-white" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={250}>
            <div className="flex h-full flex-col gap-5 border-t border-white/25 pt-7">
              <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/60">
                <X className="h-4 w-4" aria-hidden="true" />
                Never
              </h3>
              <ul className="flex flex-col gap-4">
                {never.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-white/70"
                  >
                    <X className="mt-1 h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
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
    <section className="bg-white">
      <div className={`mx-auto max-w-[1280px] ${band}`}>
        <ScrollReveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className={`mt-5 max-w-2xl ${displayH2}`}>Answers before you download.</h2>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="mt-14 divide-y divide-[#e4e2dd] border-t border-black">
            {faqs.map((item) => (
              <div key={item.q} className="flex flex-col gap-3 py-8 sm:flex-row sm:gap-16">
                <h3 className="text-[19px] font-normal leading-[1.25] tracking-[-0.025em] text-black sm:w-[38%]">
                  {item.q}
                </h3>
                {/* Capped at ~62ch: the 62% column runs to ~97 characters per
                    line at the 1280px container, well past a comfortable
                    measure, and the answers are the longest prose on the page. */}
                <p className="max-w-[62ch] text-[16px] leading-[1.6] tracking-[-0.01em] text-[#575551] sm:w-[62%]">
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
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-24 text-center sm:py-32">
        <ScrollReveal>
          <Eyebrow>Get started</Eyebrow>
          <h2 className={`mt-5 ${displayH2}`}>Start connecting.</h2>
          <p className={`mt-5 text-[#575551] ${bodyLead}`}>
            No sign-up required to download. Generate a code, share it,
            connect from any browser.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/download" className={filledBtnDark}>
              Download for free
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/login" className={ghostBtnDark}>
              Sign in
            </Link>
          </div>
          <p className="mt-7 text-[13px] tracking-[-0.01em] text-[#8a857d]">
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
