import { deleteApp, initializeApp } from "firebase/app";
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
import { createUserWithEmailAndPassword, getAuth, signOut as signOutAuth, updateProfile } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type {
  AppUser,
  CounterSale,
  CourierProfile,
  Customer,
  DaySummary,
  DeliveryOrder,
  InventoryItem,
  LiveTracking,
  OrderItem,
  OrderStatus,
  PaymentMethod
} from "@botix/shared";
import { couriersPath, customersPath, liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

const identityConverter = <T,>(): FirestoreDataConverter<T> => ({
  toFirestore: (value) => value as never,
  fromFirestore: (snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T
});

const nowIso = () => new Date().toISOString();
const monthStartIso = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};
const customerIdFromPhone = (phone: string) => `customer-${phone.replace(/\D/g, "") || crypto.randomUUID()}`;
const withoutUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const applyInventoryDiscount = (catalog: InventoryItem[], items: OrderItem[]) => {
  const timestamp = nowIso();
  const inventoryMap = new Map(catalog.map((item) => [item.id, item]));

  for (const orderItem of items) {
    const inventoryItem = inventoryMap.get(orderItem.id);
    if (!inventoryItem) {
      throw new Error(`No se encontro el producto ${orderItem.name} en inventario.`);
    }
    if (inventoryItem.stock < orderItem.quantity) {
      throw new Error(`Stock insuficiente para ${orderItem.name}. Disponible: ${inventoryItem.stock}.`);
    }

    inventoryMap.set(orderItem.id, {
      ...inventoryItem,
      stock: inventoryItem.stock - orderItem.quantity,
      updatedAt: timestamp
    });
  }

  return [...inventoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
};

type InventoryCatalogDocument = {
  items: InventoryItem[];
  updatedAt?: string;
};

type PointOfSaleLedgerDocument = {
  sales: CounterSale[];
  lastSaleNumber: number;
  updatedAt?: string;
};

type CountersDocument = {
  deliveryOrderSequence?: number;
  lastSaleNumber?: number;
};

const inventoryDocRef = (businessId: string) =>
  doc(firebaseClient.db, "businesses", businessId, "settings", "inventoryCatalog");
const posLedgerRef = (businessId: string) => doc(firebaseClient.db, "businesses", businessId, "settings", "posLedger");
const countersRef = (businessId: string) => doc(firebaseClient.db, "businesses", businessId, "settings", "counters");

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
    limit(40)
  );

  return onSnapshot(ordersQuery, (snap) => onData(snap.docs.map((docItem) => docItem.data())));
};

export const subscribeCustomers = (businessId: string, onData: (customers: Customer[]) => void) =>
  onSnapshot(
    query(
      collection(firebaseClient.db, customersPath(businessId)).withConverter(identityConverter<Customer>()),
      orderBy("name", "asc"),
      limit(80)
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

export const subscribeInventory = (
  businessId: string,
  onData: (items: InventoryItem[]) => void
) =>
  onSnapshot(
    inventoryDocRef(businessId).withConverter(identityConverter<InventoryCatalogDocument>()),
    (snap) => onData(snap.exists() ? snap.data().items ?? [] : [])
  );

export const subscribeCounterSales = (
  businessId: string,
  onData: (sales: CounterSale[]) => void
) =>
  onSnapshot(
    posLedgerRef(businessId).withConverter(identityConverter<PointOfSaleLedgerDocument>()),
    (snap) => onData(snap.exists() ? (snap.data().sales ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [])
  );

export const saveInventoryItem = async (businessId: string, item: Omit<InventoryItem, "updatedAt">) => {
  await runTransaction(firebaseClient.db, async (transaction) => {
    const snap = await transaction.get(inventoryDocRef(businessId));
    const current = snap.exists() ? ((snap.data().items as InventoryItem[] | undefined) ?? []) : [];
    const updatedItem: InventoryItem = { ...item, updatedAt: nowIso() };
    const nextItems = [...current.filter((entry) => entry.id !== item.id), updatedItem].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    transaction.set(
      inventoryDocRef(businessId),
      {
        items: nextItems,
        updatedAt: nowIso()
      },
      { merge: true }
    );
  });
};

export const importInventoryItems = async (
  businessId: string,
  items: Array<Omit<InventoryItem, "updatedAt">>
) => {
  await runTransaction(firebaseClient.db, async (transaction) => {
    const snap = await transaction.get(inventoryDocRef(businessId));
    const current = snap.exists() ? ((snap.data().items as InventoryItem[] | undefined) ?? []) : [];
    const currentMap = new Map(current.map((item) => [item.sku, item]));
    const normalized = items.map((item) => ({
      ...item,
      updatedAt: nowIso()
    }));

    for (const item of normalized) {
      currentMap.set(item.sku, item);
    }

    transaction.set(
      inventoryDocRef(businessId),
      {
        items: [...currentMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
        updatedAt: nowIso()
      },
      { merge: true }
    );
  });
};

export const createCustomerRecord = async (
  businessId: string,
  input: Pick<Customer, "name" | "phone" | "address" | "isCreditEnabled">
) => {
  const customerRef = doc(firebaseClient.db, customersPath(businessId), customerIdFromPhone(input.phone));
  await runTransaction(firebaseClient.db, async (transaction) => {
    const snap = await transaction.get(customerRef);
    const current = snap.exists() ? snap.data() : null;

    transaction.set(
      customerRef,
      {
        businessId,
        name: input.name,
        phone: input.phone,
        address: input.address,
        isCreditEnabled: input.isCreditEnabled,
        totalOrders: current?.totalOrders ?? 0,
        totalSpent: current?.totalSpent ?? 0
      },
      { merge: true }
    );
  });
};

const normalizeOrderItems = (catalog: InventoryItem[], items: Array<{ inventoryId: string; quantity: number }>) =>
  items
    .map((entry) => {
      const product = catalog.find((item) => item.id === entry.inventoryId);
      if (!product || entry.quantity <= 0) return null;
      const subtotal = product.price * entry.quantity;
      const costSubtotal = product.costPrice * entry.quantity;

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        quantity: entry.quantity,
        unitPrice: product.price,
        subtotal,
        costPrice: product.costPrice,
        costSubtotal
      } satisfies OrderItem;
    })
    .filter(Boolean) as OrderItem[];

export const createDeliveryOrder = async (
  user: AppUser,
  input: {
    customerId?: string;
    customer?: Pick<Customer, "name" | "phone" | "address" | "isCreditEnabled">;
    assignedCourierId?: string;
    deliveryFee: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    items: Array<{ inventoryId: string; quantity: number }>;
  }
) => {
  await runTransaction(firebaseClient.db, async (transaction) => {
    const orderRef = doc(collection(firebaseClient.db, ordersPath(user.businessId)));
    const counterRef = countersRef(user.businessId);
    const inventoryRef = inventoryDocRef(user.businessId);
    const customerRef = input.customerId
      ? doc(firebaseClient.db, customersPath(user.businessId), input.customerId)
      : doc(
          firebaseClient.db,
          customersPath(user.businessId),
          customerIdFromPhone(input.customer?.phone ?? "")
        );
    const courierRef = input.assignedCourierId
      ? doc(firebaseClient.db, couriersPath(user.businessId), input.assignedCourierId)
      : null;

    const [customerSnap, counterSnap, inventorySnap, courierSnap] = await Promise.all([
      transaction.get(customerRef),
      transaction.get(counterRef),
      transaction.get(inventoryRef),
      courierRef ? transaction.get(courierRef) : Promise.resolve(null)
    ]);

    if (!customerSnap.exists() && !input.customer) throw new Error("Cliente no encontrado.");
    if (courierRef && (!courierSnap || !courierSnap.exists())) throw new Error("Repartidor no encontrado.");

    const customer = customerSnap.exists()
      ? (customerSnap.data() as Customer)
      : ({
          id: customerRef.id,
          businessId: user.businessId,
          name: input.customer?.name ?? "",
          phone: input.customer?.phone ?? "",
          address: input.customer?.address ?? "",
          isCreditEnabled: input.customer?.isCreditEnabled ?? false,
          totalOrders: 0,
          totalSpent: 0
        } satisfies Customer);
    const counters = (counterSnap.exists() ? (counterSnap.data() as CountersDocument) : {}) ?? {};
    const inventory = inventorySnap.exists()
      ? (((inventorySnap.data() as InventoryCatalogDocument).items ?? []) as InventoryItem[])
      : [];
    const courier = courierSnap?.exists() ? (courierSnap.data() as CourierProfile) : null;

    const items = normalizeOrderItems(inventory, input.items);
    if (!items.length) throw new Error("Selecciona productos validos para el pedido.");

    const nextInventory = applyInventoryDiscount(inventory, items);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const total = subtotal + input.deliveryFee;
    const timestamp = nowIso();
    const nextNumber = (counters.deliveryOrderSequence ?? 1023) + 1;

    transaction.set(orderRef, {
      businessId: user.businessId,
      orderNumber: nextNumber,
      customerId: input.customerId,
      customerName: customer.name,
      customerPhone: customer.phone,
      address: customer.address,
      items,
      subtotal,
      deliveryFee: input.deliveryFee,
      total,
      paymentMethod: input.paymentMethod,
      status: courier ? "assigned" : "pending",
      assignedCourierId: courier?.id,
      assignedCourierName: courier?.displayName,
      createdBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      notes: input.notes ?? ""
    });

    transaction.set(
      customerRef,
      {
        totalOrders: (customer.totalOrders ?? 0) + 1,
        totalSpent: (customer.totalSpent ?? 0) + total
      },
      { merge: true }
    );

    transaction.set(
      counterRef,
      {
        deliveryOrderSequence: nextNumber,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    if (courierRef && courier) {
      transaction.set(
        courierRef,
        {
          activeOrderIds: [...new Set([...(courier.activeOrderIds ?? []), orderRef.id])],
          status: "delivering",
          lastSeenAt: timestamp
        },
        { merge: true }
      );
    }

    transaction.set(
      inventoryRef,
      {
        items: nextInventory,
        updatedAt: timestamp
      },
      { merge: true }
    );
  });
};

export const registerCounterSale = async (
  user: AppUser,
  input: {
    customerName?: string;
    paymentMethod: PaymentMethod;
    items: Array<{ inventoryId: string; quantity: number }>;
  }
) => {
  await runTransaction(firebaseClient.db, async (transaction) => {
    const [inventorySnap, ledgerSnap, counterSnap] = await Promise.all([
      transaction.get(inventoryDocRef(user.businessId)),
      transaction.get(posLedgerRef(user.businessId)),
      transaction.get(countersRef(user.businessId))
    ]);

    const inventory = inventorySnap.exists()
      ? (((inventorySnap.data() as InventoryCatalogDocument).items ?? []) as InventoryItem[])
      : [];
    const ledger = ledgerSnap.exists() ? ((ledgerSnap.data() as PointOfSaleLedgerDocument).sales ?? []) : [];
    const counters = (counterSnap.exists() ? (counterSnap.data() as CountersDocument) : {}) ?? {};
    const items = normalizeOrderItems(inventory, input.items);
    if (!items.length) throw new Error("Selecciona productos para la venta.");

    const nextInventory = applyInventoryDiscount(inventory, items);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const saleNumber = (counters.lastSaleNumber ?? 0) + 1;
    const timestamp = nowIso();
    const sale: CounterSale = {
      id: crypto.randomUUID(),
      businessId: user.businessId,
      saleNumber,
      customerName: input.customerName?.trim() || undefined,
      items,
      subtotal,
      total: subtotal,
      paymentMethod: input.paymentMethod,
      createdBy: user.id,
      createdAt: timestamp
    };

    transaction.set(
      posLedgerRef(user.businessId),
      {
        sales: [withoutUndefined(sale), ...ledger].slice(0, 400),
        lastSaleNumber: saleNumber,
        updatedAt: timestamp
      },
      { merge: true }
    );

    transaction.set(
      countersRef(user.businessId),
      {
        lastSaleNumber: saleNumber,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    transaction.set(
      inventoryDocRef(user.businessId),
      {
        items: nextInventory,
        updatedAt: timestamp
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

export const subscribeDaySummary = (
  businessId: string,
  onData: (summary: DaySummary & { profitTotal: number; counterSalesTotal: number }) => void
) => {
  let deliveryOrders: DeliveryOrder[] = [];
  let counterSales: CounterSale[] = [];

  const emit = () => {
    const summary = {
      salesTotal: 0,
      cashTotal: 0,
      cardTotal: 0,
      deliveryTotal: 0,
      openOrders: 0,
      profitTotal: 0,
      counterSalesTotal: 0
    };

    for (const order of deliveryOrders) {
      if (order.status !== "cancelled") {
        summary.salesTotal += order.total;
        summary.deliveryTotal += order.deliveryFee;
        summary.profitTotal += order.items.reduce((sum, item) => sum + ((item.subtotal ?? 0) - (item.costSubtotal ?? 0)), 0);
        if (order.paymentMethod === "cash") summary.cashTotal += order.total;
        if (order.paymentMethod === "card") summary.cardTotal += order.total;
      }
      if (!["delivered", "cancelled"].includes(order.status)) summary.openOrders += 1;
    }

    for (const sale of counterSales) {
      summary.salesTotal += sale.total;
      summary.counterSalesTotal += sale.total;
      summary.profitTotal += sale.items.reduce((sum, item) => sum + ((item.subtotal ?? 0) - (item.costSubtotal ?? 0)), 0);
      if (sale.paymentMethod === "cash") summary.cashTotal += sale.total;
      if (sale.paymentMethod === "card") summary.cardTotal += sale.total;
    }

    onData(summary);
  };

  const unsubscribeOrders = onSnapshot(
    query(
      collection(firebaseClient.db, ordersPath(businessId)).withConverter(identityConverter<DeliveryOrder>()),
      where("createdAt", ">=", monthStartIso())
    ),
    (snap) => {
      deliveryOrders = snap.docs.map((docItem) => docItem.data());
      emit();
    }
  );

  const unsubscribeSales = onSnapshot(
    posLedgerRef(businessId).withConverter(identityConverter<PointOfSaleLedgerDocument>()),
    (snap) => {
      const allSales = snap.exists() ? (snap.data().sales ?? []) : [];
      counterSales = allSales.filter((sale) => sale.createdAt >= monthStartIso());
      emit();
    }
  );

  return () => {
    unsubscribeOrders();
    unsubscribeSales();
  };
};

export const createTrackingLink = async (businessId: string, orderId: string) => {
  const callable = httpsCallable<
    { businessId: string; orderId: string },
    { token: string }
  >(firebaseClient.functions, "createTrackingSession");

  const result = await callable({ businessId, orderId });
  return result.data.token;
};

export const createCourierAccount = async (
  businessId: string,
  input: {
    displayName: string;
    email: string;
    phone: string;
    password: string;
  }
) => {
  const secondaryApp = initializeApp(firebaseClient.app.options, `courier-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, input.email, input.password);
    await updateProfile(credential.user, { displayName: input.displayName });
    const uid = credential.user.uid;

    await runTransaction(firebaseClient.db, async (transaction) => {
      transaction.set(doc(firebaseClient.db, couriersPath(businessId), uid), {
        businessId,
        userId: uid,
        displayName: input.displayName,
        phone: input.phone,
        activeOrderIds: [],
        deliveredTotal: 0,
        status: "available",
        lastSeenAt: nowIso()
      });
    });

    await runTransaction(secondaryDb, async (transaction) => {
      transaction.set(doc(secondaryDb, "users", uid), {
        active: true,
        businessId,
        displayName: input.displayName,
        email: input.email,
        phone: input.phone,
        role: "courier"
      });
    });

    await signOutAuth(secondaryAuth);
    await deleteApp(secondaryApp);
    return uid;
  } catch (error) {
    await deleteApp(secondaryApp);
    throw error;
  }
};
