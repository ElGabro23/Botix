import type { OrderStatus } from "./domain";

export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: "Pendiente",
  preparing: "Preparando",
  assigned: "Asignado",
  en_route: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
  incident: "Incidencia"
};

export const orderStatusColor: Record<OrderStatus, string> = {
  pending: "#f6c453",
  preparing: "#4d8dff",
  assigned: "#8166ff",
  en_route: "#3f9bff",
  delivered: "#54b07a",
  cancelled: "#ef6b6b",
  incident: "#ff9361"
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(value);

export const formatCompactDateTime = (value?: string) => {
  if (!value) return "Sin dato";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
};

