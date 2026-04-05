import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

export const createFirebaseClient = (config: FirebaseOptions) => {
  const requiredKeys = ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"] as const;

  for (const key of requiredKeys) {
    if (!config[key]) {
      throw new Error(`Firebase config incompleta: falta ${key}.`);
    }
  }

  const app = getApps()[0] ?? initializeApp(config);

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    functions: getFunctions(app)
  };
};

export const getMessagingIfSupported = async () => {
  const messaging = await import("firebase/messaging");
  const supported = await messaging.isSupported();
  return supported ? messaging.getMessaging() : null;
};
