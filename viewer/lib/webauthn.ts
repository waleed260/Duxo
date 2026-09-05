/**
 * §8.1 — WebAuthn / Passkey support for biometric 2FA.
 *
 * Uses browser-native WebAuthn API (navigator.credentials) for registration
 * and authentication. Credentials are stored in Firestore at
 * users/{uid}/webauthn/{credentialId}.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOT A SECURITY BOUNDARY IN ITS CURRENT FORM. Read before enabling this
 * as anyone's only second factor.
 *
 * `authenticateWithPasskey` does not verify anything. It calls
 * `navigator.credentials.get()`, takes the credential id off the assertion,
 * and checks that id appears in the user's stored list. It never checks the
 * signature against the stored public key, never checks the challenge it
 * just generated came back in `clientDataJSON`, never checks the origin or
 * rpIdHash, and never compares the signature counter it stores against the
 * one in the assertion — so a cloned authenticator is undetectable too.
 *
 * A credential id is a public identifier, not a secret. Everything this
 * function proves is that something returned an id that is already in a list
 * the caller supplied. The private key — the entire point of WebAuthn — is
 * never exercised.
 *
 * The previous version of this comment said verification was "done
 * client-side", which reads as done-but-weak rather than absent, and
 * justified it with "a static-export site". That justification does not hold
 * here: the viewer is server-rendered on Railway precisely because it needs
 * a server runtime, and app/api already holds the Firebase Admin credential.
 * There is a server to verify on.
 *
 * Doing this properly means a route that keeps the challenge server-side,
 * parses the CBOR attestation/COSE public key, verifies the assertion
 * signature, and enforces monotonic counters. That is a feature, not a fix,
 * so it is flagged here rather than half-built.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * TOTP remains the primary 2FA method (§2.3). WebAuthn is an alternative
 * that users can enable alongside or instead of TOTP codes.
 */

import { getFirebase } from "@/lib/firebase";
import {
  doc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  deviceName: string;
  createdAt: number;
}

const RP_NAME = "Duxo";
const RP_ID =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

function base64urlToBytes(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufferToBase64url(bytes.buffer);
}

function parsePublicKey(authData: ArrayBuffer): string {
  return bufferToBase64url(authData);
}

export async function registerPasskey(
  uid: string,
  deviceName: string
): Promise<WebAuthnCredential> {
  const challenge = generateChallenge();

  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: new TextEncoder().encode(uid) as unknown as BufferSource,
      name: uid,
      displayName: `Duxo User (${uid.slice(0, 8)})`,
    },
    challenge: base64urlToBytes(challenge).buffer as unknown as BufferSource,
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestation: "none",
    timeout: 60000,
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("WebAuthn registration cancelled or failed");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = bufferToBase64url(credential.rawId);

  const publicKeyB64 = parsePublicKey(
    response.getPublicKey?.() ?? response.attestationObject
  );

  const transports: AuthenticatorTransport[] = (
    response.getTransports?.() ?? []
  ) as AuthenticatorTransport[];

  return {
    id: credentialId,
    publicKey: publicKeyB64,
    counter: 0,
    transports,
    deviceName,
    createdAt: Date.now(),
  };
}

export async function authenticateWithPasskey(
  credentials: WebAuthnCredential[]
): Promise<{ credentialId: string }> {
  const challenge = generateChallenge();

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64urlToBytes(challenge).buffer as unknown as BufferSource,
    rpId: RP_ID,
    allowCredentials: credentials.map((c) => ({
      id: base64urlToBytes(c.id).buffer as unknown as BufferSource,
      type: "public-key" as PublicKeyCredentialType,
      transports: c.transports,
    })),
    userVerification: "preferred",
    timeout: 60000,
  };

  const assertion = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Passkey authentication cancelled or failed");
  }

  const credentialId = bufferToBase64url(assertion.rawId);

  // An id match, and nothing more. See the file header: the assertion's
  // signature, challenge, origin and counter are all unchecked, so this
  // establishes that an authenticator returned a known public identifier —
  // not that anyone holds the corresponding private key.
  const matched = credentials.find((c) => c.id === credentialId);
  if (!matched) {
    throw new Error("Authenticated credential not found in stored credentials");
  }

  return { credentialId };
}

export async function storeCredential(
  uid: string,
  credential: WebAuthnCredential
): Promise<void> {
  const fb = getFirebase(); if (!fb) return; const { firestore } = fb;
  const ref = doc(firestore, "users", uid, "webauthn", credential.id);
  await setDoc(ref, credential);
}

export async function loadCredentials(
  uid: string
): Promise<WebAuthnCredential[]> {
  const fb = getFirebase(); if (!fb) return []; const { firestore } = fb;
  const ref = collection(firestore, "users", uid, "webauthn");
  const snapshot = await getDocs(ref);
  return snapshot.docs.map((d) => d.data() as WebAuthnCredential);
}

export async function deleteCredential(
  uid: string,
  credentialId: string
): Promise<void> {
  const fb = getFirebase(); if (!fb) return; const { firestore } = fb;
  const ref = doc(firestore, "users", uid, "webauthn", credentialId);
  await deleteDoc(ref);
}

export async function updateCredentialCounter(
  uid: string,
  credentialId: string,
  _newCounter: number
): Promise<void> {
  const fb = getFirebase(); if (!fb) return; const { firestore } = fb;
  const ref = doc(firestore, "users", uid, "webauthn", credentialId);
  await updateDoc(ref, { counter: _newCounter });
}

export async function hasWebAuthnCredentials(uid: string): Promise<boolean> {
  const creds = await loadCredentials(uid);
  return creds.length > 0;
}
