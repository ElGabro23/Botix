import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import * as Location from "expo-location";
import type { AppUser, DeliveryOrder } from "@botix/shared";
import { liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

export const useDriverSession = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeProfile = () => undefined;

    const unsubscribe = onAuthStateChanged(firebaseClient.auth, (authUser) => {
      if (!authUser) {
        setUser(null);
        setError("");
        setLoading(false);
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(firebaseClient.db, "users", authUser.uid),
        (snap) => {
          setUser(snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null);
          setError("");
          setLoading(false);
        },
        (snapshotError) => {
          setError(snapshotError.message);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribe();
      unsubscribeProfile();
    };
  }, []);

  return {
    user,
    loading,
    error,
    signIn: async (email: string, password: string) => {
      try {
        setError("");
        await signInWithEmailAndPassword(firebaseClient.auth, email, password);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : "No fue posible iniciar sesion.");
      }
    },
    signOut: () => signOut(firebaseClient.auth)
  };
};

export const useAssignedOrders = (businessId?: string, courierId?: string) => {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId || !courierId) {
      setOrders([]);
      setError("");
      return;
    }

    return onSnapshot(
      query(
        collection(firebaseClient.db, ordersPath(businessId)),
        where("assignedCourierId", "==", courierId)
      ),
      (snap) => {
        const nextOrders = snap.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }) as DeliveryOrder)
          .filter((order) => ["assigned", "en_route", "incident"].includes(order.status))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setOrders(nextOrders);
        setError("");
      },
      (snapshotError) => {
        setError(snapshotError.message);
      }
    );
  }, [businessId, courierId]);

  return { orders, error };
};

export const updateDriverOrderStatus = async (
  businessId: string,
  orderId: string,
  status: DeliveryOrder["status"]
) => {
  await updateDoc(doc(firebaseClient.db, ordersPath(businessId), orderId), {
    status,
    updatedAt: new Date().toISOString()
  });
};

export const startLocationTracking = async (businessId: string, orderId: string, courierId: string) => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("Se requiere permiso de ubicacion.");

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 30,
      timeInterval: 20000
    },
    async (location) => {
      await setDoc(
        doc(firebaseClient.db, liveTrackingPath(businessId), orderId),
        {
        orderId,
        businessId,
        courierId,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        heading: location.coords.heading ?? null,
        speed: location.coords.speed ?? null,
        accuracy: location.coords.accuracy ?? null,
        active: true,
        updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  );
};

export const stopLocationTracking = async (businessId: string, orderId: string) => {
  await setDoc(doc(firebaseClient.db, liveTrackingPath(businessId), orderId), {
    active: false,
    updatedAt: new Date().toISOString()
  }, { merge: true });
};
