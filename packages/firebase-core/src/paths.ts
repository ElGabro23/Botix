export const businessPath = (businessId: string) => `businesses/${businessId}`;
export const ordersPath = (businessId: string) => `${businessPath(businessId)}/deliveryOrders`;
export const customersPath = (businessId: string) => `${businessPath(businessId)}/customers`;
export const couriersPath = (businessId: string) => `${businessPath(businessId)}/couriers`;
export const notificationsPath = (businessId: string) => `${businessPath(businessId)}/notifications`;
export const settingsPath = (businessId: string) => `${businessPath(businessId)}/settings`;
export const liveTrackingPath = (businessId: string) => `${businessPath(businessId)}/liveTracking`;

