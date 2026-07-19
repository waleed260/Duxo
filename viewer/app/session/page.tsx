"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Clipboard,
  FileText,
  Maximize2,
  PhoneOff,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { getFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue, set, push, serverTimestamp } from "firebase/database";
import { DuxoConnection, defaultIceServers } from "@/lib/webrtc";
import type { Session } from "@shared/types";

/**
 * Duxo in-session viewer — §3.4 + §1.6-B signaling sequence.
 *
 * Lifecycle:
 *   1. Read sessionId from query.
 *   2. Attach RTDB listener for host's status / answer / candidates.
 *   3. Attach viewerId + ID token (§2.5 — host verifies JWT signature).
 *   4. Create offer, write to RTDB.
 *   5. Host writes answer + candidates.
 *   6. onTrack renders remote <video>; data channel carries input.
 *
 * Toolbar (§3.4): connection quality (from ping/pong RTT, §1.4), clipboard,
 * file, fullscreen, End (danger). Wayland hosts show non-dismissible banner.
 */

function Suspended() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-60px)] max-w-4xl items-center justify-center px-spacing-6">
        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
      </main>
    </>
  );
}

export default function SessionPageWrapper() {
  // §Next 14 requirement: useSearchParams must be inside a Suspense boundary
  // so static prerender can bail out correctly.
  return (
    <Suspense fallback={<Suspended />}>
      <SessionPage />
    </Suspense>
  );
}

function SessionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("id");

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const connRef = React.useRef<DuxoConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [phase, setPhase] = React.useState<
    "connecting" | "active" | "failed" | "denied" | "ended"
  >("connecting");
  const [quality, setQuality] = React.useState<number | null>(null);
  const [hostPlatform, setHostPlatform] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // §6.2 — Wayland hosts are view-only until Phase 5.
  const isViewOnly = hostPlatform === "linux-wayland";

  // Bootstrap connection once we have a user + sessionId.
  React.useEffect(() => {
    if (!sessionId) {
      setErrorMsg("No session ID provided.");
      setPhase("failed");
      return;
    }
    const { auth, db } = getFirebase();

    let unsub: (() => void) | undefined;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      if (cancelled || unsub) return;

      // §1.6-B — viewer writes viewerId + status=REQUESTED; host sees via listener.
      // §2.5 — viewer includes the ID token so the host can verify the JWT.
      const sessionRef = ref(db, `sessions/${sessionId}`);
      const idToken = await user.getIdToken();

      try {
        await set(sessionRef, {
          hostPlatform: "windows", // host will overwrite with its real value
          status: "requested",
          viewerId: user.uid,
          viewerToken: idToken, // host verifies signature locally (§2.5)
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Likely the session doesn't exist or rules rejected us.
        // Don't surface the raw error — §9.6.
      }

      // Watch for host's answer + status transitions.
      const conn = new DuxoConnection(defaultIceServers(), {
        onStateChange: (s) => {
          if (s === "connected") setPhase("active");
          if (s === "failed") {
            setErrorMsg(
              "Connection lost — the network may be too restrictive. Try again.",
            );
            setPhase("failed");
          }
        },
        onTrack: (stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        },
        onQualityUpdate: (rtt) => setQuality(rtt),
      });
      connRef.current = conn;

      unsub = onValue(sessionRef, async (snap) => {
        const data = snap.val() as Session | null;
        if (!data) {
          setPhase("ended");
          return;
        }
        if (data.hostPlatform) setHostPlatform(data.hostPlatform);

        // §2.4 — host's explicit Allow/Deny gate.
        if (data.status === "denied") {
          setPhase("denied");
          return;
        }
        if (data.status === "ended" || data.status === "expired") {
          setPhase("ended");
          return;
        }

        // §1.6-B — host allowed. Viewer creates the offer.
        if (data.status === "allowed" && !conn.hasPeer()) {
          try {
            const offer = await conn.createOffer();
            await set(ref(db, `sessions/${sessionId}/offer`), JSON.stringify(offer));
          } catch {
            setErrorMsg("Couldn't start the connection. Try again.");
            setPhase("failed");
          }
        }

        // §1.6-B — host wrote the answer.
        if (data.answer && conn.needsAnswer()) {
          try {
            await conn.setRemoteAnswer(JSON.parse(data.answer));
          } catch {
            // forward-compat — ignore if we've already applied it
          }
        }

        // §0.6 — batched host ICE candidates.
        if (data.hostCandidates && Object.keys(data.hostCandidates).length) {
          const candidates = Object.values(data.hostCandidates).map(
            (s) => JSON.parse(s) as RTCIceCandidateInit,
          );
          conn.addIceCandidates(candidates);
        }
      });
    });

    return () => {
      cancelled = true;
      unsubAuth();
      unsub?.();
      connRef.current?.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [sessionId, router]);

  async function handleEnd() {
    const { db } = getFirebase();
    if (sessionId) {
      try {
        await set(ref(db, `sessions/${sessionId}/status`), "ended");
      } catch {
        // best-effort
      }
    }
    connRef.current?.close();
    router.push("/dashboard");
  }

  if (!sessionId) return <Suspended />;

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-spacing-4 px-spacing-6 py-spacing-6">
        {/* Wayland view-only banner — §3.4 persistent, non-dismissible */}
        {isViewOnly && phase === "active" && (
          <div
            role="status"
            className="flex items-center gap-spacing-3 rounded-sm border border-border-strong bg-surface-overlay px-spacing-4 py-spacing-3 text-sm text-text-secondary"
          >
            <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
            View-only session — this Linux desktop doesn&apos;t support remote
            input yet.
          </div>
        )}

        {/* Failed / denied / ended states */}
        {phase !== "active" && phase !== "connecting" && (
          <div className="rounded-md border border-border-default bg-surface-raised p-spacing-7 text-center">
            <h2 className="text-xl font-weight-emphasis">
              {phase === "denied" && "Connection denied"}
              {phase === "ended" && "Session ended"}
              {phase === "failed" && "Connection failed"}
            </h2>
            <p className="mt-spacing-2 text-sm text-text-secondary">
              {phase === "denied" &&
                "The host denied this connection request. Double-check with them and try a new code."}
              {phase === "ended" &&
                "The session has ended. You can close this page."}
              {phase === "failed" &&
                (errorMsg ?? "Something went wrong. Please try again.")}
            </p>
            <div className="mt-spacing-5">
              <Button onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Remote screen */}
        {phase !== "denied" && phase !== "ended" && (
          <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border-default bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Remote desktop screen"
              className="h-full w-full"
            />
            {phase === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center gap-spacing-3 bg-surface-base/80 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Connecting…
              </div>
            )}

            {/* §3.4 toolbar — slim, collapsible, never blocks primary actions */}
            {/* §9.3b #11 — collapses secondary actions into overflow on narrow viewports */}
            {phase === "active" && (
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-spacing-3 bg-gradient-to-b from-black/70 to-transparent px-spacing-4 py-spacing-3">
                {/* §1.4 — ping/pong RTT doubles as quality indicator */}
                <div className="flex items-center gap-spacing-2 text-sm text-text-primary">
                  <span
                    className={`h-2 w-2 rounded-pill ${
                      quality === null
                        ? "bg-text-secondary"
                        : quality < 100
                          ? "bg-success"
                          : quality < 250
                            ? "bg-accent"
                            : "bg-danger"
                    }`}
                    aria-hidden="true"
                  />
                  <span aria-live="polite">
                    {quality === null ? "—" : `${quality}ms`}
                  </span>
                </div>
                <div className="flex items-center gap-spacing-2">
                  {/* §9.3b #11 — secondary actions visible on wide viewports */}
                  <div className="hidden sm:flex items-center gap-spacing-2">
                    <ToolbarButton
                      label="Clipboard sync"
                      disabled={isViewOnly}
                      onClick={() => {
                        /* §4 Phase 4 — clipboard sync handler */
                      }}
                    >
                      <Clipboard className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      label="File transfer"
                      disabled={isViewOnly}
                      onClick={() => {
                        /* §4 Phase 4 — chunked file transfer handler */
                      }}
                    >
                      <FileText className="h-4 w-4" />
                    </ToolbarButton>
                  </div>
                  {/* §9.3b #11 — overflow menu on narrow viewports */}
                  <div className="sm:hidden">
                    <ToolbarOverflowMenu
                      isViewOnly={isViewOnly}
                      onFullscreen={() => {
                        if (videoRef.current?.requestFullscreen) {
                          void videoRef.current.requestFullscreen();
                        }
                      }}
                    />
                  </div>
                  {/* §9.3b #11 — fullscreen visible on all viewports */}
                  <div className="hidden sm:block">
                    <ToolbarButton
                      label="Fullscreen"
                      onClick={() => {
                        if (videoRef.current?.requestFullscreen) {
                          void videoRef.current.requestFullscreen();
                        }
                      }}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </ToolbarButton>
                  </div>
                  <Button
                    variant="danger"
                    size="md"
                    leadingIcon={<PhoneOff className="h-4 w-4" />}
                    onClick={handleEnd}
                    aria-label="End session"
                  >
                    End
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function ToolbarButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-sm bg-surface-overlay/80 text-text-primary transition-colors duration-instant hover:bg-surface-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * §9.3b #11 — Overflow menu for narrow viewports.
 * Collapses clipboard, file transfer, and fullscreen into a single dropdown.
 */
function ToolbarOverflowMenu({
  isViewOnly,
  onFullscreen,
}: {
  isViewOnly: boolean;
  onFullscreen: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // §9.3b — keyboard navigation: Escape closes, ArrowDown/ArrowUp navigate items.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const menu = menuRef.current?.querySelector('[role="menu"]');
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
      if (items.length === 0) return;
      const current = document.activeElement;
      const idx = items.indexOf(current as HTMLElement);
      const next = e.key === "ArrowDown"
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      next.focus();
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="More options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-sm bg-surface-overlay/80 text-text-primary transition-colors duration-instant hover:bg-surface-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-spacing-2 z-20 min-w-[180px] max-h-[240px] overflow-y-auto rounded-md border border-border-default bg-surface-raised py-spacing-1 shadow-none"
          role="menu"
          onKeyDown={handleKeyDown}
        >
          <OverflowMenuItem
            icon={<Clipboard className="h-4 w-4" />}
            label="Clipboard sync"
            disabled={isViewOnly}
            onClick={() => setOpen(false)}
          />
          <OverflowMenuItem
            icon={<FileText className="h-4 w-4" />}
            label="File transfer"
            disabled={isViewOnly}
            onClick={() => setOpen(false)}
          />
          <OverflowMenuItem
            icon={<Maximize2 className="h-4 w-4" />}
            label="Fullscreen"
            onClick={() => {
              onFullscreen();
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function OverflowMenuItem({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-spacing-3 px-spacing-3 py-spacing-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors duration-instant disabled:opacity-40 disabled:pointer-events-none"
      role="menuitem"
    >
      {icon}
      {label}
    </button>
  );
}
