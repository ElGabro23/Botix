import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { assetUrl } from "@/lib/assetUrl";

type Props = {
  onSubmit: (email: string, password: string) => Promise<unknown>;
};

export const LoginScreen = ({ onSubmit }: Props) => {
  const [email, setEmail] = useState("admin@botix.cl");
  const [password, setPassword] = useState("Botix123!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit(email, password);
    } catch (caughtError) {
      if (caughtError instanceof FirebaseError) {
        if (
          caughtError.code === "auth/invalid-credential" ||
          caughtError.code === "auth/wrong-password" ||
          caughtError.code === "auth/invalid-login-credentials" ||
          caughtError.code === "auth/user-not-found"
        ) {
          setError("Correo o contrasena incorrectos.");
        } else if (caughtError.code === "auth/network-request-failed") {
          setError("No se pudo conectar con Firebase. Revisa internet o la configuracion.");
        } else {
          setError(`No fue posible iniciar sesion. ${caughtError.code}`);
        }
      } else {
        setError("No fue posible iniciar sesion. Revisa tus credenciales en Firebase.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src={assetUrl("brand/hunix.jpeg")} alt="Hunix" />
          <div>
            <h1>Hunix</h1>
            <p>Plataforma multi-rubro para delivery, caja y operacion diaria</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>

          <label>
            Contrasena
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
            />
          </label>

          {error ? <div className="error-banner">{error}</div> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Entrando..." : "Ingresar al panel"}
          </button>
        </form>
      </div>
    </div>
  );
};
