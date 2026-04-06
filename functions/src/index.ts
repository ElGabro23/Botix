import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import crypto from "node:crypto";

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

export const createTrackingSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesion.");

  const { businessId, orderId } = request.data as { businessId?: string; orderId?: string };
  if (!businessId || !orderId) throw new HttpsError("invalid-argument", "Faltan businessId u orderId.");

  const userSnap = await db.doc(`users/${request.auth.uid}`).get();
  const role = userSnap.data()?.role;
  if (!["admin", "cashier"].includes(role)) throw new HttpsError("permission-denied", "No autorizado.");

  const orderRef = db.doc(`businesses/${businessId}/deliveryOrders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError("not-found", "Pedido no encontrado.");

  const order = orderSnap.data()!;
  const token = order.trackingToken ?? crypto.randomBytes(24).toString("hex");

  await db.doc(`trackingSessions/${token}`).set({
    businessId,
    orderId,
    customerName: order.customerName,
    status: order.status,
    courierName: order.assignedCourierName ?? null,
    active: !["delivered", "cancelled"].includes(order.status),
    updatedAt: new Date().toISOString()
  });

  await orderRef.set(
    {
      trackingToken: token,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  return { token };
});

export const syncTrackingSession = onDocumentWritten(
  "businesses/{businessId}/deliveryOrders/{orderId}",
  async (event) => {
    const after = event.data?.after.data();
    if (!after?.trackingToken) return;

    await db.doc(`trackingSessions/${after.trackingToken}`).set(
      {
        businessId: event.params.businessId,
        orderId: event.params.orderId,
        customerName: after.customerName,
        status: after.status,
        courierName: after.assignedCourierName ?? null,
        active: !["delivered", "cancelled"].includes(after.status),
        updatedAt: after.updatedAt ?? new Date().toISOString()
      },
      { merge: true }
    );
  }
);

export const syncLiveTracking = onDocumentWritten(
  "businesses/{businessId}/liveTracking/{orderId}",
  async (event) => {
    const after = event.data?.after.data();
    if (!after) return;

    const orderSnap = await db.doc(`businesses/${event.params.businessId}/deliveryOrders/${event.params.orderId}`).get();
    const token = orderSnap.data()?.trackingToken;
    if (!token) return;

    await db.doc(`trackingSessions/${token}`).set(
      {
        lat: after.active ? after.lat : null,
        lng: after.active ? after.lng : null,
        active: after.active,
        updatedAt: after.updatedAt ?? new Date().toISOString()
      },
      { merge: true }
    );
  }
);

export const notifyCourierOnAssignment = onDocumentUpdated(
  "businesses/{businessId}/deliveryOrders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    if (before?.assignedCourierId === after.assignedCourierId || !after.assignedCourierId) return;

    const userSnap = await db.doc(`users/${after.assignedCourierId}`).get();
    const tokens = userSnap.data()?.notificationTokens ?? [];
    if (!tokens.length) return;

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Nuevo pedido asignado",
        body: `Pedido #${after.orderNumber} para ${after.customerName}`
      },
      data: {
        orderId: event.params.orderId,
        businessId: event.params.businessId
      }
    });

    const invalidTokens = response.responses
      .map((result, index) => (!result.success ? tokens[index] : null))
      .filter(Boolean);

    if (invalidTokens.length) {
      await db.doc(`users/${after.assignedCourierId}`).set({
        notificationTokens: FieldValue.arrayRemove(...invalidTokens)
      }, { merge: true });
    }
  }
);

export const syncCourierLoad = onDocumentUpdated(
  "businesses/{businessId}/deliveryOrders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    const businessId = event.params.businessId;
    const orderId = event.params.orderId;

    if (before?.assignedCourierId && before.assignedCourierId !== after.assignedCourierId) {
      await db.doc(`businesses/${businessId}/couriers/${before.assignedCourierId}`).set(
        {
          activeOrderIds: FieldValue.arrayRemove(orderId),
          status: "available",
          lastSeenAt: new Date().toISOString()
        },
        { merge: true }
      );
    }

    if (after.assignedCourierId) {
      const isActive = ["assigned", "en_route", "incident", "preparing"].includes(after.status);
      await db.doc(`businesses/${businessId}/couriers/${after.assignedCourierId}`).set(
        {
          activeOrderIds: isActive ? FieldValue.arrayUnion(orderId) : FieldValue.arrayRemove(orderId),
          status: isActive ? "delivering" : "available",
          lastSeenAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  }
);

export const createCourierAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesion.");

  const actorSnap = await db.doc(`users/${request.auth.uid}`).get();
  const actor = actorSnap.data();
  if (!actor || actor.role !== "admin") throw new HttpsError("permission-denied", "Solo admin puede crear repartidores.");

  const { businessId, displayName, email, phone, password } = request.data as {
    businessId?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    password?: string;
  };

  if (!businessId || !displayName || !email || !phone || !password) {
    throw new HttpsError("invalid-argument", "Faltan datos del repartidor.");
  }

  if (actor.businessId !== businessId) {
    throw new HttpsError("permission-denied", "No puedes crear repartidores para otro negocio.");
  }

  const userRecord = await adminAuth.createUser({
    email,
    password,
    displayName
  });

  const timestamp = new Date().toISOString();

  await db.doc(`users/${userRecord.uid}`).set({
    active: true,
    businessId,
    displayName,
    email,
    phone,
    role: "courier"
  });

  await db.doc(`businesses/${businessId}/couriers/${userRecord.uid}`).set({
    businessId,
    userId: userRecord.uid,
    displayName,
    phone,
    activeOrderIds: [],
    deliveredTotal: 0,
    status: "available",
    lastSeenAt: timestamp
  });

  return { uid: userRecord.uid };
});
