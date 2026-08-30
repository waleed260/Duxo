"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useUser } from "@clerk/nextjs";
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
import { syncFirebaseAuth, getFirebaseAuth } from "@/lib/auth-bridge";
import { getFirebaseClient } from "@/lib/firebase-client";
import { ref, onValue, set, update, get, serverTimestamp } from "firebase/database";
import { DuxoConnection, defaultIceServers } from "@/lib/webrtc";
import { useRemoteInput } from "@/lib/remote-input";
import type { Session } from "@shared/types";
import { VIEWER_PROTOCOL_VERSION, VIEWER_CAPABILITIES } from "@shared/types";
import { toast } from "sonner";

// §1.4 — 10MB cap, enforced BEFORE the transfer starts, not after chunk 500.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const Suspended = React.memo(function Suspended() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-60px)] max-w-4xl items-center justify-center px-6">
        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
      </main>
    </>
  );
});

export default function SessionPageWrapper() {
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
  const { user, isLoaded } = useUser();

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const connRef = React.useRef<DuxoConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [phase, setPhase] = React.useState<
    "connecting" | "active" | "failed" | "denied" | "ended"
  >("connecting");
  const [quality, setQuality] = React.useState<number | null>(null);
  const [hostPlatform, setHostPlatform] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isViewOnly = hostPlatform === "linux-wayland";

  // §1.2 — capture local mouse/keyboard on the overlay and send them down the
  // data channel. Gated on ACTIVE so no input can be produced before the host
  // has allowed the session, and off entirely for view-only hosts (§0.2).
  const { hasFocus } = useRemoteInput({
    videoRef,
    connRef,
    enabled: phase === "active" && !isViewOnly,
  });

  React.useEffect(() => {
    if (!sessionId) {
      setErrorMsg("No session ID provided.");
      setPhase("failed");
      return;
    }
    if (!isLoaded) return;
    if (!user) {
      router.push("/login");
      return;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;

    async function init() {
      try {
        await syncFirebaseAuth();
      } catch {
        setErrorMsg("Couldn't sign in to the signaling service. Try again.");
        setPhase("failed");
        return;
      }

      if (cancelled) return;

      const client = getFirebaseClient();
      if (!client) {
        setErrorMsg("Firebase is not configured for this deployment.");
        setPhase("failed");
        return;
      }
      const { db } = client;
      const auth = getFirebaseAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) {
        router.push("/login");
        return;
      }

      const sessionRef = ref(db, `sessions/${sessionId}`);
      const idToken = await fbUser.getIdToken();

      // §1.6-B — "write viewerId + ID token to session". This is an update,
      // never a set: the host owns hostId/hostPlatform/createdAt and a set()
      // would wipe them, taking the RTDB `.validate` on createdAt down with
      // it and leaving the host unable to recognise its own session.
      try {
        await update(sessionRef, {
          viewerId: fbUser.uid,
          viewerToken: idToken,
          status: "requested",
          // §6.1 — declare the wire protocol and capabilities alongside the
          // claim. The host reads these in the same poll that verifies the
          // token, so an incompatible MAJOR is refused before the Allow/Deny
          // dialog ever appears rather than after the host has been asked to
          // approve a viewer it cannot actually talk to.
          protocolVersion: VIEWER_PROTOCOL_VERSION,
          capabilities: VIEWER_CAPABILITIES,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // §10.2 — the claim clause only admits a session that still exists,
        // is still WAITING, and is still unclaimed. Anything else is a code
        // that has already been used, expired, or been revoked.
        setErrorMsg(
          "That session is no longer available — the code may have expired or already been used. Ask for a new one.",
        );
        setPhase("failed");
        return;
      }

      if (cancelled) return;

      // §0.6 — ICE candidates are batched into indexed children. Keep our own
      // write cursor; the RTDB rule only admits indices 0–99.
      let viewerCandidateIndex = 0;
      const appliedHostCandidates = new Set<string>();

      async function publishViewerCandidate(candidate: RTCIceCandidateInit) {
        if (viewerCandidateIndex > 99) return;
        const index = viewerCandidateIndex++;
        try {
          await set(
            ref(db, `sessions/${sessionId}/viewerCandidates/${index}`),
            JSON.stringify(candidate),
          );
        } catch {
          // A dropped candidate degrades connectivity but never breaks the
          // session — the remaining candidates still have to be tried.
        }
      }

      async function publishOffer(offer: RTCSessionDescriptionInit) {
        await set(ref(db, `sessions/${sessionId}/offer`), JSON.stringify(offer));
      }

      const conn = new DuxoConnection(defaultIceServers(), {
        onStateChange: (s) => {
          if (s === "connected") {
            setPhase("active");
            // §1.1 — ACTIVE is the host's call to make from its own read, but
            // the viewer records that its side is up so history is accurate.
            void update(sessionRef, { updatedAt: serverTimestamp() }).catch(
              () => {},
            );
          }
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
        onIceCandidate: (c) => {
          void publishViewerCandidate(c);
        },
        // §1.3 #4 — an ICE restart is only real once the new offer reaches the
        // host through RTDB, under the same session id and the same code.
        onIceRestartOffer: (offer) => {
          void publishOffer(offer).catch(() => {});
        },
      });
      connRef.current = conn;

      unsub = onValue(sessionRef, async (snap) => {
        const data = snap.val() as Session | null;
        if (!data) {
          setPhase("ended");
          return;
        }
        if (data.hostPlatform) setHostPlatform(data.hostPlatform);

        if (data.status === "denied") {
          setPhase("denied");
          return;
        }
        if (data.status === "ended" || data.status === "expired") {
          setPhase("ended");
          return;
        }

        if (data.status === "allowed" && !conn.hasPeer()) {
          try {
            const offer = await conn.createOffer();
            await publishOffer(offer);
          } catch {
            setErrorMsg("Couldn't start the connection. Try again.");
            setPhase("failed");
          }
        }

        if (data.answer && conn.needsAnswer()) {
          try {
            await conn.setRemoteAnswer(JSON.parse(data.answer));
          } catch {
            // forward-compat
          }
        }

        if (data.hostCandidates) {
          // Re-adding a candidate on every snapshot is harmless but wasteful,
          // and it grows quadratically over a long session.
          const fresh: RTCIceCandidateInit[] = [];
          for (const [index, raw] of Object.entries(data.hostCandidates)) {
            if (appliedHostCandidates.has(index)) continue;
            appliedHostCandidates.add(index);
            try {
              fresh.push(JSON.parse(raw) as RTCIceCandidateInit);
            } catch {
              // forward-compat (§6.1)
            }
          }
          if (fresh.length) conn.addIceCandidates(fresh);
        }
      });
    }

    void init();

    return () => {
      cancelled = true;
      unsub?.();
      connRef.current?.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [sessionId, user, isLoaded, router]);

  async function handleClipboardSync() {
    if (!connRef.current) return;
    try {
      const text = await navigator.clipboard.readText();
      connRef.current.send({ type: "clipboard_text", data: text });
      toast("Clipboard sent to host", {
        duration: 2000,
      });
    } catch {
      toast.error("Could not read clipboard. Grant permission or type manually.");
    }
  }

  async function handleFileTransfer() {
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !connRef.current) return;

    // §1.4 — "enforce this in the UI before the transfer starts, not after
    // chunk 500 fails."
    if (file.size > MAX_FILE_BYTES) {
      toast.error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`,
      );
      e.target.value = "";
      return;
    }

    const fileId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const CHUNK_SIZE = 16 * 1024;

    const reader = new FileReader();
    let offset = 0;
    let index = 0;
    const total = Math.ceil(file.size / CHUNK_SIZE);

    reader.onload = () => {
      const chunk = reader.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(chunk).reduce((s, b) => s + String.fromCharCode(b), ""),
      );

      connRef.current?.send({
        type: "file_chunk",
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        index,
        total,
        data: base64,
      });

      index += 1;
      offset += CHUNK_SIZE;

      if (offset < file.size) {
        readChunk();
      } else {
        toast.success(`File sent: ${file.name}`);
        e.target.value = "";
      }
    };

    const readChunk = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    readChunk();
  }

  async function handleEnd() {
    const client = getFirebaseClient();
    if (!client) return;
    const { db } = client;
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
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
        {isViewOnly && phase === "active" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-sm border border-border-strong bg-surface-overlay px-4 py-3 text-sm text-text-secondary"
          >
            <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
            View-only session — this Linux desktop doesn&apos;t support remote
            input yet.
          </div>
        )}

        {phase !== "active" && phase !== "connecting" && (
          <div className="rounded-md border border-border-default bg-surface-raised p-7 text-center">
            <h2 className="text-xl font-emphasis">
              {phase === "denied" && "Connection denied"}
              {phase === "ended" && "Session ended"}
              {phase === "failed" && "Connection failed"}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {phase === "denied" &&
                "The host denied this connection request. Double-check with them and try a new code."}
              {phase === "ended" &&
                "The session has ended. You can close this page."}
              {phase === "failed" &&
                (errorMsg ?? "Something went wrong. Please try again.")}
            </p>
            <div className="mt-5">
              <Button onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          </div>
        )}

        {phase !== "denied" && phase !== "ended" && (
          <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border-default bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Remote desktop screen"
              // §1.4 — object-contain keeps the remote aspect ratio intact so
              // the normalized coordinate mapping in remote-input.ts stays
              // true; object-fill would stretch the image and skew the cursor.
              // tabIndex makes the surface focusable so it can receive keys.
              tabIndex={phase === "active" && !isViewOnly ? 0 : -1}
              className="h-full w-full object-contain outline-none"
            />
            {phase === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-surface-base/80 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Connecting…
              </div>
            )}

            {phase === "active" && !isViewOnly && !hasFocus && (
              <div
                role="status"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4"
              >
                <span className="rounded-pill bg-surface-overlay/90 px-4 py-2 text-sm text-text-secondary">
                  Click the screen to send keyboard and mouse input
                </span>
              </div>
            )}

            {phase === "active" && (
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-text-primary">
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
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2">
                    <ToolbarButton
                      label="Clipboard sync"
                      disabled={isViewOnly}
                      onClick={handleClipboardSync}
                    >
                      <Clipboard className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      label="File transfer"
                      disabled={isViewOnly}
                      onClick={handleFileTransfer}
                    >
                      <FileText className="h-4 w-4" />
                    </ToolbarButton>
                  </div>
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

const ToolbarButton = React.memo(function ToolbarButton({
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
});

const ToolbarOverflowMenu = React.memo(function ToolbarOverflowMenu({
  isViewOnly,
  onFullscreen,
}: {
  isViewOnly: boolean;
  onFullscreen: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

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
          className="absolute right-0 top-full mt-2 z-20 min-w-[180px] max-h-[240px] overflow-y-auto rounded-md border border-border-default bg-surface-raised py-1 shadow-none"
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
});

const OverflowMenuItem = React.memo(function OverflowMenuItem({
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
      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors duration-instant disabled:opacity-40 disabled:pointer-events-none"
      role="menuitem"
    >
      {icon}
      {label}
    </button>
  );
});
