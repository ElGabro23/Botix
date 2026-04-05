import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bike,
  FileText,
  LayoutGrid,
  MapPinned,
  PackageCheck,
  Users
} from "lucide-react";
import type { AppUser, CourierProfile, Customer, DaySummary, DeliveryOrder, LiveTracking } from "@botix/shared";
import { formatCompactDateTime, formatCurrency, orderStatusColor, orderStatusLabel } from "@botix/shared";
import {
  assignCourier,
  createOrder,
  createTrackingLink,
  subscribeCouriers,
  subscribeCustomers,
  subscribeDaySummary,
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

type Props = {
  user: AppUser;
  onSignOut: () => Promise<void>;
};

export const DashboardScreen = ({ user, onSignOut }: Props) => {
  const trackingBaseUrl = import.meta.env.VITE_TRACKING_BASE_URL ?? "https://tracking.example.com/";
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [couriers, setCouriers] = useState<CourierProfile[]>([]);
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
  const [trackingUrl, setTrackingUrl] = useState("");
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => subscribeOrders(user.businessId, setOrders), [user.businessId]);
  useEffect(() => subscribeCustomers(user.businessId, setCustomers), [user.businessId]);
  useEffect(() => subscribeCouriers(user.businessId, setCouriers), [user.businessId]);
  useEffect(() => subscribeDaySummary(user.businessId, setSummary), [user.businessId]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
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
    if (!draft.customerName || !draft.customerPhone || !draft.address) return;
    setCreating(true);
    try {
      await createOrder(user, draft);
      setDraft(initialDraft);
    } finally {
      setCreating(false);
    }
  };

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
          <span className="nav-item active">
            <LayoutGrid size={16} />
            Caja Meson
          </span>
          <span className="nav-item">
            <PackageCheck size={16} />
            Pedidos Delivery
          </span>
          <span className="nav-item">
            <Users size={16} />
            Clientes
          </span>
          <span className="nav-item">
            <Bike size={16} />
            Repartidores
          </span>
          <span className="nav-item">
            <FileText size={16} />
            Reportes
          </span>
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
            <button className="action-button action-button--primary">Cierre de Caja</button>
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
            <div className="stack-list">
              {orders.map((order) => (
                <button
                  className={`order-card ${selectedOrder?.id === order.id ? "selected" : ""}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
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
          </article>

          <article className="panel-card">
            <div className="section-title inline-title">
              Clientes
              <Users size={16} />
            </div>
            <div className="stack-list">
              {customers.map((customer) => (
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
          </article>
        </section>

        <section className="column">
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
                  <button
                    className="action-button action-button--light"
                    onClick={async () => {
                      const token = await createTrackingLink(user.businessId, selectedOrder.id);
                      setTrackingUrl(`${trackingBaseUrl.replace(/\/$/, "")}/?token=${token}`);
                    }}
                  >
                    Generar seguimiento cliente
                  </button>
                  <button
                    className="action-button action-button--light"
                    onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "preparing")}
                  >
                    Preparando
                  </button>
                  <button
                    className="action-button action-button--primary"
                    onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "delivered")}
                  >
                    Entregar Pedido
                  </button>
                  <button
                    className="action-button action-button--danger"
                    onClick={() => void updateOrderStatus(user.businessId, selectedOrder.id, "cancelled")}
                  >
                    Cancelar Pedido
                  </button>
                </div>
                {trackingUrl ? <div className="tracking-link-box">{trackingUrl}</div> : null}
              </>
            ) : (
              <div className="empty-state">Selecciona un pedido para ver el detalle.</div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
};
