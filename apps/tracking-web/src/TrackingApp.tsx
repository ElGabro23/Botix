import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { TrackingSession } from "@botix/shared";
import { formatCompactDateTime, orderStatusLabel } from "@botix/shared";
import { createFirebaseClient } from "@botix/firebase-core";

const firebaseClient = createFirebaseClient({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
});

export const TrackingApp = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token"), []);
  const [session, setSession] = useState<TrackingSession | null>(null);

  useEffect(() => {
    if (!token) return;

    return onSnapshot(doc(firebaseClient.db, "trackingSessions", token), (snap) => {
      setSession(snap.exists() ? ({ id: snap.id, ...snap.data() } as TrackingSession) : null);
    });
  }, [token]);

  return (
    <main className="tracking-shell">
      <section className="tracking-card">
        <div className="brand">
          <img src="/brand/botix.jpg" alt="Botix" />
          <div>
            <strong>BOTIX Tracking</strong>
            <span>Seguimiento en tiempo real</span>
          </div>
        </div>

        {!token ? <p>Falta el token de seguimiento.</p> : null}
        {token && !session ? <p>Buscando pedido activo...</p> : null}

        {session ? (
          <>
            <h1>Pedido en curso</h1>
            <div className="tracking-line">
              <span>Cliente</span>
              <strong>{session.customerName}</strong>
            </div>
            <div className="tracking-line">
              <span>Estado</span>
              <strong>{orderStatusLabel[session.status]}</strong>
            </div>
            <div className="tracking-line">
              <span>Repartidor</span>
              <strong>{session.courierName ?? "Asignando"}</strong>
            </div>
            <div className="tracking-line">
              <span>Ultima actualizacion</span>
              <strong>{formatCompactDateTime(session.updatedAt)}</strong>
            </div>

            <div className="map-placeholder">
              {session.lat && session.lng ? (
                <>
                  <strong>
                    {session.lat.toFixed(5)}, {session.lng.toFixed(5)}
                  </strong>
                  <span>Base lista para integrar mapa visual con Google Maps o Mapbox.</span>
                </>
              ) : (
                <span>El repartidor aun no comparte ubicacion.</span>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
};

