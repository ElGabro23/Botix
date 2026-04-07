import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { TrackingSession } from "@botix/shared";
import { formatCompactDateTime, orderStatusLabel } from "@botix/shared";
import { createFirebaseClient } from "@botix/firebase-core";
import { assetUrl } from "./lib/assetUrl";

const fallbackConfig = {
  apiKey: "AIzaSyBIy_RMiEIyYlZWYiuo1UdQliTln4smHx8",
  authDomain: "botix-e493b.firebaseapp.com",
  projectId: "botix-e493b",
  storageBucket: "botix-e493b.firebasestorage.app",
  messagingSenderId: "213505703707",
  appId: "1:213505703707:web:798a040c888c6b58e95dbe",
  measurementId: "G-RXFY7ZGHVY"
} as const;

const firebaseClient = createFirebaseClient({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? fallbackConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? fallbackConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? fallbackConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? fallbackConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? fallbackConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? fallbackConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? fallbackConfig.measurementId
});

export const TrackingApp = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token"), []);
  const [session, setSession] = useState<TrackingSession | null>(null);
  const hasCoordinates =
    typeof session?.lat === "number" &&
    Number.isFinite(session.lat) &&
    typeof session?.lng === "number" &&
    Number.isFinite(session.lng);
  const mapBounds = useMemo(() => {
    if (!hasCoordinates) return "";
    const offset = 0.0035;
    const left = session!.lng! - offset;
    const bottom = session!.lat! - offset;
    const right = session!.lng! + offset;
    const top = session!.lat! + offset;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${session!.lat!}%2C${session!.lng!}`;
  }, [hasCoordinates, session]);

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
          <img src={assetUrl("brand/botix.jpg")} alt="Botix" />
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
              {hasCoordinates ? (
                <>
                  <strong>
                    {session.lat!.toFixed(5)}, {session.lng!.toFixed(5)}
                  </strong>
                  <iframe
                    title="Mapa de seguimiento"
                    src={mapBounds}
                    style={{ width: "100%", height: 260, border: 0, borderRadius: 18 }}
                    loading="lazy"
                  />
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
