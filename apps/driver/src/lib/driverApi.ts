import { useEffect, useState } from "react";
import {
  arrayUnion,
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
import * as Notifications from "expo-notifications";
import type { AppUser, BusinessProfile, DeliveryOrder } from "@botix/shared";
import { liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

const todayStartIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const useDriverSession = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeProfile = () => undefined;
    let unsubscribeBusiness = () => undefined;

    const unsubscribe = onAuthStateChanged(firebaseClient.auth, (authUser) => {
      if (!authUser) {
        setUser(null);
        setBusiness(null);
        setError("");
        setLoading(false);
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(firebaseClient.db, "users", authUser.uid),
        (snap) => {
          const nextUser = snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null;
          setUser(nextUser);
          unsubscribeBusiness();
          if (nextUser?.businessId) {
            unsubscribeBusiness = onSnapshot(doc(firebaseClient.db, "businesses", nextUser.businessId), (businessSnap) => {
              setBusiness(
                businessSnap.exists()
                  ? ({ id: businessSnap.id, accessEnabled: true, subscriptionStatus: "active", ...businessSnap.data() } as BusinessProfile)
                  : null
              );
            });
          } else {
            setBusiness(null);
          }
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
      unsubscribeBusiness();
    };
  }, []);

  return {
    user,
    business,
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
        where("businessId", "==", businessId),
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

export const useDriverDayEarnings = (businessId?: string, courierId?: string) => {
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    if (!businessId || !courierId) {
      setEarnings(0);
      return;
    }

    return onSnapshot(
      query(
        collection(firebaseClient.db, ordersPath(businessId)),
        where("businessId", "==", businessId),
        where("assignedCourierId", "==", courierId)
      ),
      (snap) => {
        const start = todayStartIso();
        const total = snap.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }) as DeliveryOrder)
          .filter((order) => order.status === "delivered" && order.updatedAt >= start)
          .reduce((sum, order) => sum + (order.deliveryFee ?? 0), 0);
        setEarnings(total);
      }
    );
  }, [businessId, courierId]);

  return earnings;
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

export const registerDriverPushToken = async (userId: string) => {
  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    throw new Error("Permiso de notificaciones no concedido.");
  }

  await Notifications.setNotificationChannelAsync("orders", {
    name: "Pedidos BOTIX",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250]
  });

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  const token = typeof devicePushToken.data === "string" ? devicePushToken.data : "";
  if (!token) throw new Error("No fue posible obtener el token push del dispositivo.");

  await updateDoc(doc(firebaseClient.db, "users", userId), {
    notificationTokens: arrayUnion(token)
  });

  return token;
};

export const startLocationTracking = async (
  businessId: string,
  orderId: string,
  courierId: string,
  trackingToken?: string
) => {
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

      if (trackingToken) {
        await setDoc(
          doc(firebaseClient.db, "trackingSessions", trackingToken),
          {
            businessId,
            orderId,
            courierId,
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            active: true,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      }
    }
  );
};

export const stopLocationTracking = async (
  businessId: string,
  orderId: string,
  courierId: string,
  trackingToken?: string
) => {
  await setDoc(doc(firebaseClient.db, liveTrackingPath(businessId), orderId), {
    orderId,
    businessId,
    courierId,
    active: false,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  if (trackingToken) {
    await setDoc(
      doc(firebaseClient.db, "trackingSessions", trackingToken),
      {
        businessId,
        orderId,
        courierId,
        active: false,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  }
};
