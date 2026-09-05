import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * RTDB URL fallback.
 *
 * `getDatabase()` throws "Can't determine Firebase Database URL" when
 * `databaseURL` is undefined, which takes down every page that touches
 * signaling (§0.6). NEXT_PUBLIC_FIREBASE_DATABASE_URL stays the source of
 * truth — required for non-default RTDB regions — but when it is absent we
 * derive Firebase's default instance from the project id instead of crashing.
 */
function resolveDatabaseUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (explicit) return explicit;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: resolveDatabaseUrl(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Database | null = null;
let _firestore: Firestore | null = null;

function configMissing(): boolean {
  return !firebaseConfig.apiKey || !firebaseConfig.projectId;
}

/**
 * §2.5 — the Firebase session is held in memory and nowhere else.
 *
 * This is `initializeAuth` rather than `getAuth` specifically to pin
 * persistence at construction. `getAuth` applies Firebase's default, which is
 * `browserLocalPersistence` — localStorage — and that is what this module
 * used to do: every `signInWithCustomToken` in auth-bridge wrote a Firebase
 * refresh token to localStorage, where it outlived the tab and was readable
 * by anything that achieved script execution on the origin. §2.5 and the
 * header of lib/firebase.ts both say that must never happen; nothing was
 * enforcing it.
 *
 * Setting it afterwards with `setPersistence` is not equivalent: that call is
 * async, so a sign-in can race ahead of it and land in the default store
 * anyway. Passing it here means there is no window in which the wrong
 * persistence is active.
 *
 * Memory-only costs nothing, because the Firebase identity is derived, not
 * primary: Clerk holds the real session, and every page that needs Firebase
 * calls `syncFirebaseAuth()` on mount to re-mint from it. Persisting the
 * token only ever saved a token exchange.
 */
function initAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    // Already initialised for this app (a second module reached it first, or
    // a hot reload re-ran this). getAuth then returns that same instance,
    // which initializeAuth configured.
    return getAuth(app);
  }
}

export function getFirebaseClient() {
  if (configMissing()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    _auth = initAuth(_app);
    _db = getDatabase(_app);
    _firestore = getFirestore(_app);
  }
  return { app: _app, auth: _auth!, db: _db!, firestore: _firestore! };
}
