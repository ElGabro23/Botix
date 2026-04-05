# BOTIX

Plataforma profesional para botillerias con:

- `apps/desktop`: app principal Windows con Electron + React
- `apps/driver`: app Android para repartidores con Expo + React Native
- `apps/tracking-web`: seguimiento cliente
- `packages/shared`: tipos y estados compartidos
- `packages/firebase-core`: helpers reutilizables
- `functions`: Cloud Functions para tracking y notificaciones
- `firestore`: reglas e indices

## Arranque

1. Copiar `.env.example` a `.env`
2. Completar credenciales Firebase Web para escritorio, Android y tracking
3. Configurar `GOOGLE_APPLICATION_CREDENTIALS` con una service account si usaras seed o deploy local
4. Instalar dependencias con `npm install`
5. Ejecutar seed base con `npm run seed -w functions`
6. Ejecutar `npm run dev:desktop`
7. Ejecutar `npm run dev:driver`
8. Ejecutar `npm run dev:tracking`
9. Desplegar con `firebase deploy`

## Credenciales seed

- Admin: `admin@botix.cl` / `Botix123!`
- Caja: `caja@botix.cl` / `Botix123!`
- Repartidor: `driver@botix.cl` / `Botix123!`

## Proyecto Firebase actual

- Project ID: `botix-e493b`
- Auth domain: `botix-e493b.firebaseapp.com`
- Tracking local por defecto: `http://localhost:5174`

## Onboarding automatizado

Con una service account configurada en `GOOGLE_APPLICATION_CREDENTIALS`, puedes sembrar Firestore sin entrar a la consola:

`npm run seed:firestore`

Variables opcionales:

- `BOTIX_BUSINESS_ID`
- `BOTIX_TRACKING_BASE_URL`

## Flujo real implementado

1. Escritorio crea el pedido en Firestore.
2. Escritorio asigna repartidor.
3. Functions sincroniza carga del courier y notifica por FCM si hay tokens.
4. Android escucha pedidos asignados en tiempo real.
5. Repartidor marca `en_route` y empieza tracking.
6. `liveTracking` se refleja en escritorio y en `trackingSessions`.
7. Al entregar o cancelar se cierra tracking y el courier vuelve a disponible.
