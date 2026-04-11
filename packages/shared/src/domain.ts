export type UserRole = "superadmin" | "admin" | "cashier" | "courier";
export type SubscriptionStatus = "active" | "overdue" | "suspended" | "cancelled";
export type BusinessType = "liquor_store" | "sushi" | "burger" | "pizza";
export type BrandAssetKey = "botix" | "sushix" | "burgerix" | "pizzix";
export type ModuleKey =
  | "counter"
  | "orders"
  | "inventory"
  | "customers"
  | "couriers"
  | "reports"
  | "expenses"
  | "delivery"
  | "kitchen";

export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "assigned"
  | "en_route"
  | "delivered"
  | "cancelled"
  | "incident";

export interface BusinessTheme {
  primary: string;
  secondary: string;
  accent: string;
  surfaceTint: string;
}

export interface BusinessLabels {
  appName: string;
  tagline: string;
  counter: string;
  orders: string;
  inventory: string;
  customers: string;
  couriers: string;
  reports: string;
  expenses: string;
  counterSale: string;
  deliveryOrders: string;
  products: string;
  tracking: string;
  kitchen: string;
}

export interface BusinessOrderStatusConfig {
  key: OrderStatus;
  label: string;
  color: string;
}

export type PaymentMethod = "cash" | "card" | "transfer" | "mixed";

export interface AppUser {
  id: string;
  businessId: string;
  displayName: string;
  email: string;
  role: UserRole;
  phone?: string;
  active: boolean;
  notificationTokens?: string[];
}

export interface BusinessProfile {
  id: string;
  businessId: string;
  businessName: string;
  businessType?: BusinessType;
  brandName?: string;
  logoAsset?: BrandAssetKey;
  logoUrl?: string;
  theme?: Partial<BusinessTheme>;
  labels?: Partial<BusinessLabels>;
  enabledModules?: ModuleKey[];
  orderStatuses?: BusinessOrderStatusConfig[];
  subscriptionStatus: SubscriptionStatus;
  accessEnabled: boolean;
  plan?: string;
  monthlyPrice?: number;
  subscriptionStartedAt?: string;
  currentPeriodEnd?: string;
  graceUntil?: string;
  billingContactEmail?: string;
  billingNote?: string;
  supportPhone?: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  address: string;
  addressReference?: string;
  totalOrders: number;
  totalSpent: number;
  isCreditEnabled: boolean;
}

export interface CourierProfile {
  id: string;
  businessId: string;
  userId: string;
  displayName: string;
  phone: string;
  activeOrderIds: string[];
  deliveredTotal: number;
  status: "available" | "delivering" | "offline";
  lastSeenAt?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  costPrice?: number;
  costSubtotal?: number;
}

export interface DeliveryOrder {
  id: string;
  businessId: string;
  orderNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  addressReference?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  assignedCourierId?: string;
  assignedCourierName?: string;
  notes?: string;
  trackingToken?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveTracking {
  orderId: string;
  businessId: string;
  courierId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  active: boolean;
  updatedAt: string;
}

export interface TrackingSession {
  id: string;
  businessId: string;
  orderId: string;
  customerName: string;
  status: OrderStatus;
  courierName?: string;
  lat?: number;
  lng?: number;
  updatedAt: string;
  active: boolean;
}

export interface DaySummary {
  salesTotal: number;
  cashTotal: number;
  cardTotal: number;
  deliveryTotal: number;
  openOrders: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  costPrice: number;
  stock: number;
  active: boolean;
  updatedAt: string;
}

export interface CounterSale {
  id: string;
  businessId: string;
  saleNumber: number;
  customerName?: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdBy: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface ExpenseRecord {
  id: string;
  businessId: string;
  category: string;
  description: string;
  amount: number;
  createdBy: string;
  createdAt: string;
}

export interface OrderDraftInput {
  customerName: string;
  customerPhone: string;
  address: string;
  paymentMethod: PaymentMethod;
  deliveryFee: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  notes?: string;
}
