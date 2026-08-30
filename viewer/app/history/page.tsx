"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { syncFirebaseAuth, getFirebaseAuth } from "@/lib/auth-bridge";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getFirestore,
} from "firebase/firestore";
import type { SessionHistoryRecord } from "@shared/types";

const PAGE_SIZE = 25;

export default function HistoryPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [checked, setChecked] = React.useState(false);
  const [records, setRecords] = React.useState<
    (SessionHistoryRecord & { id: string })[]
  >([]);
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    syncFirebaseAuth()
      .then(() => setChecked(true))
      .catch(() => setChecked(true));
  }, [user, isLoaded, router]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const firestore = getFirestore();
    const q = query(
      collection(firestore, "sessionHistory"),
      where("hostUid", "==", uid),
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

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const paged = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!isLoaded || !checked) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-4xl px-6 py-8">
          <p className="text-sm text-text-secondary">Loading…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-emphasis">Session history</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sessions you hosted. Duxo never records screen content — only
          metadata (who, when, how long).
        </p>

        {records.length === 0 ? (
          <div className="mt-6 rounded-md border border-border-default bg-surface-raised p-7 text-center">
            <p className="text-md text-text-secondary">No sessions yet.</p>
            <Link href="/dashboard" className="mt-4 inline-block">
              <Button>Start your first session</Button>
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-5 flex flex-col gap-3">
              {paged.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border-default bg-surface-raised p-4"
                >
                  <div>
                    <p className="text-sm font-emphasis">
                      {platformLabel(r.hostPlatform)}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(r.startedAt).toLocaleString()} ·{" "}
                      {Math.round(r.durationSeconds / 60)} min
                    </p>
                  </div>
                  <span
                    className="rounded-pill border border-border-default px-3 py-1 text-xs text-text-secondary"
                    aria-label={`Ended because ${r.endReason}`}
                  >
                    {r.endReason.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-pill border border-border-default px-4 py-2 text-sm text-text-secondary disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-text-secondary">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-pill border border-border-default px-4 py-2 text-sm text-text-secondary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
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
