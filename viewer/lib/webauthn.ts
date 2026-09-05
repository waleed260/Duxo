/**
 * §8.1 — WebAuthn / Passkey support for biometric 2FA.
 *
 * The browser half only. Everything that decides whether a ceremony
 * *succeeded* lives in /api/webauthn/{options,verify}, which hold the
 * challenge and the public keys; this file drives the WebAuthn API and
 * relays. Nothing here is trusted, and nothing here needs to be.
 *
 * That split is the fix for what this file used to be. It generated its own
 * challenge, never looked at it again, and treated any assertion carrying a
 * known credential id as authentication — but a credential id is a public
 * identifier, so the private key was never exercised. It also wrote the
 * signature counter back as a literal 0 on every success, so clone detection
 * could not have worked either. `@simplewebauthn/browser` and
 * `@simplewebauthn/server` had been added to package.json for this and were
 * never imported, then removed again as unused.
 *
 * Credentials still live in Firestore at users/{uid}/webauthn/{credentialId},
 * written by the server. The rules there are covered by
 * rules-tests/firestore.rules.test.ts.
 *
 * TOTP remains the primary 2FA method (§2.3).
 */

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { getFirebase } from "@/lib/firebase";
import { doc, collection, getDocs, deleteDoc } from "firebase/firestore";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  deviceName: string;
  createdAt: number;
  lastUsedAt?: number;
}

/** True when this browser can do WebAuthn at all. */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "WebAuthn request failed",
    );
  }
  return data;
}

/**
 * Register a passkey. The server issues the challenge, verifies the
 * attestation and stores the credential; this only runs the browser ceremony
 * in between.
 *
 * `uid` is no longer a parameter: the server takes the uid from the Clerk
 * session, so passing one from the client could only ever be ignored or
 * abused.
 */
export async function registerPasskey(deviceName: string): Promise<WebAuthnCredential> {
  const options = await post("/api/webauthn/options", { mode: "register" });
  const response = await startRegistration({ optionsJSON: options });
  const result = await post("/api/webauthn/verify", {
    mode: "register",
    response,
    deviceName,
  });
  return {
    id: result.credentialId,
    publicKey: "",
    counter: 0,
    deviceName: result.deviceName,
    createdAt: Date.now(),
  };
}

/**
 * Authenticate with a registered passkey.
 *
 * Resolves only when the server has verified the signature against the stored
 * public key, the challenge it issued, the origin, the rpID and an advancing
 * counter. Anything else throws.
 */
export async function authenticateWithPasskey(): Promise<{ credentialId: string }> {
  const options = await post("/api/webauthn/options", { mode: "authenticate" });
  const response = await startAuthentication({ optionsJSON: options });
  const result = await post("/api/webauthn/verify", { mode: "authenticate", response });
  return { credentialId: result.credentialId };
}

/**
 * List this user's registered passkeys, for /settings.
 *
 * Read directly from Firestore rather than through an API route: the rules
 * already restrict users/{uid}/webauthn to its owner, and this is display
 * data, not a security decision.
 */
export async function loadCredentials(uid: string): Promise<WebAuthnCredential[]> {
  const fb = getFirebase();
  if (!fb) return [];
  const snapshot = await getDocs(collection(fb.firestore, "users", uid, "webauthn"));
  return snapshot.docs.map((d) => d.data() as WebAuthnCredential);
}

export async function deleteCredential(uid: string, credentialId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await deleteDoc(doc(fb.firestore, "users", uid, "webauthn", credentialId));
}

export async function hasWebAuthnCredentials(uid: string): Promise<boolean> {
  return (await loadCredentials(uid)).length > 0;
}
