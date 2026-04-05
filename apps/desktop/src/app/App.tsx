import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { useAuthSession } from "@/features/auth/useAuthSession";

export const App = () => {
  const session = useAuthSession();

  if (session.loading) {
    return <div className="splash-screen">Cargando BOTIX...</div>;
  }

  if (!session.profile) {
    return <LoginScreen onSubmit={session.signIn} />;
  }

  return <DashboardScreen user={session.profile} onSignOut={session.signOut} />;
};
