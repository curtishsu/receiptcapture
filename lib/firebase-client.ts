import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let clientAuth: Auth | null = null;

function getFirebaseConfig(): FirebaseOptions {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "storageBucket" && key !== "messagingSenderId" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase client config: ${missing.join(", ")}`);
  }

  return config;
}

export function getFirebaseClientAuth(): Auth {
  if (!clientAuth) {
    const app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());
    clientAuth = getAuth(app);
  }

  return clientAuth;
}
