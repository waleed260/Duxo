import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
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
let _db: Database | null = null;
let _firestore: Firestore | null = null;

function configMissing(): boolean {
  return !firebaseConfig.apiKey || !firebaseConfig.projectId;
}

export function getFirebaseClient() {
  if (configMissing()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    _db = getDatabase(_app);
    _firestore = getFirestore(_app);
  }
  return { app: _app, db: _db!, firestore: _firestore! };
}
