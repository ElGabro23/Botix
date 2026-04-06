import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type FirestoreDataConverter
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type {
  AppUser,
  CourierProfile,
  Customer,
  DaySummary,
  DeliveryOrder,
  InventoryItem,
  LiveTracking,
  OrderDraftInput,
  OrderStatus
} from "@botix/shared";
import { couriersPath, customersPath, liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

const identityConverter = <T,>(): FirestoreDataConverter<T> => ({
  toFirestore: (value) => value as never,
  fromFirestore: (snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T
});

const nowIso = () => new Date().toISOString();
const customerIdFromPhone = (phone: string) => `customer-${phone.replace(/\D/g, "") || crypto.randomUUID()}`;

export const subscribeUserProfile = (
  userId: string,
  onData: (user: AppUser | null) => void
) =>
  onSnapshot(doc(firebaseClient.db, "users", userId).withConverter(identityConverter<AppUser>()), (snap) =>
    onData(snap.exists() ? snap.data() : null)
  );

export const subscribeOrders = (businessId: string, onData: (orders: DeliveryOrder[]) => void) => {
  const ordersQuery = query(
    collection(firebaseClient.db, ordersPath(businessId)).withConverter(identityConverter<DeliveryOrder>()),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  return onSnapshot(ordersQuery, (snap) => onData(snap.docs.map((docItem) => docItem.data())));
};

export const subscribeCustomers = (businessId: string, onData: (customers: Customer[]) => void) =>
  onSnapshot(
    query(
      collection(firebaseClient.db, customersPath(businessId)).withConverter(identityConverter<Customer>()),
      orderBy("totalSpent", "desc"),
      limit(8)
    ),
    (snap) => onData(snap.docs.map((docItem) => docItem.data()))
  );

export const subscribeCouriers = (businessId: string, onData: (couriers: CourierProfile[]) => void) =>
  onSnapshot(
    query(
      collection(firebaseClient.db, couriersPath(businessId)).withConverter(identityConverter<CourierProfile>()),
      orderBy("displayName", "asc")
    ),
    (snap) => onData(snap.docs.map((docItem) => docItem.data()))
  );

export const subscribeLiveTracking = (
  businessId: string,
  orderId: string | undefined,
  onData: (tracking: LiveTracking | null) => void
) => {
  if (!orderId) return () => undefined;

  return onSnapshot(
    doc(firebaseClient.db, liveTrackingPath(businessId), orderId).withConverter(identityConverter<LiveTracking>()),
    (snap) => onData(snap.exists() ? snap.data() : null)
  );
};

export const createOrder = async (user: AppUser, draft: OrderDraftInput) => {
  const ordersRef = collection(firebaseClient.db, ordersPath(user.businessId));
  const countersRef = doc(firebaseClient.db, "businesses", user.businessId, "settings", "counters");

  await runTransaction(firebaseClient.db, async (transaction) => {
    const counterSnap = await transaction.get(countersRef);
    const currentNumber = counterSnap.exists() ? counterSnap.data().deliveryOrderSequence ?? 1023 : 1023;
    const nextNumber = currentNumber + 1;
    const customerRef = doc(firebaseClient.db, customersPath(user.businessId), customerIdFromPhone(draft.customerPhone));
    const orderRef = doc(ordersRef);
    const customerSnap = await transaction.get(customerRef);

    const items = draft.items.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice
    }));

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const total = subtotal + draft.deliveryFee;
    const timestamp = nowIso();

    transaction.set(customerRef, {
      businessId: user.businessId,
      name: draft.customerName,
      phone: draft.customerPhone,
      address: draft.address,
      totalOrders: (customerSnap.exists() ? customerSnap.data().totalOrders : 0) + 1,
      totalSpent: (customerSnap.exists() ? customerSnap.data().totalSpent : 0) + total,
      isCreditEnabled: customerSnap.exists() ? customerSnap.data().isCreditEnabled : false
    }, { merge: true });

    transaction.set(orderRef, {
      businessId: user.businessId,
      orderNumber: nextNumber,
      customerId: customerRef.id,
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      address: draft.address,
      items,
      subtotal,
      deliveryFee: draft.deliveryFee,
      total,
      paymentMethod: draft.paymentMethod,
      status: "pending",
      createdBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      notes: draft.notes ?? ""
    });

    transaction.set(
      countersRef,
      {
        deliveryOrderSequence: nextNumber,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  });
};

export const updateOrderStatus = async (
  businessId: string,
  orderId: string,
  status: OrderStatus,
  patch: Partial<DeliveryOrder> = {}
) => {
  await updateDoc(doc(firebaseClient.db, ordersPath(businessId), orderId), {
    status,
    updatedAt: nowIso(),
    ...patch
  });
};

export const assignCourier = async (
  businessId: string,
  orderId: string,
  courier: Pick<CourierProfile, "id" | "displayName">
) => {
  await Promise.all([
    updateDoc(doc(firebaseClient.db, ordersPath(businessId), orderId), {
      assignedCourierId: courier.id,
      assignedCourierName: courier.displayName,
      status: "assigned",
      updatedAt: nowIso()
    }),
    updateDoc(doc(firebaseClient.db, couriersPath(businessId), courier.id), {
      status: "delivering",
      activeOrderIds: [orderId],
      lastSeenAt: nowIso()
    })
  ]);
};

export const subscribeDaySummary = (businessId: string, onData: (summary: DaySummary) => void) => {
  const ordersQuery = query(
    collection(firebaseClient.db, ordersPath(businessId)).withConverter(identityConverter<DeliveryOrder>()),
    where("createdAt", ">=", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
  );

  return onSnapshot(ordersQuery, (snap) => {
    const orders = snap.docs.map((docItem) => docItem.data());
    const summary = orders.reduce<DaySummary>(
      (acc, order) => {
        if (order.status !== "cancelled") {
          acc.salesTotal += order.total;
          acc.deliveryTotal += order.deliveryFee;
          if (order.paymentMethod === "cash") acc.cashTotal += order.total;
          if (order.paymentMethod === "card") acc.cardTotal += order.total;
        }

        if (!["delivered", "cancelled"].includes(order.status)) {
          acc.openOrders += 1;
        }

        return acc;
      },
      { salesTotal: 0, cashTotal: 0, cardTotal: 0, deliveryTotal: 0, openOrders: 0 }
    );

    onData(summary);
  });
};

export const createTrackingLink = async (businessId: string, orderId: string) => {
  const callable = httpsCallable<
    { businessId: string; orderId: string },
    { token: string }
  >(firebaseClient.functions, "createTrackingSession");

  const result = await callable({ businessId, orderId });
  return result.data.token;
};

type InventoryCatalogDocument = {
  items: InventoryItem[];
  updatedAt?: string;
};

export const subscribeInventory = (
  businessId: string,
  onData: (items: InventoryItem[]) => void
) =>
  onSnapshot(
    doc(firebaseClient.db, "businesses", businessId, "settings", "inventoryCatalog").withConverter(
      identityConverter<InventoryCatalogDocument>()
    ),
    (snap) => onData(snap.exists() ? snap.data().items ?? [] : [])
  );

export const saveInventoryItem = async (businessId: string, item: Omit<InventoryItem, "updatedAt">) => {
  const inventoryRef = doc(firebaseClient.db, "businesses", businessId, "settings", "inventoryCatalog");

  await runTransaction(firebaseClient.db, async (transaction) => {
    const snap = await transaction.get(inventoryRef);
    const current = snap.exists() ? ((snap.data().items as InventoryItem[] | undefined) ?? []) : [];
    const updatedItem: InventoryItem = { ...item, updatedAt: nowIso() };
    const nextItems = [...current.filter((entry) => entry.id !== item.id), updatedItem].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    transaction.set(
      inventoryRef,
      {
        items: nextItems,
        updatedAt: nowIso()
      },
      { merge: true }
    );
  });
};
