import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import type { AppUser, BusinessProfile } from "@botix/shared";
import { firebaseClient } from "@/lib/firebase";
import { subscribeBusinessProfile, subscribeUserProfile } from "@/lib/botixApi";

export const useAuthSession = () => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = () => undefined;
    let unsubscribeBusiness = () => undefined;

    const unsubscribeAuth = onAuthStateChanged(firebaseClient.auth, (user) => {
      setAuthUser(user);

      if (!user) {
        setProfile(null);
        setBusiness(null);
        setLoading(false);
        return;
      }

      unsubscribeProfile = subscribeUserProfile(user.uid, (profileData) => {
        setProfile(profileData);
        unsubscribeBusiness();
        if (profileData?.businessId) {
          unsubscribeBusiness = subscribeBusinessProfile(profileData.businessId, setBusiness);
        } else {
          setBusiness(null);
        }
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
      unsubscribeBusiness();
    };
  }, []);

  return {
    authUser,
    profile,
    business,
    loading,
    signIn: (email: string, password: string) =>
      signInWithEmailAndPassword(firebaseClient.auth, email, password),
    signOut: () => signOut(firebaseClient.auth)
  };
};
