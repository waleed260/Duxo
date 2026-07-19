"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { getFirebase } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getFirestore,
} from "firebase/firestore";
import type { SessionHistoryRecord } from "@shared/types";

/**
 * Duxo session history — §3.4 + §6.3.
 *
 * Simple list: who/when/duration/platform. NEVER screen recordings — recording
 * someone's screen without extremely explicit consent is out of scope (§3.4).
 */
export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [records, setRecords] = React.useState<
    (SessionHistoryRecord & { id: string })[]
  >([]);

  React.useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecked(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  React.useEffect(() => {
    if (!user) return;
    const firestore = getFirestore();
    // §6.3 — sessionHistory readable by host OR viewer (firestore.rules §10.1).
    const q = query(
      collection(firestore, "sessionHistory"),
      where("hostUid", "==", user.uid),
      orderBy("startedAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: (SessionHistoryRecord & { id: string })[] = [];
      snap.forEach((doc) => {
        next.push({ id: doc.id, ...(doc.data() as SessionHistoryRecord) });
      });
      setRecords(next);
    });
    return () => unsub();
  }, [user]);

  if (!checked) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-4xl px-spacing-6 py-spacing-8">
          <p className="text-sm text-text-secondary">Loading…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-spacing-6 py-spacing-8">
        <h1 className="text-2xl font-weight-emphasis">Session history</h1>
        <p className="mt-spacing-2 text-sm text-text-secondary">
          Sessions you hosted. Duxo never records screen content — only
          metadata (who, when, how long).
        </p>

        {records.length === 0 ? (
          <div className="mt-spacing-6 rounded-md border border-border-default bg-surface-raised p-spacing-7 text-center">
            <p className="text-md text-text-secondary">No sessions yet.</p>
            <Link href="/dashboard" className="mt-spacing-4 inline-block">
              <Button>Start your first session</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-spacing-5 flex flex-col gap-spacing-3">
            {records.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border-default bg-surface-raised p-spacing-4"
              >
                <div>
                  <p className="text-sm font-weight-emphasis">
                    {platformLabel(r.hostPlatform)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(r.startedAt).toLocaleString()} ·{" "}
                    {Math.round(r.durationSeconds / 60)} min
                  </p>
                </div>
                <span
                  className="rounded-pill border border-border-default px-spacing-3 py-spacing-1 text-xs text-text-secondary"
                  aria-label={`Ended because ${r.endReason}`}
                >
                  {r.endReason.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function platformLabel(p: string): string {
  switch (p) {
    case "windows":
      return "Windows host";
    case "linux-x11":
      return "Linux (X11) host";
    case "linux-wayland":
      return "Linux (Wayland) host";
    default:
      return "Remote host";
  }
}
