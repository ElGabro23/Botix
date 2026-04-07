import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getReactNativePersistence, initializeAuth } from "@firebase/auth/dist/rn/index.js";

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

const config = {
  apiKey: runtimeEnv?.EXPO_PUBLIC_FIREBASE_API_KEY ?? fallbackConfig.apiKey,
  authDomain: runtimeEnv?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? fallbackConfig.authDomain,
  projectId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? fallbackConfig.projectId,
  storageBucket: runtimeEnv?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? fallbackConfig.storageBucket,
  messagingSenderId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? fallbackConfig.messagingSenderId,
  appId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_APP_ID ?? fallbackConfig.appId,
  measurementId: runtimeEnv?.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? fallbackConfig.measurementId
} as const;

const app = getApps()[0] ?? initializeApp(config);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch {
  auth = getAuth(app);
}

export const firebaseClient = {
  app,
  auth,
  db: getFirestore(app)
};
