/**
 * Duxo — Firebase client initialization (viewer side).
 *
 * Reads config from env (never commit real keys). Spark plan covers
 * Auth + RTDB + Firestore with no card required (§0.3 Path A).
 *
 * IMPORTANT — §2.5: ID tokens live in memory only. Never localStorage.
 * The viewer keeps the token in memory and includes it in the RTDB session
 * request; the host agent verifies the JWT signature locally (§2.5).
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
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

export function getFirebase() {
  if (configMissing()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(_app);
    _auth = auth;
    _db = getDatabase(_app);
    _firestore = getFirestore(_app);

    void setPersistence(auth, browserSessionPersistence).catch(() => {
      void setPersistence(auth, browserLocalPersistence);
    });
  }
  return { app: _app, auth: _auth!, db: _db!, firestore: _firestore! };
}
