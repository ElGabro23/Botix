import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import type { AppUser } from "@botix/shared";
import { firebaseClient } from "@/lib/firebase";
import { subscribeUserProfile } from "@/lib/botixApi";

export const useAuthSession = () => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = () => undefined;

    const unsubscribeAuth = onAuthStateChanged(firebaseClient.auth, (user) => {
      setAuthUser(user);

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      unsubscribeProfile = subscribeUserProfile(user.uid, (profileData) => {
        setProfile(profileData);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, []);

  return {
    authUser,
    profile,
    loading,
    signIn: (email: string, password: string) =>
      signInWithEmailAndPassword(firebaseClient.auth, email, password),
    signOut: () => signOut(firebaseClient.auth)
  };
};

