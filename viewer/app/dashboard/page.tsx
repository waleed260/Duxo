"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { MonitorDown, Plug, History, Shield } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardIconBadge } from "@/components/Card";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/CodeInput";
import TOTPSetup from "@/components/TOTPSetup";
// Still synced here even though the code lookup no longer touches RTDB: the
// session page it hands off to needs a live Firebase credential to claim the
// session, and doing it now means the handoff is not waiting on a round trip.
import { syncFirebaseAuth } from "@/lib/auth-bridge";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    syncFirebaseAuth()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true));
  }, [user, isLoaded, router]);

  async function handleConnect() {
    if (code.length !== 8) {
      setCodeError("Codes are 8 digits — check and try again.");
      return;
    }
    setCodeError(null);
    setConnecting(true);
    try {
      // §0.7 — resolved server-side. `codes/` is not client-readable: a
      // direct lookup here would mean any signed-in account could enumerate
      // live codes, and the rate limit that is supposed to stop that has to
      // live somewhere it cannot be skipped by talking to RTDB directly.
      const response = await fetch("/api/resolve-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { sessionId?: string; error?: string }
        | null;

      if (!response.ok || !payload?.sessionId) {
        setCodeError(
          payload?.error ??
            "That code isn't valid. Check with the person who shared it.",
        );
        setConnecting(false);
        return;
      }

      router.push(`/session?id=${encodeURIComponent(payload.sessionId)}`);
    } catch {
      setCodeError("Couldn't look up that code. Check your connection and try again.");
      setConnecting(false);
    }
  }

  if (!isLoaded || !authReady) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-text-secondary">Loading…</p>
        </main>
      </>
    );
  }

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.emailAddresses?.[0]?.emailAddress;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-emphasis">
              Welcome back{displayName ? `, ${displayName}` : ""}
            </h1>
            <p className="text-sm text-text-secondary">
              Pick a path below to get started.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" leadingIcon={<History className="h-4 w-4" />}>
              <Link href="/history">Session history</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardIconBadge>
              <Plug className="h-5 w-5" />
            </CardIconBadge>
            <div>
              <h2 className="text-lg font-emphasis">Connect to a device</h2>
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

          <Card>
            <CardIconBadge>
              <MonitorDown className="h-5 w-5" />
            </CardIconBadge>
            <div>
              <h2 className="text-lg font-emphasis">
                Let others connect to me
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Download and run the host agent on the machine you want to share.
                It generates a code you can give out.
              </p>
            </div>
            <Button asChild variant="secondary" className="mt-2 w-full">
              <Link href="/download">Download host agent</Link>
            </Button>
          </Card>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-emphasis mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
            Security
          </h2>
          <TOTPSetup />
        </div>
      </main>
    </>
  );
}
