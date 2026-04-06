import { createFirebaseClient } from "@botix/firebase-core";

const fallbackConfig = {
  apiKey: "AIzaSyBIy_RMiEIyYlZWYiuo1UdQliTln4smHx8",
  authDomain: "botix-e493b.firebaseapp.com",
  projectId: "botix-e493b",
  storageBucket: "botix-e493b.firebasestorage.app",
  messagingSenderId: "213505703707",
  appId: "1:213505703707:web:798a040c888c6b58e95dbe",
  measurementId: "G-RXFY7ZGHVY"
} as const;
const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;

export const firebaseClient = createFirebaseClient({
  apiKey: runtimeEnv?.EXPO_PUBLIC_FIREBASE_API_KEY ?? fallbackConfig.apiKey,
  authDomain: runtimeEnv?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? fallbackConfig.authDomain,
  projectId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? fallbackConfig.projectId,
  storageBucket: runtimeEnv?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? fallbackConfig.storageBucket,
  messagingSenderId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? fallbackConfig.messagingSenderId,
  appId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_APP_ID ?? fallbackConfig.appId,
  measurementId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? fallbackConfig.measurementId
});
