import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { useAuthSession } from "@/features/auth/useAuthSession";
import { assetUrl } from "@/lib/assetUrl";

export const App = () => {
  const session = useAuthSession();

  if (session.loading) {
    return <div className="splash-screen">Cargando BOTIX...</div>;
  }

  if (!session.profile) {
    return <LoginScreen onSubmit={session.signIn} />;
  }

  const isSuperAdmin = session.profile.role === "superadmin";
  const isBlocked = !isSuperAdmin && session.business && !session.business.accessEnabled;

  if (isBlocked) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <img src={assetUrl("brand/botix.jpg")} alt="Botix" />
            <div>
              <h1>BOTIX</h1>
              <p>Acceso suspendido</p>
            </div>
          </div>
          <div className="error-banner" style={{ marginTop: 20 }}>
            La suscripcion de este negocio esta {session.business?.subscriptionStatus ?? "suspendida"} y el acceso operativo fue bloqueado.
          </div>
          <p style={{ color: "#6b7892", marginTop: 16 }}>
            Regulariza el pago para reactivar el sistema. Si necesitas ayuda, contacta a soporte.
          </p>
          <button className="primary-button" onClick={() => void session.signOut()} type="button">
            Salir
          </button>
        </div>
      </div>
    );
  }

  return <DashboardScreen user={session.profile} business={session.business} onSignOut={session.signOut} />;
};
