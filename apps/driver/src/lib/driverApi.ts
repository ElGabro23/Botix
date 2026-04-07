import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import type { AppUser, BusinessProfile, DeliveryOrder } from "@botix/shared";
import { liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

const TRACKING_TASK_NAME = "botix-driver-live-tracking";
const TRACKING_CONTEXT_KEY = "botix.driver.tracking-context";

type TrackingContext = {
  businessId: string;
  orderId: string;
  courierId: string;
  trackingToken?: string;
};

const todayStartIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const resolveTrackingContext = async (context: TrackingContext) => {
  if (context.trackingToken) return context;

  const orderSnap = await getDoc(doc(firebaseClient.db, ordersPath(context.businessId), context.orderId));
  if (!orderSnap.exists()) return context;

  const order = orderSnap.data() as DeliveryOrder;
  if (!order.trackingToken) return context;

  const nextContext = { ...context, trackingToken: order.trackingToken };
  await AsyncStorage.setItem(TRACKING_CONTEXT_KEY, JSON.stringify(nextContext));
  return nextContext;
};

const writeTrackingLocation = async (
  context: TrackingContext,
  coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude" | "heading" | "speed" | "accuracy">
) => {
  const resolvedContext = await resolveTrackingContext(context);
  const payload = {
    orderId: resolvedContext.orderId,
    businessId: resolvedContext.businessId,
    courierId: resolvedContext.courierId,
    lat: coords.latitude,
    lng: coords.longitude,
    heading: coords.heading ?? null,
    speed: coords.speed ?? null,
    accuracy: coords.accuracy ?? null,
    active: true,
    updatedAt: new Date().toISOString()
  };

  await setDoc(
    doc(firebaseClient.db, liveTrackingPath(resolvedContext.businessId), resolvedContext.orderId),
    payload,
    { merge: true }
  );

  if (resolvedContext.trackingToken) {
    await setDoc(
      doc(firebaseClient.db, "trackingSessions", resolvedContext.trackingToken),
      {
        businessId: resolvedContext.businessId,
        orderId: resolvedContext.orderId,
        courierId: resolvedContext.courierId,
        lat: payload.lat,
        lng: payload.lng,
        active: true,
        updatedAt: payload.updatedAt
      },
      { merge: true }
    );
  }
};

if (!TaskManager.isTaskDefined(TRACKING_TASK_NAME)) {
  TaskManager.defineTask(TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    const latest = locations?.[locations.length - 1];
    if (!latest) return;

    const rawContext = await AsyncStorage.getItem(TRACKING_CONTEXT_KEY);
    if (!rawContext) return;

    const context = JSON.parse(rawContext) as TrackingContext;
    await writeTrackingLocation(context, latest.coords);
  });
}

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
  const orderRef = doc(firebaseClient.db, ordersPath(businessId), orderId);
  const timestamp = new Date().toISOString();
  const orderSnap = await getDoc(orderRef);

  await updateDoc(orderRef, {
    status,
    updatedAt: timestamp
  });

  if (orderSnap.exists()) {
    const order = orderSnap.data() as DeliveryOrder;
    if (order.trackingToken) {
      await setDoc(
        doc(firebaseClient.db, "trackingSessions", order.trackingToken),
        {
          businessId,
          orderId,
          courierId: order.assignedCourierId ?? null,
          courierName: order.assignedCourierName ?? null,
          status,
          active: !["delivered", "cancelled"].includes(status),
          updatedAt: timestamp
        },
        { merge: true }
      );
    }
  }
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
  const context: TrackingContext = {
    businessId,
    orderId,
    courierId,
    trackingToken
  };
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("Se requiere permiso de ubicacion.");

  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    // Continue even if the device rejects the provider prompt.
  }

  const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  await AsyncStorage.setItem(TRACKING_CONTEXT_KEY, JSON.stringify(context));

  const initialLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });
  await writeTrackingLocation(context, initialLocation.coords);

  if (backgroundPermission.granted) {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME);
    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 8,
      timeInterval: 7000,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "BOTIX Driver activo",
        notificationBody: "Compartiendo ubicacion del pedido en reparto",
        notificationColor: "#1f93d0"
      }
    });
  }

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
      timeInterval: 5000
    },
    (location) => writeTrackingLocation(context, location.coords)
  );
};

export const stopLocationTracking = async (
  businessId: string,
  orderId: string,
  courierId: string,
  trackingToken?: string
) => {
  await AsyncStorage.removeItem(TRACKING_CONTEXT_KEY);
  const started = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
  }

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

export const stopAllDriverTracking = async () => {
  await AsyncStorage.removeItem(TRACKING_CONTEXT_KEY);
  const started = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
  }
};
