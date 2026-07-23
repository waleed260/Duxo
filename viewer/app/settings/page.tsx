"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { getFirebase } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
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
  const [user, setUser] = React.useState<User | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);

  const [displayName, setDisplayName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  const [devices, setDevices] = React.useState<(DeviceRecord & { id: string })[]>([]);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  React.useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) router.replace("/login");
      if (u?.displayName) setDisplayName(u.displayName);
    });
    return () => unsub();
  }, [router]);

  React.useEffect(() => {
    if (!user) return;
    const { firestore } = getFirebase();
    const q = query(
      collection(firestore, "devices"),
      where("ownerUid", "==", user.uid),
    );
    getDocs(q).then((snap) => {
      const next: (DeviceRecord & { id: string })[] = [];
      snap.forEach((d) => next.push({ id: d.id, ...(d.data() as DeviceRecord) }));
      setDevices(next);
    }).catch(() => {});
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateProfile(user, { displayName });
      const { firestore } = getFirebase();
      const userRef = doc(firestore, "users", user.uid);
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        await updateDoc(userRef, { displayName });
      } else {
        await setDoc(userRef, {
          email: user.email,
          displayName,
          emailVerified: user.emailVerified,
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
      const { firestore } = getFirebase();
      await deleteDoc(doc(firestore, "devices", deviceId));
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {
      // best-effort
    }
    setRevoking(null);
  }

  if (!authChecked) {
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
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center text-text-secondary hover:text-text-primary transition-colors duration-instant"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-weight-emphasis">Settings</h1>
            <p className="text-sm text-text-secondary">
              Manage your profile, security, and connected devices.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Profile section */}
          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-weight-emphasis mb-4">
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
                  Email: {user?.email}
                </p>
                {user?.emailVerified && (
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

          {/* Security section */}
          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-weight-emphasis mb-4">
              <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
              Security
            </h2>
            <div className="space-y-4">
              <TOTPSetup />
              {user && <WebAuthnSetup uid={user.uid} />}
            </div>
          </section>

          {/* Devices section */}
          <section className="rounded-md border border-border-default bg-surface-raised p-6">
            <h2 className="flex items-center gap-2 text-lg font-weight-emphasis mb-4">
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
                      <p className="text-sm font-weight-emphasis">
                        {platformLabel(d.platform)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        v{d.appVersion} &middot; Last seen{" "}
                        {new Date(d.lastSeenAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => handleRevokeDevice(d.id)}
                      isLoading={revoking === d.id}
                      aria-label={`Revoke ${platformLabel(d.platform)}`}
                    >
                      <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sign out */}
          <div className="flex items-center justify-between rounded-md border border-border-default bg-surface-raised p-6">
            <div>
              <p className="text-sm font-weight-emphasis">Sign out</p>
              <p className="text-xs text-text-secondary">
                Sign out of this device. You&apos;ll need to log in again to
                connect.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                const { auth } = getFirebase();
                await signOut(auth);
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
