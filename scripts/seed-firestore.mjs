import fs from "node:fs";
import crypto from "node:crypto";

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!keyPath || !fs.existsSync(keyPath)) {
  throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS con la ruta al JSON de service account.");
}

const svc = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const projectId = svc.project_id;
const dbBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const businessId = process.env.BOTIX_BUSINESS_ID ?? "botilleria-el-brindis";
const trackingBaseUrl = process.env.BOTIX_TRACKING_BASE_URL ?? "http://localhost:5174";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: svc.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: svc.token_uri,
      iat: now,
      exp: now + 3600
    })
  )}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(svc.private_key, "base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const response = await fetch(svc.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    })
  });

  if (!response.ok) throw new Error(`Token error ${response.status}: ${await response.text()}`);
  return (await response.json()).access_token;
}

function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "object") {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) fields[key] = toValue(nested);
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported Firestore value: ${value}`);
}

async function patchDocument(token, path, data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) fields[key] = toValue(value);

  const response = await fetch(`${dbBase}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });

  if (!response.ok) throw new Error(`Patch error ${path} ${response.status}: ${await response.text()}`);
}

const docs = (timestamp) => [
  [
    "users/k1Arkf7n6CNEgL0w7OqWy6oVfL62",
    { active: true, businessId, displayName: "Pedro", email: "admin@botix.cl", role: "admin" }
  ],
  [
    "users/2Q7T4IHQe4fYIvnThhRkGtteFh43",
    { active: true, businessId, displayName: "Caja Meson", email: "caja@botix.cl", role: "cashier" }
  ],
  [
    "users/hg8fuYyVJhaMEXMDfNtVUa6qPyF3",
    { active: true, businessId, displayName: "Luis", email: "driver@botix.cl", role: "courier" }
  ],
  [
    `businesses/${businessId}`,
    { businessId, businessName: "Botilleria El Brindis" }
  ],
  [
    `businesses/${businessId}/settings/general`,
    {
      businessId,
      businessName: "Botilleria El Brindis",
      primaryColor: "#4d8dff",
      supportPhone: "+56911111111",
      trackingBaseUrl
    }
  ],
  [
    `businesses/${businessId}/settings/counters`,
    { deliveryOrderSequence: 1024 }
  ],
  [
    `businesses/${businessId}/couriers/hg8fuYyVJhaMEXMDfNtVUa6qPyF3`,
    {
      activeOrderIds: [],
      businessId,
      deliveredTotal: 0,
      displayName: "Luis",
      lastSeenAt: timestamp,
      phone: "+56922222222",
      status: "available",
      userId: "hg8fuYyVJhaMEXMDfNtVUa6qPyF3"
    }
  ],
  [
    `businesses/${businessId}/customers/customer-maria`,
    {
      address: "Calle Los Alamos 123",
      businessId,
      isCreditEnabled: false,
      name: "Maria Soto",
      phone: "+56944444444",
      totalOrders: 1,
      totalSpent: 12000
    }
  ],
  [
    `businesses/${businessId}/deliveryOrders/order-1024`,
    {
      address: "Calle Los Alamos 123",
      assignedCourierId: "hg8fuYyVJhaMEXMDfNtVUa6qPyF3",
      assignedCourierName: "Luis",
      businessId,
      createdAt: timestamp,
      createdBy: "k1Arkf7n6CNEgL0w7OqWy6oVfL62",
      customerId: "customer-maria",
      customerName: "Maria Soto",
      customerPhone: "+56944444444",
      deliveryFee: 0,
      orderNumber: 1024,
      paymentMethod: "cash",
      status: "assigned",
      subtotal: 12000,
      total: 12000,
      updatedAt: timestamp,
      items: [
        { id: "item-1", name: "Escudo", quantity: 2, unitPrice: 4500, subtotal: 9000 },
        { id: "item-2", name: "Coca-Cola", quantity: 1, unitPrice: 2000, subtotal: 2000 },
        { id: "item-3", name: "Hielo", quantity: 1, unitPrice: 1000, subtotal: 1000 }
      ]
    }
  ]
];

const token = await getAccessToken();
const timestamp = new Date().toISOString();

for (const [path, data] of docs(timestamp)) {
  await patchDocument(token, path, data);
  console.log(`OK ${path}`);
}

console.log(`Seed Firestore completado para ${projectId}`);
