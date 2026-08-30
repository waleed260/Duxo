"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Shield,
  Smartphone,
  Laptop,
  LogOut,
  ArrowLeft,
  Trash2,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import TOTPSetup from "@/components/TOTPSetup";
import { WebAuthnSetup } from "@/components/WebAuthnSetup";
import { syncFirebaseAuth, getFirebaseAuth } from "@/lib/auth-bridge";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import type { DeviceRecord } from "@shared/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const [displayName, setDisplayName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [devices, setDevices] = React.useState<(DeviceRecord & { id: string })[]>([]);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    syncFirebaseAuth().catch(() => {});
  }, [user, isLoaded, router]);

  React.useEffect(() => {
    if (!user) return;
    setDisplayName(
      user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.emailAddresses?.[0]?.emailAddress ?? "",
    );
  }, [user]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const client = getFirebaseClient();
    if (!client) return;
    const { firestore } = client;
    const q = query(
      collection(firestore, "devices"),
      where("ownerUid", "==", uid),
    );
    getDocs(q)
      .then((snap) => {
        const next: (DeviceRecord & { id: string })[] = [];
        snap.forEach((d) => next.push({ id: d.id, ...(d.data() as DeviceRecord) }));
        setDevices(next);
      })
      .catch(() => {});
  }, [user]);

  async function handleSaveProfile() {
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await user?.update({ firstName: displayName });
      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;
      const userRef = doc(firestore, "users", fbUser.uid);
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        await updateDoc(userRef, { displayName });
      } else {
        await setDoc(userRef, {
          email: fbUser.email,
          displayName,
          emailVerified: fbUser.emailVerified,
          createdAt: Date.now(),
          totpEnabled: false,
          totpSecretEncrypted: null,
        });
      }
      setSaveMessage("Profile updated.");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setSaveMessage("Failed to save. Try again.");
    }
    setSaving(false);
  }

  async function handleRevokeDevice(deviceId: string) {
    setRevoking(deviceId);
    try {
      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;
      await deleteDoc(doc(firestore, "devices", deviceId));
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {
      // best-effort
    }
    setRevoking(null);
  }

  if (!isLoaded) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-4xl px-6 py-8">
          <p className="text-sm text-text-secondary">Loading…</p>
        </main>
      </>
    );
  }

  const uid = getFirebaseAuth().currentUser?.uid;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center text-text-secondary hover:text-text-primary transition-colors duration-instant"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-emphasis">Settings</h1>
            <p className="text-sm text-text-secondary">
              Manage your profile, security, and connected devices.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-emphasis mb-4">
              <UserIcon className="h-4 w-4 text-accent" aria-hidden="true" />
              Profile
            </h2>
            <div className="flex flex-col gap-4 max-w-sm">
              <Input
                label="Display name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (saveMessage) setSaveMessage(null);
                }}
                placeholder="Your name"
              />
              <div>
                <p className="text-sm text-text-secondary">
                  Email: {user?.emailAddresses?.[0]?.emailAddress}
                </p>
                {user?.emailAddresses?.[0]?.verification?.status === "verified" && (
                  <p className="flex items-center gap-1 text-xs text-success mt-1">
                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                    Verified
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveProfile}
                  isLoading={saving}
                  disabled={!displayName.trim()}
                >
                  Save
                </Button>
                {saveMessage && (
                  <span className="text-sm text-text-secondary">{saveMessage}</span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-emphasis mb-4">
              <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
              Security
            </h2>
            <div className="space-y-4">
              <TOTPSetup />
              {uid && <WebAuthnSetup uid={uid} />}
            </div>
          </section>

          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-emphasis mb-4">
              <Laptop className="h-4 w-4 text-accent" aria-hidden="true" />
              Connected devices
            </h2>
            {devices.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No devices registered. Install the host agent on a machine to
                see it here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-sm border border-border-default bg-surface-overlay px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-emphasis">
                        {d.deviceName || platformLabel(d.platform)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {platformLabel(d.platform)} &middot; v{d.appVersion}{" "}
                        &middot; Last seen{" "}
                        {new Date(d.lastSeenAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => handleRevokeDevice(d.id)}
                      isLoading={revoking === d.id}
                      aria-label={`Revoke ${d.deviceName || platformLabel(d.platform)}`}
                    >
                      <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between rounded-md border border-border-default bg-surface-raised p-6">
            <div>
              <p className="text-sm font-emphasis">Sign out</p>
              <p className="text-xs text-text-secondary">
                Sign out of this device. You&apos;ll need to log in again to
                connect.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                const auth = getFirebaseAuth();
                await auth.signOut();
                await clerkSignOut();
                router.push("/");
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}

function platformLabel(p: string): string {
  switch (p) {
    case "windows": return "Windows";
    case "linux-x11": return "Linux (X11)";
    case "linux-wayland": return "Linux (Wayland)";
    default: return "Unknown device";
  }
}
