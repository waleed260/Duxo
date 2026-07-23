"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MonitorDown, Plug, History, Shield } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardIconBadge } from "@/components/Card";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/CodeInput";
import TOTPSetup from "@/components/TOTPSetup";
import { getFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ref, get } from "firebase/database";

/**
 * Duxo dashboard — §3.4.
 *
 * Two clear paths, visually separated:
 *   1. Connect to a device (code entry) → /session
 *   2. Let others connect to me (download + code display, or deep-link launch)
 *
 * Also: session history list link.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);

  React.useEffect(() => {
    const fb = getFirebase(); if (!fb) return; const { auth } = fb;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // §3.4 — Connect path: look up the 8-digit code in RTDB, navigate to /session
  // with the resolved sessionId. The actual WebRTC negotiation happens there.
  async function handleConnect() {
    if (code.length !== 8) {
      setCodeError("Codes are 8 digits — check and try again.");
      return;
    }
    setCodeError(null);
    setConnecting(true);
    try {
      const fb = getFirebase(); if (!fb) return; const { auth, db } = fb;
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push("/login");
        return;
      }
      // §0.6 — codes/{8-digit-code} → sessionId
      const snapshot = await get(ref(db, `codes/${code}`));
      if (!snapshot.exists()) {
        // §4.4 DoD: wrong code is rejected. Don't pretend it's "connecting".
        setCodeError("That code isn't valid. Check with the person who shared it.");
        setConnecting(false);
        return;
      }
      const sessionId = snapshot.val() as string;
      router.push(`/session?id=${encodeURIComponent(sessionId)}`);
    } catch {
      // §9.6 — plain-language error, never raw stack.
      setCodeError("Couldn't look up that code. Check your connection and try again.");
      setConnecting(false);
    }
  }

  if (!authChecked) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-text-secondary">Loading…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-weight-emphasis">
              Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
            </h1>
            <p className="text-sm text-text-secondary">
              Pick a path below to get started.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/history">
              <Button variant="ghost" leadingIcon={<History className="h-4 w-4" />}>
                Session history
              </Button>
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                const fb = getFirebase(); if (!fb) return; const { auth } = fb;
                await signOut(auth);
                router.push("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* PATH 1 — Connect to a device (§3.4) */}
          <Card>
            <CardIconBadge>
              <Plug className="h-5 w-5" />
            </CardIconBadge>
            <div>
              <h2 className="text-lg font-weight-emphasis">Connect to a device</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Enter the 8-digit code someone shared with you.
              </p>
            </div>
            <CodeInput
              value={code}
              onChange={(v) => {
                setCode(v);
                if (codeError) setCodeError(null);
              }}
              error={codeError ?? undefined}
              disabled={connecting}
            />
            <Button
              onClick={handleConnect}
              isLoading={connecting}
              disabled={code.length !== 8}
              className="mt-2"
            >
              Connect
            </Button>
          </Card>

          {/* PATH 2 — Let others connect to me (§3.4) */}
          <Card>
            <CardIconBadge>
              <MonitorDown className="h-5 w-5" />
            </CardIconBadge>
            <div>
              <h2 className="text-lg font-weight-emphasis">
                Let others connect to me
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Download and run the host agent on the machine you want to share.
                It generates a code you can give out.
              </p>
            </div>
            <Link href="/download" className="mt-2">
              <Button variant="secondary" className="w-full">
                Download host agent
              </Button>
            </Link>
          </Card>
        </div>

        {/* Security section — §2.3 TOTP 2FA */}
        <div className="mt-8">
          <h2 className="text-lg font-weight-emphasis mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
            Security
          </h2>
          <TOTPSetup />
        </div>
      </main>
    </>
  );
}
