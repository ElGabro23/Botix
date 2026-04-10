import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
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
import type {
  AppUser,
  BusinessProfile,
  CounterSale,
  CourierProfile,
  Customer,
  DaySummary,
  DeliveryOrder,
  ExpenseRecord,
  InventoryItem,
  LiveTracking,
  OrderItem,
  OrderStatus,
  PaymentMethod
} from "@botix/shared";
import { resolveBusinessProfile } from "@botix/shared";
import { couriersPath, customersPath, liveTrackingPath, ordersPath } from "@botix/firebase-core";
import { firebaseClient } from "./firebase";

const identityConverter = <T,>(): FirestoreDataConverter<T> => ({
  toFirestore: (value) => value as never,
  fromFirestore: (snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T
});

const nowIso = () => new Date().toISOString();
const addMonthsIso = (baseIso: string, months: number) => {
  const date = new Date(baseIso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
};
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

type ExpenseLedgerDocument = {
  expenses: ExpenseRecord[];
  updatedAt?: string;
};

type CountersDocument = {
  deliveryOrderSequence?: number;
  lastSaleNumber?: number;
};

const inventoryDocRef = (businessId: string) =>
  doc(firebaseClient.db, "businesses", businessId, "settings", "inventoryCatalog");
const posLedgerRef = (businessId: string) => doc(firebaseClient.db, "businesses", businessId, "settings", "posLedger");
const expenseLedgerRef = (businessId: string) =>
  doc(firebaseClient.db, "businesses", businessId, "settings", "expenseLedger");
const countersRef = (businessId: string) => doc(firebaseClient.db, "businesses", businessId, "settings", "counters");
const trackingSessionRef = (token: string) => doc(firebaseClient.db, "trackingSessions", token);
const businessRef = (businessId: string) => doc(firebaseClient.db, "businesses", businessId);

const normalizeBusinessProfile = (businessId: string, value?: Partial<BusinessProfile> | null): BusinessProfile =>
  resolveBusinessProfile({
    id: businessId,
    businessId,
    ...value
  });

export const subscribeUserProfile = (
  userId: string,
  onData: (user: AppUser | null) => void
) =>
  onSnapshot(doc(firebaseClient.db, "users", userId).withConverter(identityConverter<AppUser>()), (snap) =>
    onData(snap.exists() ? snap.data() : null)
  );

export const subscribeBusinessProfile = (businessId: string, onData: (business: BusinessProfile | null) => void) =>
  onSnapshot(businessRef(businessId).withConverter(identityConverter<BusinessProfile>()), (snap) =>
    onData(snap.exists() ? normalizeBusinessProfile(snap.id, snap.data()) : null)
  );

export const subscribeBusinesses = (onData: (businesses: BusinessProfile[]) => void) =>
  onSnapshot(
    query(collection(firebaseClient.db, "businesses").withConverter(identityConverter<BusinessProfile>()), orderBy("businessName", "asc")),
    (snap) => onData(snap.docs.map((docItem) => normalizeBusinessProfile(docItem.id, docItem.data())))
  );

export const updateBusinessSubscription = async (
  businessId: string,
  patch: Partial<Pick<BusinessProfile, "subscriptionStatus" | "accessEnabled" | "plan" | "monthlyPrice" | "currentPeriodEnd" | "graceUntil" | "billingContactEmail" | "billingNote">>
) => {
  await updateDoc(businessRef(businessId), {
    ...withoutUndefined(patch as Record<string, unknown>),
    updatedAt: nowIso()
  });
};

export const saveBusinessProfile = async (
  input: Pick<BusinessProfile, "businessId" | "businessName"> &
    Partial<
      Pick<
        BusinessProfile,
        | "businessType"
        | "brandName"
        | "logoAsset"
        | "logoUrl"
        | "theme"
        | "labels"
        | "enabledModules"
        | "orderStatuses"
        | "subscriptionStatus"
        | "accessEnabled"
        | "plan"
        | "monthlyPrice"
        | "subscriptionStartedAt"
        | "billingContactEmail"
        | "billingNote"
      >
    >
) => {
  const resolved = resolveBusinessProfile(input);
  await updateDoc(businessRef(input.businessId), {
    ...withoutUndefined(resolved as Record<string, unknown>),
    updatedAt: nowIso()
  }).catch(async () => {
    await runTransaction(firebaseClient.db, async (transaction) => {
      transaction.set(businessRef(input.businessId), {
        ...withoutUndefined(resolved as Record<string, unknown>),
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    });
  });
};

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

export const subscribeExpenses = (
  businessId: string,
  onData: (expenses: ExpenseRecord[]) => void
) =>
  onSnapshot(
    expenseLedgerRef(businessId).withConverter(identityConverter<ExpenseLedgerDocument>()),
    (snap) =>
      onData(snap.exists() ? (snap.data().expenses ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [])
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
    const businessDocRef = businessRef(user.businessId);
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

    const [businessSnap, customerSnap, counterSnap, inventorySnap, courierSnap] = await Promise.all([
      transaction.get(businessDocRef),
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
    const business = resolveBusinessProfile(
      businessSnap.exists() ? ({ id: businessSnap.id, ...businessSnap.data() } as Partial<BusinessProfile>) : { businessId: user.businessId }
    );
    const inventory = inventorySnap.exists()
      ? (((inventorySnap.data() as InventoryCatalogDocument).items ?? []) as InventoryItem[])
      : [];
    const courier = courierSnap?.exists()
      ? ({ id: courierSnap.id, ...courierSnap.data() } as CourierProfile)
      : null;

    const items = normalizeOrderItems(inventory, input.items);
    if (!items.length) throw new Error("Selecciona productos validos para el pedido.");

    const nextInventory = applyInventoryDiscount(inventory, items);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const total = subtotal + input.deliveryFee;
    const timestamp = nowIso();
    const nextNumber = (counters.deliveryOrderSequence ?? 1023) + 1;
    const initialStatus =
      business.businessType === "liquor_store" ? (courier ? "assigned" : "pending") : "pending";

    transaction.set(
      orderRef,
      withoutUndefined({
        businessId: user.businessId,
        orderNumber: nextNumber,
        customerId: customer.id ?? customerRef.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        address: customer.address,
        items,
        subtotal,
        deliveryFee: input.deliveryFee,
        total,
        paymentMethod: input.paymentMethod,
        status: initialStatus,
        assignedCourierId: courier?.id,
        assignedCourierName: courier?.displayName,
        createdBy: user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        notes: input.notes ?? ""
      })
    );

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

export const saveExpenseRecord = async (
  user: AppUser,
  input: Pick<ExpenseRecord, "category" | "description" | "amount">
) => {
  await runTransaction(firebaseClient.db, async (transaction) => {
    const ledgerSnap = await transaction.get(expenseLedgerRef(user.businessId));
    const expenses = ledgerSnap.exists()
      ? ((ledgerSnap.data() as ExpenseLedgerDocument).expenses ?? [])
      : [];
    const expense: ExpenseRecord = {
      id: crypto.randomUUID(),
      businessId: user.businessId,
      category: input.category,
      description: input.description,
      amount: input.amount,
      createdBy: user.id,
      createdAt: nowIso()
    };

    transaction.set(
      expenseLedgerRef(user.businessId),
      {
        expenses: [expense, ...expenses].slice(0, 600),
        updatedAt: nowIso()
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
  const [businessSnapshot, orderSnapshot] = await Promise.all([
    getDoc(businessRef(businessId)),
    getDoc(doc(firebaseClient.db, ordersPath(businessId), orderId))
  ]);
  const business = resolveBusinessProfile(
    businessSnapshot.exists() ? ({ id: businessSnapshot.id, ...businessSnapshot.data() } as Partial<BusinessProfile>) : { businessId }
  );
  const currentOrder = orderSnapshot.exists() ? (orderSnapshot.data() as DeliveryOrder) : null;
  const nextStatus =
    business.businessType === "liquor_store"
      ? "assigned"
      : currentOrder?.status === "pending"
        ? "preparing"
        : currentOrder?.status ?? "pending";

  await Promise.all([
    updateDoc(doc(firebaseClient.db, ordersPath(businessId), orderId), {
      assignedCourierId: courier.id,
      assignedCourierName: courier.displayName,
      status: nextStatus,
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
  onData: (summary: DaySummary & { profitTotal: number; counterSalesTotal: number; expenseTotal: number; netProfitTotal: number }) => void
) => {
  let deliveryOrders: DeliveryOrder[] = [];
  let counterSales: CounterSale[] = [];
  let expenses: ExpenseRecord[] = [];

  const emit = () => {
    const summary = {
      salesTotal: 0,
      cashTotal: 0,
      cardTotal: 0,
      deliveryTotal: 0,
      openOrders: 0,
      profitTotal: 0,
      counterSalesTotal: 0,
      expenseTotal: 0,
      netProfitTotal: 0
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

    for (const expense of expenses) {
      summary.expenseTotal += expense.amount;
    }

    summary.netProfitTotal = summary.profitTotal - summary.expenseTotal;

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

  const unsubscribeExpenses = onSnapshot(
    expenseLedgerRef(businessId).withConverter(identityConverter<ExpenseLedgerDocument>()),
    (snap) => {
      const allExpenses = snap.exists() ? (snap.data().expenses ?? []) : [];
      expenses = allExpenses.filter((expense) => expense.createdAt >= monthStartIso());
      emit();
    }
  );

  return () => {
    unsubscribeOrders();
    unsubscribeSales();
    unsubscribeExpenses();
  };
};

export const createTrackingLink = async (businessId: string, orderId: string) => {
  return runTransaction(firebaseClient.db, async (transaction) => {
    const orderRef = doc(firebaseClient.db, ordersPath(businessId), orderId);
    const liveRef = doc(firebaseClient.db, liveTrackingPath(businessId), orderId);
    const orderSnap = await transaction.get(orderRef);
    const liveSnap = await transaction.get(liveRef);
    if (!orderSnap.exists()) throw new Error("Pedido no encontrado.");

    const order = orderSnap.data() as DeliveryOrder;
    const liveTracking = liveSnap.exists() ? (liveSnap.data() as LiveTracking) : null;
    const token = order.trackingToken ?? crypto.randomUUID().replace(/-/g, "");
    const timestamp = nowIso();

    transaction.set(
      trackingSessionRef(token),
      withoutUndefined({
        businessId,
        orderId,
        customerName: order.customerName,
        status: order.status,
        courierName: order.assignedCourierName ?? null,
        lat: liveTracking?.lat,
        lng: liveTracking?.lng,
        active: liveTracking?.active ?? !["delivered", "cancelled"].includes(order.status),
        updatedAt: timestamp
      }),
      { merge: true }
    );

    transaction.set(
      orderRef,
      {
        trackingToken: token,
        updatedAt: timestamp
      },
      { merge: true }
    );

    return token;
  });
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

export const createBusinessAccount = async (
  input: {
    businessName: string;
    businessType: BusinessProfile["businessType"];
    adminEmail: string;
    adminPassword: string;
    subscriptionStartedAt: string;
  }
) => {
  const businessId = input.businessName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!businessId) {
    throw new Error("No fue posible generar un ID valido para el negocio.");
  }

  const secondaryApp = initializeApp(firebaseClient.app.options, `business-admin-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);
  const preset = resolveBusinessProfile({
    businessId,
    businessName: input.businessName,
    businessType: input.businessType
  });

  try {
    const existingBusiness = await getDoc(businessRef(businessId));
    if (existingBusiness.exists()) {
      throw new Error("Ya existe un negocio con ese nombre o identificador.");
    }

    const credential = await createUserWithEmailAndPassword(secondaryAuth, input.adminEmail, input.adminPassword);
    await updateProfile(credential.user, { displayName: input.businessName });
    const uid = credential.user.uid;

    await runTransaction(firebaseClient.db, async (transaction) => {
      const currentPeriodEnd = addMonthsIso(input.subscriptionStartedAt, 1);
      transaction.set(businessRef(businessId), {
        ...withoutUndefined(preset as Record<string, unknown>),
        subscriptionStartedAt: input.subscriptionStartedAt,
        currentPeriodEnd,
        subscriptionStatus: "active",
        accessEnabled: true,
        plan: "standard",
        monthlyPrice: 29990,
        billingContactEmail: input.adminEmail,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    });

    await runTransaction(secondaryDb, async (transaction) => {
      transaction.set(doc(secondaryDb, "users", uid), {
        active: true,
        businessId,
        displayName: input.businessName,
        email: input.adminEmail,
        role: "admin"
      });
    });

    await signOutAuth(secondaryAuth);
    await deleteApp(secondaryApp);
    return { uid, businessId };
  } catch (error) {
    await deleteApp(secondaryApp);
    throw error;
  }
};
