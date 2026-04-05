import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

initializeApp(
  serviceAccountPath && fs.existsSync(serviceAccountPath)
    ? { credential: cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))) }
    : { credential: applicationDefault() }
);

const auth = getAuth();
const db = getFirestore();

const businessId = process.env.BOTIX_BUSINESS_ID ?? "botilleria-el-brindis";

const users = [
  {
    uid: "admin-botix",
    email: "admin@botix.cl",
    password: "Botix123!",
    displayName: "Pedro",
    role: "admin"
  },
  {
    uid: "cashier-botix",
    email: "caja@botix.cl",
    password: "Botix123!",
    displayName: "Caja Meson",
    role: "cashier"
  },
  {
    uid: "driver-botix",
    email: "driver@botix.cl",
    password: "Botix123!",
    displayName: "Luis",
    role: "courier"
  }
];

for (const user of users) {
  try {
    await auth.getUser(user.uid);
  } catch {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: user.password,
      displayName: user.displayName
    });
  }

  await db.doc(`users/${user.uid}`).set(
    {
      businessId,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      active: true,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

await db.doc(`businesses/${businessId}`).set(
  {
    businessName: "Botilleria El Brindis",
    businessId,
    updatedAt: new Date().toISOString()
  },
  { merge: true }
);

await db.doc(`businesses/${businessId}/settings/general`).set(
  {
    businessId,
    businessName: "Botilleria El Brindis",
    primaryColor: "#4d8dff",
    trackingBaseUrl: process.env.BOTIX_TRACKING_BASE_URL ?? "http://localhost:5174",
    supportPhone: "+56911111111"
  },
  { merge: true }
);

await db.doc(`businesses/${businessId}/settings/counters`).set(
  {
    deliveryOrderSequence: 1024,
    updatedAt: new Date().toISOString()
  },
  { merge: true }
);

await db.doc(`businesses/${businessId}/couriers/driver-botix`).set(
  {
    businessId,
    userId: "driver-botix",
    displayName: "Luis",
    phone: "+56922222222",
    activeOrderIds: [],
    deliveredTotal: 0,
    status: "available",
    lastSeenAt: new Date().toISOString()
  },
  { merge: true }
);

const customers = [
  {
    id: "customer-juan",
    name: "Juan Perez",
    phone: "+56933333333",
    address: "Villa X 123",
    totalOrders: 3,
    totalSpent: 15000,
    isCreditEnabled: true
  },
  {
    id: "customer-maria",
    name: "Maria Soto",
    phone: "+56944444444",
    address: "Calle Los Alamos 123",
    totalOrders: 8,
    totalSpent: 32500,
    isCreditEnabled: false
  }
];

for (const customer of customers) {
  await db.doc(`businesses/${businessId}/customers/${customer.id}`).set(
    {
      businessId,
      ...customer
    },
    { merge: true }
  );
}

await db.doc(`businesses/${businessId}/deliveryOrders/order-1024`).set(
  {
    businessId,
    orderNumber: 1024,
    customerId: "customer-maria",
    customerName: "Maria Soto",
    customerPhone: "+56944444444",
    address: "Calle Los Alamos 123",
    items: [
      { id: "item-1", name: "Escudo", quantity: 2, unitPrice: 4500, subtotal: 9000 },
      { id: "item-2", name: "Coca-Cola", quantity: 1, unitPrice: 2000, subtotal: 2000 },
      { id: "item-3", name: "Hielo", quantity: 1, unitPrice: 1000, subtotal: 1000 }
    ],
    subtotal: 12000,
    deliveryFee: 0,
    total: 12000,
    paymentMethod: "cash",
    status: "assigned",
    assignedCourierId: "driver-botix",
    assignedCourierName: "Luis",
    createdBy: "admin-botix",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  { merge: true }
);

console.log(`BOTIX seed listo para ${businessId}`);
