import type {
  BrandAssetKey,
  BusinessLabels,
  BusinessOrderStatusConfig,
  BusinessProfile,
  BusinessTheme,
  BusinessType,
  ModuleKey,
  OrderStatus
} from "./domain";

export type BusinessPreset = {
  businessType: BusinessType;
  brandName: string;
  logoAsset: BrandAssetKey;
  theme: BusinessTheme;
  labels: BusinessLabels;
  enabledModules: ModuleKey[];
  orderStatuses: BusinessOrderStatusConfig[];
};

const presets: Record<BusinessType, BusinessPreset> = {
  liquor_store: {
    businessType: "liquor_store",
    brandName: "BOTIX",
    logoAsset: "botix",
    theme: {
      primary: "#4d8dff",
      secondary: "#6d7dff",
      accent: "#56b173",
      surfaceTint: "#eff4ff"
    },
    labels: {
      appName: "BOTIX",
      tagline: "Sistema para botillerias",
      counter: "Caja Meson",
      orders: "Pedidos Delivery",
      inventory: "Inventario",
      customers: "Clientes",
      couriers: "Repartidores",
      reports: "Reportes",
      expenses: "Gastos",
      counterSale: "Venta Meson",
      deliveryOrders: "Pedidos Delivery",
      products: "Productos",
      tracking: "Seguimiento",
      kitchen: "Preparacion"
    },
    enabledModules: ["counter", "orders", "inventory", "customers", "couriers", "reports", "expenses", "delivery"],
    orderStatuses: [
      { key: "pending", label: "Pendiente", color: "#f6c453" },
      { key: "assigned", label: "Asignado", color: "#8166ff" },
      { key: "en_route", label: "En camino", color: "#3f9bff" },
      { key: "delivered", label: "Entregado", color: "#54b07a" },
      { key: "cancelled", label: "Cancelado", color: "#ef6b6b" },
      { key: "incident", label: "Incidencia", color: "#ff9361" }
    ]
  },
  sushi: {
    businessType: "sushi",
    brandName: "SUSHIX",
    logoAsset: "sushix",
    theme: {
      primary: "#d14e48",
      secondary: "#ff7b61",
      accent: "#2a7f62",
      surfaceTint: "#fff3f0"
    },
    labels: {
      appName: "SUSHIX",
      tagline: "Plataforma para sushi delivery",
      counter: "Caja",
      orders: "Pedidos",
      inventory: "Menu",
      customers: "Clientes",
      couriers: "Repartidores",
      reports: "Reportes",
      expenses: "Gastos",
      counterSale: "Venta Mostrador",
      deliveryOrders: "Pedidos",
      products: "Menu",
      tracking: "Seguimiento",
      kitchen: "Cocina"
    },
    enabledModules: ["counter", "orders", "inventory", "customers", "couriers", "reports", "expenses", "delivery", "kitchen"],
    orderStatuses: [
      { key: "pending", label: "Pendiente", color: "#f6c453" },
      { key: "preparing", label: "Preparando", color: "#4d8dff" },
      { key: "ready", label: "Listo", color: "#8f7cff" },
      { key: "en_route", label: "En reparto", color: "#3f9bff" },
      { key: "delivered", label: "Entregado", color: "#54b07a" },
      { key: "cancelled", label: "Cancelado", color: "#ef6b6b" }
    ]
  },
  burger: {
    businessType: "burger",
    brandName: "BURGERIX",
    logoAsset: "burgerix",
    theme: {
      primary: "#d78133",
      secondary: "#f2b14c",
      accent: "#6e4b2e",
      surfaceTint: "#fff7ec"
    },
    labels: {
      appName: "BURGERIX",
      tagline: "Plataforma para hamburgueserias",
      counter: "Caja",
      orders: "Pedidos",
      inventory: "Menu",
      customers: "Clientes",
      couriers: "Repartidores",
      reports: "Reportes",
      expenses: "Gastos",
      counterSale: "Venta Mostrador",
      deliveryOrders: "Pedidos",
      products: "Menu",
      tracking: "Seguimiento",
      kitchen: "Cocina"
    },
    enabledModules: ["counter", "orders", "inventory", "customers", "couriers", "reports", "expenses", "delivery", "kitchen"],
    orderStatuses: [
      { key: "pending", label: "Pendiente", color: "#f6c453" },
      { key: "preparing", label: "Preparando", color: "#4d8dff" },
      { key: "ready", label: "Listo", color: "#8f7cff" },
      { key: "en_route", label: "En reparto", color: "#3f9bff" },
      { key: "delivered", label: "Entregado", color: "#54b07a" },
      { key: "cancelled", label: "Cancelado", color: "#ef6b6b" }
    ]
  },
  pizza: {
    businessType: "pizza",
    brandName: "PIZZIX",
    logoAsset: "pizzix",
    theme: {
      primary: "#d6483d",
      secondary: "#ff8a4e",
      accent: "#2b7d5e",
      surfaceTint: "#fff4ef"
    },
    labels: {
      appName: "PIZZIX",
      tagline: "Plataforma para pizzerias",
      counter: "Caja",
      orders: "Pedidos",
      inventory: "Menu",
      customers: "Clientes",
      couriers: "Repartidores",
      reports: "Reportes",
      expenses: "Gastos",
      counterSale: "Venta Mostrador",
      deliveryOrders: "Pedidos",
      products: "Menu",
      tracking: "Seguimiento",
      kitchen: "Cocina"
    },
    enabledModules: ["counter", "orders", "inventory", "customers", "couriers", "reports", "expenses", "delivery", "kitchen"],
    orderStatuses: [
      { key: "pending", label: "Pendiente", color: "#f6c453" },
      { key: "preparing", label: "Preparando", color: "#4d8dff" },
      { key: "ready", label: "Listo", color: "#8f7cff" },
      { key: "en_route", label: "En reparto", color: "#3f9bff" },
      { key: "delivered", label: "Entregado", color: "#54b07a" },
      { key: "cancelled", label: "Cancelado", color: "#ef6b6b" }
    ]
  }
};

export const getBusinessPreset = (businessType?: BusinessType) =>
  presets[businessType ?? "liquor_store"] ?? presets.liquor_store;

export const getBrandAssetPath = (asset: BrandAssetKey) => `brand/${asset}.jpg`;

export const resolveBusinessProfile = (business?: Partial<BusinessProfile> | null): BusinessPreset & BusinessProfile => {
  const preset = getBusinessPreset(business?.businessType);
  return {
    id: business?.id ?? business?.businessId ?? "default-business",
    businessId: business?.businessId ?? "default-business",
    businessName: business?.businessName ?? preset.brandName,
    subscriptionStatus: business?.subscriptionStatus ?? "active",
    accessEnabled: business?.accessEnabled ?? true,
    plan: business?.plan ?? "standard",
    monthlyPrice: business?.monthlyPrice ?? 0,
    subscriptionStartedAt: business?.subscriptionStartedAt,
    currentPeriodEnd: business?.currentPeriodEnd,
    graceUntil: business?.graceUntil,
    billingContactEmail: business?.billingContactEmail,
    billingNote: business?.billingNote,
    supportPhone: business?.supportPhone,
    businessType: business?.businessType ?? preset.businessType,
    brandName: business?.brandName ?? preset.brandName,
    logoAsset: business?.logoAsset ?? preset.logoAsset,
    logoUrl: business?.logoUrl,
    theme: {
      ...preset.theme,
      ...(business?.theme ?? {})
    },
    labels: {
      ...preset.labels,
      ...(business?.labels ?? {})
    },
    enabledModules: business?.enabledModules?.length ? business.enabledModules : preset.enabledModules,
    orderStatuses: business?.orderStatuses?.length ? business.orderStatuses : preset.orderStatuses
  };
};

export const getOrderStatusMeta = (
  statuses: BusinessOrderStatusConfig[],
  status: OrderStatus
) => statuses.find((item) => item.key === status) ?? presets.liquor_store.orderStatuses.find((item) => item.key === status)!;

export const getAllBusinessPresets = () => Object.values(presets);
