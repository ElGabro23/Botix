import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bike,
  Boxes,
  FileText,
  LayoutGrid,
  MapPinned,
  PackageCheck,
  Users
} from "lucide-react";
import type {
  AppUser,
  CourierProfile,
  Customer,
  DaySummary,
  DeliveryOrder,
  InventoryItem,
  LiveTracking
} from "@botix/shared";
import { formatCompactDateTime, formatCurrency, orderStatusColor, orderStatusLabel } from "@botix/shared";
import {
  assignCourier,
  createOrder,
  createTrackingLink,
  saveInventoryItem,
  subscribeCouriers,
  subscribeCustomers,
  subscribeDaySummary,
  subscribeInventory,
  subscribeLiveTracking,
  subscribeOrders,
  updateOrderStatus
} from "@/lib/botixApi";
import { assetUrl } from "@/lib/assetUrl";

const initialDraft = {
  customerName: "",
  customerPhone: "",
  address: "",
  paymentMethod: "cash" as const,
  deliveryFee: 1500,
  items: [
    { name: "Producto 1", quantity: 1, unitPrice: 8500 },
    { name: "Producto 2", quantity: 1, unitPrice: 2000 }
  ],
  notes: ""
};

const initialInventoryDraft = {
  name: "",
  category: "",
  sku: "",
  price: 0,
  stock: 0
};

type Props = {
  user: AppUser;
  onSignOut: () => Promise<void>;
};

type SectionKey = "overview" | "delivery" | "inventory" | "customers" | "couriers" | "reports";

const sections: Array<{
  key: SectionKey;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { key: "overview", label: "Caja Meson", icon: LayoutGrid },
  { key: "delivery", label: "Pedidos Delivery", icon: PackageCheck },
  { key: "inventory", label: "Inventario", icon: Boxes },
  { key: "customers", label: "Clientes", icon: Users },
  { key: "couriers", label: "Repartidores", icon: Bike },
  { key: "reports", label: "Reportes", icon: FileText }
];

export const DashboardScreen = ({ user, onSignOut }: Props) => {
  const trackingBaseUrl = import.meta.env.VITE_TRACKING_BASE_URL ?? "https://tracking.example.com/";
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [couriers, setCouriers] = useState<CourierProfile[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<DaySummary>({
    salesTotal: 0,
    cashTotal: 0,
    cardTotal: 0,
    deliveryTotal: 0,
    openOrders: 0
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [tracking, setTracking] = useState<LiveTracking | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(initialDraft);
  const [inventoryDraft, setInventoryDraft] = useState(initialInventoryDraft);

  useEffect(() => subscribeOrders(user.businessId, setOrders), [user.businessId]);
  useEffect(() => subscribeCustomers(user.businessId, setCustomers), [user.businessId]);
  useEffect(() => subscribeCouriers(user.businessId, setCouriers), [user.businessId]);
  useEffect(() => subscribeInventory(user.businessId, setInventoryItems), [user.businessId]);
  useEffect(() => subscribeDaySummary(user.businessId, setSummary), [user.businessId]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );

  const sortedInventory = useMemo(
    () => [...inventoryItems].sort((a, b) => a.name.localeCompare(b.name)),
    [inventoryItems]
  );

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

  const createQuickOrder = async () => {
    if (!draft.customerName || !draft.customerPhone || !draft.address) {
      setNotice("Completa cliente, telefono y direccion para crear el pedido.");
      return;
    }

    setCreating(true);
    try {
      await createOrder(user, draft);
      setDraft(initialDraft);
      setNotice("Pedido creado correctamente.");
      setActiveSection("delivery");
    } finally {
      setCreating(false);
    }
  };

  const createInventoryItem = async () => {
    if (!inventoryDraft.name || !inventoryDraft.category || !inventoryDraft.sku) {
      setNotice("Completa nombre, categoria y SKU del producto.");
      return;
    }

    setSavingInventory(true);
    try {
      await saveInventoryItem(user.businessId, {
        id: crypto.randomUUID(),
        name: inventoryDraft.name,
        category: inventoryDraft.category,
        sku: inventoryDraft.sku,
        price: inventoryDraft.price,
        stock: inventoryDraft.stock,
        active: true
      });
      setInventoryDraft(initialInventoryDraft);
      setNotice("Producto guardado en inventario.");
    } finally {
      setSavingInventory(false);
    }
  };

  const renderOverview = () => (
    <main className="dashboard-grid">
      <section className="column">
        <article className="panel-card">
          <div className="section-title">Caja Meson</div>
          <div className="field-grid">
            <input
              placeholder="Cliente"
              value={draft.customerName}
              onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))}
            />
            <input
              placeholder="Telefono"
              value={draft.customerPhone}
              onChange={(event) => setDraft((current) => ({ ...current, customerPhone: event.target.value }))}
            />
            <input
              className="field-span"
              placeholder="Direccion"
              value={draft.address}
              onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
            />
            <input
              placeholder="Producto 1"
              value={draft.items[0]?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  items: current.items.map((item, index) =>
                    index === 0 ? { ...item, name: event.target.value } : item
                  )
                }))
              }
            />
            <input
              placeholder="Precio 1"
              type="number"
              value={draft.items[0]?.unitPrice ?? 0}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  items: current.items.map((item, index) =>
                    index === 0 ? { ...item, unitPrice: Number(event.target.value) } : item
                  )
                }))
              }
            />
          </div>
          <button className="action-button action-button--light" onClick={() => void createQuickOrder()}>
            {creating ? "Creando..." : "Venta Rapida"}
          </button>
          <button
            className="action-button action-button--primary"
            onClick={() => setNotice("Cierre de caja listo para integrarse al flujo contable.")}
          >
            Cierre de Caja
          </button>
        </article>

        <article className="panel-card">
          <div className="section-title">Resumen del Dia</div>
          <div className="metric-row">
            <span>Ventas</span>
            <strong>{formatCurrency(summary.salesTotal)}</strong>
          </div>
          <div className="metric-row">
            <span>Efectivo</span>
            <strong>{formatCurrency(summary.cashTotal)}</strong>
          </div>
          <div className="metric-row">
            <span>Tarjeta</span>
            <strong>{formatCurrency(summary.cardTotal)}</strong>
          </div>
          <div className="metric-row">
            <span>Delivery</span>
            <strong>{formatCurrency(summary.deliveryTotal)}</strong>
          </div>
        </article>

        <article className="panel-card">
          <div className="section-title inline-title">
            Repartidores
            <Bike size={16} />
          </div>
          <div className="stack-list">
            {couriers.map((courier) => (
              <button
                className="list-row"
                key={courier.id}
                onClick={() =>
                  selectedOrder
                    ? void assignCourier(user.businessId, selectedOrder.id, {
                        id: courier.id,
                        displayName: courier.displayName
                      })
                    : undefined
                }
              >
                <div>
                  <strong>{courier.displayName}</strong>
                  <span>{courier.activeOrderIds.length} pedidos asignados</span>
                </div>
                <div className="list-meta">
                  <strong>{formatCurrency(courier.deliveredTotal)}</strong>
                  <span>{courier.status}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="column column--center">
        <article className="panel-card">
          <div className="section-title">Pedidos Delivery</div>
          <OrdersList orders={orders} selectedOrder={selectedOrder} onSelect={setSelectedOrderId} />
        </article>

        <article className="panel-card">
          <div className="section-title inline-title">
            Clientes
            <Users size={16} />
          </div>
          <CustomersList customers={customers} />
        </article>
      </section>

      <section className="column">
        <OrderDetailCard
          selectedOrder={selectedOrder}
          tracking={tracking}
          trackingUrl={trackingUrl}
          trackingBaseUrl={trackingBaseUrl}
          onGenerateTracking={async () => {
            if (!selectedOrder) return;
            const token = await createTrackingLink(user.businessId, selectedOrder.id);
            setTrackingUrl(`${trackingBaseUrl.replace(/\/$/, "")}/?token=${token}`);
          }}
          onPreparing={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "preparing")}
          onDelivered={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "delivered")}
          onCancelled={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "cancelled")}
        />
      </section>
    </main>
  );

  const renderInventory = () => (
    <main className="module-layout">
      <article className="panel-card">
        <div className="section-title">Inventario</div>
        <div className="field-grid inventory-form">
          <input
            placeholder="Nombre"
            value={inventoryDraft.name}
            onChange={(event) => setInventoryDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            placeholder="Categoria"
            value={inventoryDraft.category}
            onChange={(event) => setInventoryDraft((current) => ({ ...current, category: event.target.value }))}
          />
          <input
            placeholder="SKU"
            value={inventoryDraft.sku}
            onChange={(event) => setInventoryDraft((current) => ({ ...current, sku: event.target.value }))}
          />
          <input
            placeholder="Precio"
            type="number"
            value={inventoryDraft.price}
            onChange={(event) => setInventoryDraft((current) => ({ ...current, price: Number(event.target.value) }))}
          />
          <input
            placeholder="Stock"
            type="number"
            value={inventoryDraft.stock}
            onChange={(event) => setInventoryDraft((current) => ({ ...current, stock: Number(event.target.value) }))}
          />
        </div>
        <button className="action-button action-button--primary" onClick={() => void createInventoryItem()}>
          {savingInventory ? "Guardando..." : "Guardar producto"}
        </button>
      </article>

      <article className="panel-card">
        <div className="section-title">Productos cargados</div>
        <div className="inventory-table">
          <div className="inventory-row inventory-row--head">
            <span>Producto</span>
            <span>Categoria</span>
            <span>SKU</span>
            <span>Stock</span>
            <span>Precio</span>
          </div>
          {sortedInventory.length ? (
            sortedInventory.map((item) => (
              <div className="inventory-row" key={item.id}>
                <span>{item.name}</span>
                <span>{item.category}</span>
                <span>{item.sku}</span>
                <span>{item.stock}</span>
                <strong>{formatCurrency(item.price)}</strong>
              </div>
            ))
          ) : (
            <div className="empty-state">Todavia no hay productos en inventario.</div>
          )}
        </div>
      </article>
    </main>
  );

  const renderCustomers = () => (
    <main className="module-layout">
      <article className="panel-card">
        <div className="section-title">Clientes</div>
        <CustomersList customers={customers} expanded />
      </article>
    </main>
  );

  const renderCouriers = () => (
    <main className="module-layout">
      <article className="panel-card">
        <div className="section-title">Repartidores</div>
        <div className="stack-list">
          {couriers.map((courier) => (
            <div className="list-row static-row" key={courier.id}>
              <div>
                <strong>{courier.displayName}</strong>
                <span>{courier.phone}</span>
                <span>{courier.activeOrderIds.length} pedidos activos</span>
              </div>
              <div className="list-meta">
                <strong>{courier.status}</strong>
                <span>{courier.lastSeenAt ? formatCompactDateTime(courier.lastSeenAt) : "Sin reporte"}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </main>
  );

  const renderReports = () => (
    <main className="module-layout">
      <article className="panel-card">
        <div className="section-title">Reportes</div>
        <div className="report-grid">
          <div className="metric-tile">
            <span>Pedidos abiertos</span>
            <strong>{summary.openOrders}</strong>
          </div>
          <div className="metric-tile">
            <span>Clientes registrados</span>
            <strong>{customers.length}</strong>
          </div>
          <div className="metric-tile">
            <span>Productos activos</span>
            <strong>{inventoryItems.filter((item) => item.active).length}</strong>
          </div>
          <div className="metric-tile">
            <span>Repartidores</span>
            <strong>{couriers.length}</strong>
          </div>
        </div>
      </article>
    </main>
  );

  const renderDelivery = () => (
    <main className="module-layout module-layout--delivery">
      <article className="panel-card">
        <div className="section-title">Pedidos Delivery</div>
        <OrdersList orders={orders} selectedOrder={selectedOrder} onSelect={setSelectedOrderId} />
      </article>
      <OrderDetailCard
        selectedOrder={selectedOrder}
        tracking={tracking}
        trackingUrl={trackingUrl}
        trackingBaseUrl={trackingBaseUrl}
        onGenerateTracking={async () => {
          if (!selectedOrder) return;
          const token = await createTrackingLink(user.businessId, selectedOrder.id);
          setTrackingUrl(`${trackingBaseUrl.replace(/\/$/, "")}/?token=${token}`);
        }}
        onPreparing={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "preparing")}
        onDelivered={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "delivered")}
        onCancelled={() => selectedOrder && void updateOrderStatus(user.businessId, selectedOrder.id, "cancelled")}
      />
    </main>
  );

  const sectionContent = {
    overview: renderOverview(),
    delivery: renderDelivery(),
    inventory: renderInventory(),
    customers: renderCustomers(),
    couriers: renderCouriers(),
    reports: renderReports()
  } satisfies Record<SectionKey, JSX.Element>;

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <img src={assetUrl("brand/botix.jpg")} alt="Botix" />
          <div>
            <h1>BOTIX</h1>
            <span>Sistema para Botillerias</span>
          </div>
        </div>

        <nav className="topnav">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={`nav-item ${activeSection === section.key ? "active" : ""}`}
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                type="button"
              >
                <Icon size={16} />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="user-badge">
          <Bell size={18} />
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.businessId}</span>
          </div>
          <button className="ghost-button" onClick={() => void onSignOut()}>
            Salir
          </button>
        </div>
      </header>

      {notice ? <div className="notice-banner">{notice}</div> : null}

      {sectionContent[activeSection]}
    </div>
  );
};

const OrdersList = ({
  orders,
  selectedOrder,
  onSelect
}: {
  orders: DeliveryOrder[];
  selectedOrder: DeliveryOrder | null;
  onSelect: (orderId: string) => void;
}) => (
  <div className="stack-list">
    {orders.map((order) => (
      <button
        className={`order-card ${selectedOrder?.id === order.id ? "selected" : ""}`}
        key={order.id}
        onClick={() => onSelect(order.id)}
        style={{
          borderColor: `${orderStatusColor[order.status]}33`
        }}
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
);

const CustomersList = ({
  customers,
  expanded = false
}: {
  customers: Customer[];
  expanded?: boolean;
}) => (
  <div className="stack-list">
    {(expanded ? customers : customers.slice(0, 8)).map((customer) => (
      <div className="list-row static-row" key={customer.id}>
        <div>
          <strong>{customer.name}</strong>
          <span>{customer.totalOrders} pedidos</span>
          {customer.isCreditEnabled ? <small className="credit-flag">Fiado</small> : null}
        </div>
        <div className="list-meta">
          <strong>{formatCurrency(customer.totalSpent)}</strong>
          <span>{customer.phone}</span>
        </div>
      </div>
    ))}
  </div>
);

const OrderDetailCard = ({
  selectedOrder,
  tracking,
  trackingUrl,
  onGenerateTracking,
  onPreparing,
  onDelivered,
  onCancelled
}: {
  selectedOrder: DeliveryOrder | null;
  tracking: LiveTracking | null;
  trackingUrl: string;
  trackingBaseUrl: string;
  onGenerateTracking: () => Promise<void>;
  onPreparing: () => void;
  onDelivered: () => void;
  onCancelled: () => void;
}) => (
  <article className="panel-card detail-card">
    <div className="section-title">Detalle del Pedido</div>
    {selectedOrder ? (
      <>
        <div className="detail-header">
          <strong>Pedido #{selectedOrder.orderNumber}</strong>
          <span
            className="status-pill"
            style={{
              backgroundColor: `${orderStatusColor[selectedOrder.status]}20`,
              color: orderStatusColor[selectedOrder.status]
            }}
          >
            {orderStatusLabel[selectedOrder.status]}
          </span>
        </div>

        <div className="detail-group">
          <div className="detail-line">
            <span>Cliente</span>
            <strong>{selectedOrder.customerName}</strong>
          </div>
          <div className="detail-line">
            <span>Direccion</span>
            <strong>{selectedOrder.address}</strong>
          </div>
          <div className="detail-line">
            <span>Pago</span>
            <strong>{selectedOrder.paymentMethod}</strong>
          </div>
          <div className="detail-line">
            <span>Repartidor</span>
            <strong>{selectedOrder.assignedCourierName ?? "Sin asignar"}</strong>
          </div>
        </div>

        <div className="detail-group">
          <span className="subheading">Productos</span>
          {selectedOrder.items.map((item) => (
            <div className="detail-line" key={item.id}>
              <span>
                {item.quantity} x {item.name}
              </span>
              <strong>{formatCurrency(item.subtotal)}</strong>
            </div>
          ))}
        </div>

        <div className="detail-group">
          <div className="detail-line">
            <span>Total</span>
            <strong>{formatCurrency(selectedOrder.total)}</strong>
          </div>
          <div className="detail-line">
            <span>Ultima actualizacion</span>
            <strong>{formatCompactDateTime(selectedOrder.updatedAt)}</strong>
          </div>
        </div>

        <div className="tracking-box">
          <div className="tracking-box__title">
            <MapPinned size={16} />
            Seguimiento en tiempo real
          </div>
          {tracking ? (
            <>
              <strong>
                {tracking.lat.toFixed(5)}, {tracking.lng.toFixed(5)}
              </strong>
              <span>Actualizado {formatCompactDateTime(tracking.updatedAt)}</span>
            </>
          ) : (
            <span>Sin tracking activo para este pedido.</span>
          )}
        </div>

        <div className="detail-actions">
          <button className="action-button action-button--light" onClick={() => void onGenerateTracking()}>
            Generar seguimiento cliente
          </button>
          <button className="action-button action-button--light" onClick={onPreparing}>
            Preparando
          </button>
          <button className="action-button action-button--primary" onClick={onDelivered}>
            Entregar Pedido
          </button>
          <button className="action-button action-button--danger" onClick={onCancelled}>
            Cancelar Pedido
          </button>
        </div>
        {trackingUrl ? <div className="tracking-link-box">{trackingUrl}</div> : null}
      </>
    ) : (
      <div className="empty-state">Selecciona un pedido para ver el detalle.</div>
    )}
  </article>
);
