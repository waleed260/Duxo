import { getAuth, signInWithCustomToken, type Auth } from "firebase/auth";
import { getFirebaseClient } from "./firebase-client";

let _firebaseAuth: Auth | null = null;

export function getFirebaseAuth() {
  if (!_firebaseAuth) {
    const client = getFirebaseClient();
    if (!client) throw new Error("Firebase not configured");
    _firebaseAuth = getAuth(client.app);
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
