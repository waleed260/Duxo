import Link from "next/link";
import { Download, Shield, Terminal, MonitorSmartphone } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";

/**
 * Duxo landing page — §3.4 + §9.3 wireframe.
 *
 * One clear headline (what it does), one clear CTA, visible "View source on
 * GitHub" link near the top (trust signal placement matters as much as the
 * pitch, §3.1). SmartScreen copy lives on the download page, not buried in FAQ.
 */
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* HERO — §9.3 wireframe */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-spacing-7 px-spacing-6 py-spacing-8 text-center">
          <div className="flex flex-col gap-spacing-4">
            <h1 className="text-3xl font-weight-emphasis text-text-primary sm:text-4xl sm:leading-tight">
              Remote access,{" "}
              <span className="text-accent">built in the open.</span>
            </h1>
            <p className="mx-auto max-w-2xl text-md text-text-secondary">
              Connect to any Windows or Linux machine, end-to-end encrypted over
              WebRTC. Open source, zero telemetry, zero cost.
            </p>
          </div>

          <Link href="/download">
            <Button
              size="lg"
              leadingIcon={<Download className="h-5 w-5" />}
            >
              Download for free
            </Button>
          </Link>

          {/* Live screen preview mock — §9.3 wireframe "live screen preview" */}
          <div className="mt-spacing-6 w-full max-w-3xl rounded-md border border-border-default bg-surface-raised p-spacing-2">
            <div className="flex items-center gap-spacing-2 px-spacing-2 py-spacing-1">
              <span className="h-2.5 w-2.5 rounded-pill bg-accent" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-pill bg-text-secondary" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-pill bg-text-secondary" aria-hidden="true" />
              <span className="ml-spacing-2 text-xs text-text-secondary">
                Live screen preview
              </span>
            </div>
            <div className="aspect-video w-full rounded-sm bg-surface-overlay" />
          </div>
        </section>

        {/* FEATURES — §3.4 */}
        <section
          id="features"
          className="mx-auto max-w-6xl px-spacing-6 py-spacing-8"
        >
          <h2 className="mb-spacing-6 text-center text-xl font-weight-emphasis">
            Why Duxo
          </h2>
          <div className="grid gap-spacing-4 sm:grid-cols-3">
            <Feature
              icon={<Shield className="h-5 w-5" />}
              title="End-to-end encrypted"
              body="DTLS-SRTP over WebRTC. Even TURN relays can't decrypt your traffic."
            />
            <Feature
              icon={<Terminal className="h-5 w-5" />}
              title="Built for both protocols"
              body="Full control on Windows and Linux X11. Wayland ships view-only, honestly scoped."
            />
            <Feature
              icon={<MonitorSmartphone className="h-5 w-5" />}
              title="Host-side permission gate"
              body="Every connection requires an explicit Allow click from the host. No silent takeovers."
            />
          </div>
        </section>

        {/* SECURITY — §3.1 trust reinforcement */}
        <section
          id="security"
          className="mx-auto max-w-3xl px-spacing-6 py-spacing-8 text-center"
        >
          <h2 className="mb-spacing-3 text-xl font-weight-emphasis">
            Trust is the product
          </h2>
          <p className="text-md text-text-secondary">
            You're downloading an unsigned executable and giving it control of
            your machine. Every screen reinforces legitimacy: public source
            code, CI-verifiable builds, plain-language explanations of why
            warnings appear, and a security model that puts the host user in
            control of every connection.
          </p>
          <div className="mt-spacing-5">
            <Link href="/download">
              <Button variant="secondary">Read the security model</Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-spacing-3 rounded-md border border-border-default bg-surface-raised p-spacing-5">
      <div className="flex h-spacing-6 w-spacing-6 items-center justify-center rounded-sm bg-surface-overlay text-accent">
        {icon}
      </div>
      <h3 className="text-md font-weight-emphasis">{title}</h3>
      {/* §9.3b #4 — body text uses secondary for 7.4:1 contrast (passes AA) */}
      <p className="text-sm text-text-secondary">{body}</p>
    </div>
  );
}
