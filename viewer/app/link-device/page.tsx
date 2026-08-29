"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Loader2, MonitorSmartphone } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardIconBadge } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

/**
 * §3.3 — the screen that links a host agent to this account.
 *
 * The host agent has no way to sign in on its own (see auth.rs), so it shows a
 * six-character code and waits here. This page is the moment of trust: the
 * user is granting a machine the ability to act as them, so the confirmation
 * names the device rather than just saying "done" — the same reason §2.4's
 * Allow/Deny dialog shows a verified email instead of "someone".
 */

const CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-Z2-9]*$/;

interface LinkedDevice {
  deviceName: string;
  platform: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  "linux-x11": "Linux (X11)",
  "linux-wayland": "Linux (Wayland)",
};

export default function LinkDevicePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [linked, setLinked] = React.useState<LinkedDevice | null>(null);

  React.useEffect(() => {
    if (isLoaded && !user) router.replace("/login");
  }, [isLoaded, user, router]);

  function onCodeChange(raw: string) {
    // The host's alphabet excludes O/0 and I/1/L, so uppercasing and filtering
    // here means a user who types a lowercase "o" gets no match rather than a
    // silently different code.
    const next = raw.toUpperCase().slice(0, CODE_LENGTH);
    if (!CODE_PATTERN.test(next)) return;
    setCode(next);
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setError(`Device codes are ${CODE_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/link-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Couldn't link that device. Try again.");
        setSubmitting(false);
        return;
      }

      setLinked({
        deviceName: data.deviceName ?? "Unknown device",
        platform: data.platform ?? "unknown",
      });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <>
        <Navbar />
        <main className="mx-auto flex min-h-[calc(100vh-60px)] max-w-2xl items-center justify-center px-6">
          <Loader2
            className="h-5 w-5 animate-spin text-text-secondary"
            aria-hidden="true"
          />
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-emphasis">Link a device</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Open Duxo on the computer you want to share, choose{" "}
          <span className="text-text-primary">Link this device</span> from the
          tray menu, and enter the code it shows.
        </p>

        <div className="mt-6">
          <Card>
            <CardIconBadge>
              {linked ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <MonitorSmartphone className="h-5 w-5" />
              )}
            </CardIconBadge>

            {linked ? (
              <div>
                <h2 className="text-lg font-emphasis">Device linked</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  <span className="text-text-primary">{linked.deviceName}</span>{" "}
                  ({PLATFORM_LABELS[linked.platform] ?? linked.platform}) can now
                  host sessions on your account. It will still ask you to approve
                  every incoming connection.
                </p>
                <div className="mt-5 flex gap-3">
                  <Button onClick={() => router.push("/dashboard")}>
                    Back to dashboard
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLinked(null);
                      setCode("");
                    }}
                  >
                    Link another
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  label="Device code"
                  value={code}
                  onChange={(e) => onCodeChange(e.target.value)}
                  error={error ?? undefined}
                  hint="Six characters, shown on the computer you're linking."
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={submitting}
                  className="font-mono tracking-[0.3em]"
                />
                <Button
                  type="submit"
                  isLoading={submitting}
                  disabled={code.length !== CODE_LENGTH}
                >
                  Link device
                </Button>
              </form>
            )}
          </Card>
        </div>

        <p className="mt-6 text-sm text-text-secondary">
          Linking lets that computer create sessions under your account. It does
          not grant anyone access on its own — every connection still needs you
          to click Allow on the device itself.
        </p>
      </main>
    </>
  );
}
