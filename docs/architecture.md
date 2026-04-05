# Arquitectura BOTIX

## Capas

- `apps/desktop`: operacion del local sobre Windows.
- `apps/driver`: operacion del repartidor en Android.
- `apps/tracking-web`: seguimiento cliente por link seguro.
- `packages/shared`: contratos comunes para evitar drift entre apps.
- `functions`: automatizacion segura de tracking y notificaciones.

## Modelo Firestore

- `users/{userId}`
- `businesses/{businessId}`
- `businesses/{businessId}/settings/{settingId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/couriers/{courierId}`
- `businesses/{businessId}/deliveryOrders/{orderId}`
- `businesses/{businessId}/liveTracking/{orderId}`
- `businesses/{businessId}/notifications/{notificationId}`
- `trackingSessions/{token}`

## Principios

- Separacion por negocio desde la raiz del dominio operativo.
- Repartidor con permisos minimos.
- Tracking cliente desacoplado con token aleatorio y lectura puntual.
- Estado y tracking via listeners en tiempo real de Firestore.
- Tipado comun para escritorio, Android y funciones.
