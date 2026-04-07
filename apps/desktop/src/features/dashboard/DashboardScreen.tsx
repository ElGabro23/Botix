import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  Bell,
  Bike,
  Boxes,
  FileDown,
  FileText,
  LayoutGrid,
  MapPinned,
  PackageCheck,
  Search,
  Users
} from "lucide-react";
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
  PaymentMethod,
  SubscriptionStatus
} from "@botix/shared";
import { formatCompactDateTime, formatCurrency, orderStatusColor, orderStatusLabel } from "@botix/shared";
import {
  assignCourier,
  createCourierAccount,
  createCustomerRecord,
  createDeliveryOrder,
  createTrackingLink,
  importInventoryItems,
  registerCounterSale,
  saveExpenseRecord,
  saveInventoryItem,
  subscribeBusinesses,
  subscribeCounterSales,
  subscribeCouriers,
  subscribeCustomers,
  subscribeDaySummary,
  subscribeExpenses,
  subscribeInventory,
  subscribeLiveTracking,
  subscribeOrders,
  updateBusinessSubscription,
  updateOrderStatus
} from "@/lib/botixApi";
import { assetUrl } from "@/lib/assetUrl";

type SectionKey = "overview" | "orders" | "inventory" | "customers" | "couriers" | "expenses" | "reports" | "licenses";
type CartItem = { inventoryId: string; quantity: number };
type SummaryState = DaySummary & {
  profitTotal: number;
  counterSalesTotal: number;
  expenseTotal: number;
  netProfitTotal: number;
};

const sections: Array<{ key: SectionKey; label: string; icon: typeof LayoutGrid }> = [
  { key: "overview", label: "Caja Meson", icon: LayoutGrid },
  { key: "orders", label: "Pedidos", icon: PackageCheck },
  { key: "inventory", label: "Inventario", icon: Boxes },
  { key: "customers", label: "Clientes", icon: Users },
  { key: "couriers", label: "Repartidores", icon: Bike },
  { key: "expenses", label: "Gastos", icon: FileText },
  { key: "reports", label: "Reportes", icon: FileText },
  { key: "licenses", label: "Licencias", icon: FileText }
];

const initialSummary: SummaryState = {
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

const initialInventoryDraft = {
  name: "",
  category: "",
  sku: "",
  price: "",
  costPrice: "",
  stock: ""
};

const initialCustomerDraft = {
  name: "",
  phone: "",
  address: "",
  isCreditEnabled: false
};
const newCustomerOption = "__new_customer__";

const initialCourierDraft = {
  displayName: "",
  email: "",
  phone: "",
  password: ""
};

const initialExpenseDraft = {
  category: "Luz",
  description: "",
  amount: ""
};

type Props = {
  user: AppUser;
  business: BusinessProfile | null;
  onSignOut: () => Promise<void>;
};

const buildSearchResults = (catalog: InventoryItem[], query: string) => {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return catalog
    .filter(
      (item) =>
        item.active &&
        [item.name, item.category, item.sku].some((value) => value.toLowerCase().includes(term))
    )
    .slice(0, 8);
};

const sumCart = (catalog: InventoryItem[], cart: CartItem[]) =>
  cart.reduce((sum, line) => {
    const item = catalog.find((entry) => entry.id === line.inventoryId);
    return item ? sum + item.price * line.quantity : sum;
  }, 0);

const sumCost = (catalog: InventoryItem[], cart: CartItem[]) =>
  cart.reduce((sum, line) => {
    const item = catalog.find((entry) => entry.id === line.inventoryId);
    return item ? sum + item.costPrice * line.quantity : sum;
  }, 0);

export const DashboardScreen = ({ user, business, onSignOut }: Props) => {
  const configuredTrackingBaseUrl = import.meta.env.VITE_TRACKING_BASE_URL;
  const trackingBaseUrl =
    !configuredTrackingBaseUrl || configuredTrackingBaseUrl.includes("localhost")
      ? "https://botix-e493b.web.app/"
      : configuredTrackingBaseUrl;
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [couriers, setCouriers] = useState<CourierProfile[]>([]);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [counterSales, setCounterSales] = useState<CounterSale[]>([]);
  const [summary, setSummary] = useState<SummaryState>(initialSummary);
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [tracking, setTracking] = useState<LiveTracking | null>(null);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [counterSearch, setCounterSearch] = useState("");
  const [counterCart, setCounterCart] = useState<CartItem[]>([]);
  const [counterCustomerName, setCounterCustomerName] = useState("");
  const [counterPaymentMethod, setCounterPaymentMethod] = useState<PaymentMethod>("cash");
  const [counterReceivedAmount, setCounterReceivedAmount] = useState<string>("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderCart, setOrderCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOrderCourierId, setSelectedOrderCourierId] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [inventoryDraft, setInventoryDraft] = useState(initialInventoryDraft);
  const [customerDraft, setCustomerDraft] = useState(initialCustomerDraft);
  const [orderCustomerDraft, setOrderCustomerDraft] = useState(initialCustomerDraft);
  const [courierDraft, setCourierDraft] = useState(initialCourierDraft);
  const [expenseDraft, setExpenseDraft] = useState(initialExpenseDraft);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = user.role === "admin";
  const isCashier = user.role === "cashier";
  const isSuperAdmin = user.role === "superadmin";

  useEffect(() => subscribeOrders(user.businessId, setOrders), [user.businessId]);
  useEffect(() => subscribeCustomers(user.businessId, setCustomers), [user.businessId]);
  useEffect(() => subscribeCouriers(user.businessId, setCouriers), [user.businessId]);
  useEffect(() => subscribeInventory(user.businessId, setInventoryItems), [user.businessId]);
  useEffect(() => subscribeExpenses(user.businessId, setExpenses), [user.businessId]);
  useEffect(() => subscribeCounterSales(user.businessId, setCounterSales), [user.businessId]);
  useEffect(() => subscribeDaySummary(user.businessId, setSummary), [user.businessId]);
  useEffect(() => (isSuperAdmin ? subscribeBusinesses(setBusinesses) : undefined), [isSuperAdmin]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );
  const hasTrackingCoordinates =
    typeof tracking?.lat === "number" &&
    Number.isFinite(tracking.lat) &&
    typeof tracking?.lng === "number" &&
    Number.isFinite(tracking.lng);
  const isTrackingActive = tracking?.active === true;

  useEffect(() => {
    setSelectedOrderId((current) => current ?? orders[0]?.id);
  }, [orders]);

  useEffect(
    () => subscribeLiveTracking(user.businessId, selectedOrder?.id, setTracking),
    [selectedOrder?.id, user.businessId]
  );

  useEffect(() => {
    setTrackingUrl("");
  }, [selectedOrder?.id]);

  const activeInventory = useMemo(
    () => [...inventoryItems].filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name)),
    [inventoryItems]
  );
  const visibleSections = useMemo(
    () =>
      sections.filter((section) => {
        if (isSuperAdmin) return section.key === "licenses";
        if (isAdmin) return section.key !== "licenses";
        return ["overview", "orders", "inventory", "customers"].includes(section.key);
      }),
    [isAdmin, isSuperAdmin]
  );

  useEffect(() => {
    if (!visibleSections.some((section) => section.key === activeSection)) {
      setActiveSection(visibleSections[0]?.key ?? "overview");
    }
  }, [activeSection, visibleSections]);

  const counterResults = useMemo(() => buildSearchResults(activeInventory, counterSearch), [activeInventory, counterSearch]);
  const orderResults = useMemo(() => buildSearchResults(activeInventory, orderSearch), [activeInventory, orderSearch]);
  const counterTotal = useMemo(() => sumCart(activeInventory, counterCart), [activeInventory, counterCart]);
  const counterProfit = useMemo(
    () => counterTotal - sumCost(activeInventory, counterCart),
    [activeInventory, counterCart, counterTotal]
  );
  const orderSubtotal = useMemo(() => sumCart(activeInventory, orderCart), [activeInventory, orderCart]);
  const normalizedDeliveryFee = Number(deliveryFee || 0);
  const orderProfit = useMemo(
    () => orderSubtotal - sumCost(activeInventory, orderCart),
    [activeInventory, orderCart, orderSubtotal]
  );
  const isNewOrderCustomer = selectedCustomerId === newCustomerOption;

  const addCartItem = (cart: CartItem[], inventoryId: string) => {
    const current = cart.find((item) => item.inventoryId === inventoryId);
    if (current) return cart.map((item) => (item.inventoryId === inventoryId ? { ...item, quantity: item.quantity + 1 } : item));
    return [...cart, { inventoryId, quantity: 1 }];
  };

  const updateCartQuantity = (cart: CartItem[], inventoryId: string, quantity: number) =>
    cart
      .map((item) => (item.inventoryId === inventoryId ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0);

  const renderProductResults = (results: InventoryItem[], onPick: (productId: string) => void) => (
    <div className="search-results">
      {results.map((item) => (
        <button className="search-result" key={item.id} onClick={() => onPick(item.id)} type="button">
          <div>
            <strong>{item.name}</strong>
            <span>{item.category} | {item.sku}</span>
          </div>
          <strong>{formatCurrency(item.price)}</strong>
        </button>
      ))}
    </div>
  );

  const renderCart = (cart: CartItem[], setCart: (next: CartItem[]) => void) => (
    <div className="compact-table">
      {cart.length ? (
        cart.map((line) => {
          const product = activeInventory.find((item) => item.id === line.inventoryId);
          if (!product) return null;
          return (
            <div className="compact-row" key={line.inventoryId}>
              <div>
                <strong>{product.name}</strong>
                <span>{formatCurrency(product.price)}</span>
              </div>
              <input
                className="qty-input"
                min={1}
                type="number"
                value={line.quantity}
                onChange={(event) => setCart(updateCartQuantity(cart, line.inventoryId, Number(event.target.value)))}
              />
            </div>
          );
        })
      ) : (
        <div className="empty-state">Aun no hay productos agregados.</div>
      )}
    </div>
  );

  const handleSearchEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    results: InventoryItem[],
    onPick: (productId: string) => void
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (results[0]) onPick(results[0].id);
  };

  const saveCounterSale = async () => {
    if (!counterCart.length) {
      setNotice("Agrega productos antes de registrar la venta de meson.");
      return;
    }
    setSaving("counter-sale");
    try {
      const receivedAmount = Number(counterReceivedAmount || 0);
      if (counterPaymentMethod === "cash" && receivedAmount < counterTotal) {
        setNotice("El monto recibido no alcanza para cubrir la venta.");
        return;
      }
      await registerCounterSale(user, {
        customerName: counterCustomerName.trim() || undefined,
        paymentMethod: counterPaymentMethod,
        items: counterCart
      });
      setCounterCart([]);
      setCounterSearch("");
      setCounterCustomerName("");
      setCounterReceivedAmount("");
      setNotice("Venta de meson registrada correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible registrar la venta.");
    } finally {
      setSaving(null);
    }
  };

  const saveDeliveryOrder = async () => {
    if (!selectedCustomerId) {
      setNotice("Selecciona un cliente o crea uno nuevo para el pedido.");
      return;
    }
    if (!orderCart.length) {
      setNotice("Agrega productos al pedido.");
      return;
    }
    if (isNewOrderCustomer && (!orderCustomerDraft.name || !orderCustomerDraft.phone || !orderCustomerDraft.address)) {
      setNotice("Completa nombre, telefono y direccion del cliente nuevo.");
      return;
    }
    setSaving("delivery-order");
    try {
      await createDeliveryOrder(user, {
        customerId: isNewOrderCustomer ? undefined : selectedCustomerId,
        customer: isNewOrderCustomer ? orderCustomerDraft : undefined,
        assignedCourierId: selectedOrderCourierId || undefined,
        deliveryFee: normalizedDeliveryFee,
        paymentMethod: orderPaymentMethod,
        notes: orderNotes,
        items: orderCart
      });
      setOrderCart([]);
      setOrderSearch("");
      setOrderNotes("");
      setDeliveryFee("");
      setSelectedOrderCourierId("");
      setSelectedCustomerId("");
      setOrderCustomerDraft(initialCustomerDraft);
      setNotice("Pedido delivery creado correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible crear el pedido.");
    } finally {
      setSaving(null);
    }
  };

  const saveCustomer = async () => {
    if (!customerDraft.name || !customerDraft.phone || !customerDraft.address) {
      setNotice("Completa nombre, telefono y direccion del cliente.");
      return;
    }
    setSaving("customer");
    try {
      await createCustomerRecord(user.businessId, customerDraft);
      setCustomerDraft(initialCustomerDraft);
      setNotice("Cliente registrado correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible guardar el cliente.");
    } finally {
      setSaving(null);
    }
  };

  const saveInventory = async () => {
    if (!inventoryDraft.name || !inventoryDraft.category || !inventoryDraft.sku) {
      setNotice("Completa nombre, categoria y SKU del producto.");
      return;
    }
    setSaving("inventory");
    try {
      await saveInventoryItem(user.businessId, {
        id: crypto.randomUUID(),
        name: inventoryDraft.name,
        category: inventoryDraft.category,
        sku: inventoryDraft.sku,
        price: Number(inventoryDraft.price || 0),
        costPrice: Number(inventoryDraft.costPrice || 0),
        stock: Number(inventoryDraft.stock || 0),
        active: true
      });
      setInventoryDraft(initialInventoryDraft);
      setNotice("Producto guardado en inventario.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible guardar el producto.");
    } finally {
      setSaving(null);
    }
  };

  const saveCourier = async () => {
    if (!courierDraft.displayName || !courierDraft.email || !courierDraft.phone || !courierDraft.password) {
      setNotice("Completa todos los datos del repartidor.");
      return;
    }
    setSaving("courier");
    try {
      await createCourierAccount(user.businessId, courierDraft);
      setCourierDraft(initialCourierDraft);
      setNotice("Repartidor creado y habilitado para la app movil.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible crear el repartidor.");
    } finally {
      setSaving(null);
    }
  };

  const saveExpense = async () => {
    if (!expenseDraft.category || !expenseDraft.description || !expenseDraft.amount) {
      setNotice("Completa categoria, descripcion y monto del gasto.");
      return;
    }
    setSaving("expense");
    try {
      await saveExpenseRecord(user, {
        category: expenseDraft.category,
        description: expenseDraft.description,
        amount: Number(expenseDraft.amount || 0)
      });
      setExpenseDraft(initialExpenseDraft);
      setNotice("Gasto registrado correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible guardar el gasto.");
    } finally {
      setSaving(null);
    }
  };

  const generateTracking = async () => {
    if (!selectedOrder) return;
    try {
      const token = await createTrackingLink(user.businessId, selectedOrder.id);
      const url = `${trackingBaseUrl.replace(/\/$/, "")}/?token=${token}`;
      setTrackingUrl(url);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          setNotice("Link de seguimiento generado y copiado al portapapeles.");
        } catch {
          setNotice("Link de seguimiento generado correctamente.");
        }
      } else {
        setNotice("Link de seguimiento generado correctamente.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible generar el link de seguimiento.");
    }
  };

  const saveBusinessAccess = async (
    businessId: string,
    patch: Partial<Pick<BusinessProfile, "subscriptionStatus" | "accessEnabled" | "plan" | "monthlyPrice" | "currentPeriodEnd" | "billingContactEmail" | "billingNote">>
  ) => {
    try {
      await updateBusinessSubscription(businessId, patch);
      setNotice("Suscripcion actualizada correctamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible actualizar la suscripcion.");
    }
  };

  const downloadInventoryTemplate = () => {
    const csv = [
      "nombre,categoria,sku,precio,costo,stock",
      "Escudo 6-pack,Cervezas,ESC-6P,6990,4200,18",
      "Coca-Cola 1.5L,Bebidas,CC-15,2490,1400,24"
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla-inventario-botix.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImportInventory = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    const items = rows.slice(1)
      .map((row) => row.split(",").map((cell) => cell.trim()))
      .filter((cells) => cells.length >= 6)
      .map((cells) => ({
        id: crypto.randomUUID(),
        name: cells[0],
        category: cells[1],
        sku: cells[2],
        price: Number(cells[3] ?? 0),
        costPrice: Number(cells[4] ?? 0),
        stock: Number(cells[5] ?? 0),
        active: true
      }));

    if (!items.length) {
      setNotice("El archivo no contiene filas validas para importar.");
      return;
    }

    setSaving("inventory-import");
    try {
      await importInventoryItems(user.businessId, items);
      setNotice(`Se importaron ${items.length} productos al inventario.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible importar el inventario.");
    } finally {
      setSaving(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportReportPdf = () => {
    const printable = window.open("", "_blank", "width=900,height=800");
    if (!printable) return;
    printable.document.write(`
      <html><head><title>Reporte BOTIX</title><style>
      body{font-family:Segoe UI,sans-serif;padding:32px;color:#20314c}
      table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #dfe5f5;text-align:left}
      </style></head><body>
      <h1>Reporte mensual BOTIX</h1>
      <p>Negocio: ${user.businessId}</p>
      <p>Fecha: ${new Date().toLocaleString("es-CL")}</p>
      <table><tbody>
      <tr><th>Ventas del mes</th><td>${formatCurrency(summary.salesTotal)}</td></tr>
      <tr><th>Ventas meson del mes</th><td>${formatCurrency(summary.counterSalesTotal)}</td></tr>
      <tr><th>Delivery del mes</th><td>${formatCurrency(summary.deliveryTotal)}</td></tr>
      <tr><th>Utilidad estimada</th><td>${formatCurrency(summary.profitTotal)}</td></tr>
      <tr><th>Gastos del mes</th><td>${formatCurrency(summary.expenseTotal)}</td></tr>
      <tr><th>Ganancia real</th><td>${formatCurrency(summary.netProfitTotal)}</td></tr>
      <tr><th>Pedidos abiertos</th><td>${summary.openOrders}</td></tr>
      </tbody></table></body></html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return (
    <div className="desktop-shell compact-shell">
      <header className="topbar compact-topbar">
        <div className="brand-wrap">
          <img src={assetUrl("brand/botix.jpg")} alt="Botix" />
          <div>
            <h1>BOTIX</h1>
            <span>Sistema para Botillerias</span>
          </div>
        </div>

        <nav className="topnav">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={`nav-item ${activeSection === section.key ? "active" : ""}`}
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                type="button"
              >
                <Icon size={15} />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="user-badge">
          <Bell size={16} />
          <div>
            <strong>{user.displayName}</strong>
            <span>
              {isSuperAdmin ? "Panel Superadmin" : business?.businessName ?? user.businessId}
              {!isSuperAdmin ? ` | ${business?.subscriptionStatus ?? "active"}` : ""}
            </span>
          </div>
          <button className="ghost-button" onClick={() => void onSignOut()}>
            Salir
          </button>
        </div>
      </header>

      {notice ? <div className="notice-banner">{notice}</div> : null}

      {activeSection === "overview" ? (
        <main className="module-layout module-layout--delivery">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Venta Meson</div>
            <div className="inline-field">
              <Search size={15} />
              <input
                placeholder="Buscar producto por nombre o SKU"
                value={counterSearch}
                onChange={(event) => setCounterSearch(event.target.value)}
                onKeyDown={(event) =>
                  handleSearchEnter(event, counterResults, (productId) =>
                    setCounterCart(addCartItem(counterCart, productId))
                  )
                }
              />
            </div>
            {renderProductResults(counterResults, (productId) => setCounterCart(addCartItem(counterCart, productId)))}
            <div className="field-grid compact-grid">
              <input
                placeholder="Cliente opcional"
                value={counterCustomerName}
                onChange={(event) => setCounterCustomerName(event.target.value)}
              />
              <select value={counterPaymentMethod} onChange={(event) => setCounterPaymentMethod(event.target.value as PaymentMethod)}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
              <input
                type="number"
                placeholder="Cantidad de efectivo"
                value={counterReceivedAmount}
                onChange={(event) => setCounterReceivedAmount(event.target.value)}
              />
            </div>
            <div className="summary-strip">
              <span>Total: {formatCurrency(counterTotal)}</span>
              {isAdmin ? <span>Utilidad: {formatCurrency(counterProfit)}</span> : null}
              <span>Vuelto: {formatCurrency(Math.max(Number(counterReceivedAmount || 0) - counterTotal, 0))}</span>
            </div>
            {renderCart(counterCart, setCounterCart)}
            <button className="action-button action-button--primary compact-action" onClick={() => void saveCounterSale()}>
              {saving === "counter-sale" ? "Guardando..." : "Registrar venta"}
            </button>
          </article>

          <article className="panel-card compact-card">
            <div className="section-title compact-title">Resumen del Mes</div>
            <div className="metrics-grid">
              <div className="metric-tile compact-tile"><span>Ventas</span><strong>{formatCurrency(summary.salesTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Meson</span><strong>{formatCurrency(summary.counterSalesTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Delivery</span><strong>{formatCurrency(summary.deliveryTotal)}</strong></div>
              {isAdmin ? <div className="metric-tile compact-tile"><span>Ganancia</span><strong>{formatCurrency(summary.profitTotal)}</strong></div> : null}
            </div>
            <div className="section-title compact-title compact-title--spaced">Ultimas ventas</div>
            <div className="compact-table">
              {counterSales.slice(0, 3).map((sale) => (
                <div className="compact-row" key={sale.id}>
                  <div>
                    <strong>Venta #{sale.saleNumber}</strong>
                    <span>{formatCompactDateTime(sale.createdAt)}</span>
                  </div>
                  <strong>{formatCurrency(sale.total)}</strong>
                </div>
              ))}
            </div>
          </article>
        </main>
      ) : null}

      {activeSection === "orders" ? (
        <main className="module-layout module-layout--delivery">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Crear pedido delivery</div>
            <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
              <option value="">Selecciona cliente registrado</option>
              <option value={newCustomerOption}>Crear cliente nuevo</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} | {customer.phone}
                </option>
              ))}
            </select>
            {isNewOrderCustomer ? (
              <div className="field-grid compact-grid">
                <input
                  placeholder="Nombre del cliente"
                  value={orderCustomerDraft.name}
                  onChange={(event) => setOrderCustomerDraft((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  placeholder="Telefono del cliente"
                  value={orderCustomerDraft.phone}
                  onChange={(event) => setOrderCustomerDraft((current) => ({ ...current, phone: event.target.value }))}
                />
                <input
                  className="field-span"
                  placeholder="Direccion del cliente"
                  value={orderCustomerDraft.address}
                  onChange={(event) => setOrderCustomerDraft((current) => ({ ...current, address: event.target.value }))}
                />
              </div>
            ) : null}
            <div className="inline-field">
              <Search size={15} />
              <input
                placeholder="Buscar producto del pedido"
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                onKeyDown={(event) =>
                  handleSearchEnter(event, orderResults, (productId) =>
                    setOrderCart(addCartItem(orderCart, productId))
                  )
                }
              />
            </div>
            {renderProductResults(orderResults, (productId) => setOrderCart(addCartItem(orderCart, productId)))}
            <div className="field-grid compact-grid">
              <select value={selectedOrderCourierId} onChange={(event) => setSelectedOrderCourierId(event.target.value)}>
                <option value="">Asignar repartidor despues</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.displayName}
                  </option>
                ))}
              </select>
              <input
                placeholder="Coste Delivery"
                type="number"
                value={deliveryFee}
                onChange={(event) => setDeliveryFee(event.target.value)}
              />
              <select value={orderPaymentMethod} onChange={(event) => setOrderPaymentMethod(event.target.value as PaymentMethod)}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
              <input
                className="field-span"
                placeholder="Observaciones del pedido"
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
              />
            </div>
            <div className="summary-strip">
              <span>Subtotal: {formatCurrency(orderSubtotal)}</span>
              <span>Total: {formatCurrency(orderSubtotal + normalizedDeliveryFee)}</span>
              {isAdmin ? <span>Utilidad: {formatCurrency(orderProfit)}</span> : null}
            </div>
            {renderCart(orderCart, setOrderCart)}
            <button className="action-button action-button--primary compact-action" onClick={() => void saveDeliveryOrder()}>
              {saving === "delivery-order" ? "Creando..." : "Crear pedido"}
            </button>
          </article>

          <article className="panel-card compact-card">
            <div className="section-title compact-title">Pedidos activos</div>
            <div className="stack-list compact-stack compact-stack--orders">
              {orders.map((order) => (
                <button
                  className={`order-card compact-order ${selectedOrder?.id === order.id ? "selected" : ""}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  type="button"
                >
                  <div className="order-card__top">
                    <strong>#{order.orderNumber}</strong>
                    <span
                      className="status-pill"
                      style={{
                        backgroundColor: `${orderStatusColor[order.status]}20`,
                        color: orderStatusColor[order.status]
                      }}
                    >
                      {orderStatusLabel[order.status]}
                    </span>
                    <strong>{formatCurrency(order.total)}</strong>
                  </div>
                  <div className="order-card__body">
                    <span>{order.customerName}</span>
                    <span>{order.address}</span>
                  </div>
                </button>
              ))}
            </div>
            {selectedOrder ? (
              <>
                <div className="section-title compact-title compact-title--spaced">Detalle</div>
                <div className="detail-group compact-details">
                  <div className="detail-line"><span>Cliente</span><strong>{selectedOrder.customerName}</strong></div>
                  <div className="detail-line"><span>Direccion</span><strong>{selectedOrder.address}</strong></div>
                  <div className="detail-line"><span>Pago</span><strong>{selectedOrder.paymentMethod}</strong></div>
                  <div className="detail-line"><span>Repartidor</span><strong>{selectedOrder.assignedCourierName ?? "Sin asignar"}</strong></div>
                </div>
                <div className="mini-actions">
                  <select
                    value={selectedOrder.assignedCourierId ?? ""}
                    onChange={(event) => {
                      const courier = couriers.find((item) => item.id === event.target.value);
                      if (courier) void assignCourier(user.businessId, selectedOrder.id, courier);
                    }}
                  >
                    <option value="">Asignar repartidor</option>
                    {couriers.map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {courier.displayName}
                      </option>
                    ))}
                  </select>
                  <button className="ghost-button compact-ghost" onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "preparing")}>Preparando</button>
                  <button className="ghost-button compact-ghost" onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "delivered")}>Entregado</button>
                  <button className="ghost-button compact-ghost danger-outline" onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "cancelled")}>Cancelar</button>
                </div>
                <div className="tracking-box compact-tracking">
                  <div className="tracking-box__title">
                    <MapPinned size={15} />
                    Seguimiento {isTrackingActive ? "activo" : "inactivo"}
                  </div>
                  {tracking && hasTrackingCoordinates ? (
                    <span>{tracking.lat.toFixed(5)}, {tracking.lng.toFixed(5)} | {formatCompactDateTime(tracking.updatedAt)}</span>
                  ) : (
                    <span>Sin tracking activo.</span>
                  )}
                </div>
                <button className="action-button action-button--light compact-action" onClick={() => void generateTracking()}>
                  Generar link cliente
                </button>
                {trackingUrl ? <div className="tracking-link-box">{trackingUrl}</div> : null}
              </>
            ) : null}
          </article>
        </main>
      ) : null}

      {activeSection === "inventory" ? (
        <main className="module-layout">
          {isAdmin ? (
            <article className="panel-card compact-card">
              <div className="section-title compact-title">Inventario</div>
              <div className="field-grid compact-grid">
                <input aria-label="Nombre del producto" placeholder="Nombre del producto" value={inventoryDraft.name} onChange={(event) => setInventoryDraft((current) => ({ ...current, name: event.target.value }))} />
                <input aria-label="Categoria del producto" placeholder="Categoria" value={inventoryDraft.category} onChange={(event) => setInventoryDraft((current) => ({ ...current, category: event.target.value }))} />
                <input aria-label="SKU del producto" placeholder="SKU o codigo interno" value={inventoryDraft.sku} onChange={(event) => setInventoryDraft((current) => ({ ...current, sku: event.target.value }))} />
                <input aria-label="Precio de venta" placeholder="Valor de venta" type="number" value={inventoryDraft.price} onChange={(event) => setInventoryDraft((current) => ({ ...current, price: event.target.value }))} />
                <input aria-label="Costo del producto" placeholder="Coste del producto" type="number" value={inventoryDraft.costPrice} onChange={(event) => setInventoryDraft((current) => ({ ...current, costPrice: event.target.value }))} />
                <input aria-label="Stock inicial" placeholder="Stock" type="number" value={inventoryDraft.stock} onChange={(event) => setInventoryDraft((current) => ({ ...current, stock: event.target.value }))} />
              </div>
              <div className="mini-actions">
                <button className="action-button action-button--primary compact-action" onClick={() => void saveInventory()}>
                  {saving === "inventory" ? "Guardando..." : "Guardar producto"}
                </button>
                <button className="action-button action-button--light compact-action" onClick={downloadInventoryTemplate}>
                  Descargar plantilla Excel
                </button>
                <button className="action-button action-button--light compact-action" onClick={() => fileInputRef.current?.click()}>
                  Importar desde Excel CSV
                </button>
                <input accept=".csv" hidden onChange={(event) => void onImportInventory(event)} ref={fileInputRef} type="file" />
              </div>
            </article>
          ) : null}

          <article className="panel-card compact-card">
            <div className="section-title compact-title">{isCashier ? "Inventario disponible" : "Catalogo"}</div>
            <div className="inventory-table">
              <div className="inventory-row inventory-row--head">
                <span>Producto</span>
                <span>SKU</span>
                <span>Precio</span>
                {isAdmin ? <span>Costo</span> : null}
                <span>Stock</span>
              </div>
              {activeInventory.map((item) => (
                <div className="inventory-row" key={item.id}>
                  <span>{item.name}</span>
                  <span>{item.sku}</span>
                  <span>{formatCurrency(item.price)}</span>
                  {isAdmin ? <span>{formatCurrency(item.costPrice)}</span> : null}
                  <span>{item.stock}</span>
                </div>
              ))}
            </div>
          </article>
        </main>
      ) : null}

      {activeSection === "customers" ? (
        <main className="module-layout">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Registrar cliente</div>
            <div className="field-grid compact-grid">
              <input placeholder="Nombre" value={customerDraft.name} onChange={(event) => setCustomerDraft((current) => ({ ...current, name: event.target.value }))} />
              <input placeholder="Telefono" value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))} />
              <input className="field-span" placeholder="Direccion" value={customerDraft.address} onChange={(event) => setCustomerDraft((current) => ({ ...current, address: event.target.value }))} />
            </div>
            <label className="checkbox-row">
              <input checked={customerDraft.isCreditEnabled} onChange={(event) => setCustomerDraft((current) => ({ ...current, isCreditEnabled: event.target.checked }))} type="checkbox" />
              Cliente con fiado habilitado
            </label>
            <button className="action-button action-button--primary compact-action" onClick={() => void saveCustomer()}>
              {saving === "customer" ? "Guardando..." : "Guardar cliente"}
            </button>
          </article>

          <article className="panel-card compact-card">
            <div className="section-title compact-title">Clientes registrados</div>
            <div className="compact-table">
              {customers.map((customer) => (
                <div className="compact-row" key={customer.id}>
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{customer.phone} | {customer.address}</span>
                  </div>
                  <div className="compact-row__meta">
                    <strong>{formatCurrency(customer.totalSpent)}</strong>
                    <span>{customer.totalOrders} pedidos</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </main>
      ) : null}

      {activeSection === "couriers" && isAdmin ? (
        <main className="module-layout">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Agregar repartidor</div>
            <div className="field-grid compact-grid">
              <input placeholder="Nombre" value={courierDraft.displayName} onChange={(event) => setCourierDraft((current) => ({ ...current, displayName: event.target.value }))} />
              <input placeholder="Correo" value={courierDraft.email} onChange={(event) => setCourierDraft((current) => ({ ...current, email: event.target.value }))} />
              <input placeholder="Telefono" value={courierDraft.phone} onChange={(event) => setCourierDraft((current) => ({ ...current, phone: event.target.value }))} />
              <input placeholder="Contrasena inicial" value={courierDraft.password} onChange={(event) => setCourierDraft((current) => ({ ...current, password: event.target.value }))} />
            </div>
            <button className="action-button action-button--primary compact-action" onClick={() => void saveCourier()}>
              {saving === "courier" ? "Creando..." : "Crear repartidor"}
            </button>
          </article>

          <article className="panel-card compact-card">
            <div className="section-title compact-title">Equipo de reparto</div>
            <div className="compact-table">
              {couriers.map((courier) => (
                <div className="compact-row" key={courier.id}>
                  <div>
                    <strong>{courier.displayName}</strong>
                    <span>{courier.phone}</span>
                  </div>
                  <div className="compact-row__meta">
                    <strong>{courier.status}</strong>
                    <span>{courier.activeOrderIds.length} activos</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </main>
      ) : null}

      {activeSection === "reports" && isAdmin ? (
        <main className="module-layout">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Reporte mensual</div>
            <div className="report-grid">
              <div className="metric-tile compact-tile"><span>Ventas</span><strong>{formatCurrency(summary.salesTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Utilidad</span><strong>{formatCurrency(summary.profitTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Gastos</span><strong>{formatCurrency(summary.expenseTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Ganancia real</span><strong>{formatCurrency(summary.netProfitTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Efectivo</span><strong>{formatCurrency(summary.cashTotal)}</strong></div>
              <div className="metric-tile compact-tile"><span>Tarjeta</span><strong>{formatCurrency(summary.cardTotal)}</strong></div>
            </div>
            <button className="action-button action-button--primary compact-action" onClick={exportReportPdf}>
              <FileDown size={16} />
              Descargar PDF
            </button>
          </article>
        </main>
      ) : null}

      {activeSection === "expenses" && isAdmin ? (
        <main className="module-layout">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Registrar gasto</div>
            <div className="field-grid compact-grid">
              <select
                value={expenseDraft.category}
                onChange={(event) => setExpenseDraft((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="Luz">Luz</option>
                <option value="Agua">Agua</option>
                <option value="Internet">Internet</option>
                <option value="Arriendo">Arriendo</option>
                <option value="Sueldos">Sueldos</option>
                <option value="Otros">Otros</option>
              </select>
              <input
                placeholder="Monto del gasto"
                type="number"
                value={expenseDraft.amount}
                onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))}
              />
              <input
                className="field-span"
                placeholder="Descripcion del gasto"
                value={expenseDraft.description}
                onChange={(event) => setExpenseDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <button className="action-button action-button--primary compact-action" onClick={() => void saveExpense()}>
              {saving === "expense" ? "Guardando..." : "Guardar gasto"}
            </button>
          </article>

          <article className="panel-card compact-card">
            <div className="section-title compact-title">Gastos del mes</div>
            <div className="compact-table">
              {expenses.length ? (
                expenses.map((expense) => (
                  <div className="compact-row" key={expense.id}>
                    <div>
                      <strong>{expense.category}</strong>
                      <span>{expense.description}</span>
                      <span>{formatCompactDateTime(expense.createdAt)}</span>
                    </div>
                    <div className="compact-row__meta">
                      <strong>{formatCurrency(expense.amount)}</strong>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">Aun no hay gastos registrados este mes.</div>
              )}
            </div>
          </article>
        </main>
      ) : null}

      {activeSection === "licenses" && isSuperAdmin ? (
        <main className="module-layout">
          <article className="panel-card compact-card">
            <div className="section-title compact-title">Panel comercial</div>
            <div className="compact-table">
              {businesses.map((entry) => (
                <div className="compact-row" key={entry.id} style={{ alignItems: "start" }}>
                  <div style={{ width: "100%" }}>
                    <strong>{entry.businessName}</strong>
                    <span>{entry.businessId}</span>
                    <span>
                      Estado: {entry.subscriptionStatus} | Acceso: {entry.accessEnabled ? "habilitado" : "bloqueado"}
                    </span>
                    <span>Plan: {entry.plan ?? "standard"} | Mensualidad: {formatCurrency(entry.monthlyPrice ?? 0)}</span>
                    <span>Vence: {entry.currentPeriodEnd ?? "Sin fecha"}</span>
                  </div>
                  <div className="compact-row__meta" style={{ minWidth: 260 }}>
                    <select
                      value={entry.subscriptionStatus}
                      onChange={(event) =>
                        void saveBusinessAccess(entry.id, { subscriptionStatus: event.target.value as SubscriptionStatus })
                      }
                    >
                      <option value="active">Activa</option>
                      <option value="overdue">Mora</option>
                      <option value="suspended">Suspendida</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                    <button
                      className="ghost-button compact-ghost"
                      onClick={() => void saveBusinessAccess(entry.id, { accessEnabled: !entry.accessEnabled })}
                      type="button"
                    >
                      {entry.accessEnabled ? "Bloquear acceso" : "Reactivar acceso"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </main>
      ) : null}
    </div>
  );
};
