import { signInWithCustomToken, type Auth } from "firebase/auth";
import { getFirebaseClient } from "./firebase-client";

let _firebaseAuth: Auth | null = null;

/**
 * The auth instance comes from getFirebaseClient rather than a local
 * `getAuth(app)`. That call applied Firebase's default persistence —
 * localStorage — so the refresh token minted below was written to disk in
 * violation of §2.5. firebase-client pins it to memory at construction.
 */
export function getFirebaseAuth() {
  if (!_firebaseAuth) {
    const client = getFirebaseClient();
    if (!client) throw new Error("Firebase not configured");
    _firebaseAuth = client.auth;
  }
  return _firebaseAuth;
}

export async function syncFirebaseAuth(): Promise<void> {
  const res = await fetch("/api/firebase-token", {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to exchange Clerk token for Firebase token");
  }

  const { token } = await res.json();
  const auth = getFirebaseAuth();
  await signInWithCustomToken(auth, token);
}
