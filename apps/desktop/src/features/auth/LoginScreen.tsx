import { FormEvent, useEffect, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import { assetUrl } from "@/lib/assetUrl";

type Props = {
  onSubmit: (email: string, password: string) => Promise<unknown>;
};

export const LoginScreen = ({ onSubmit }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const autofillNonce = useRef(`hunix-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    setEmail("");
    setPassword("");
    if (emailRef.current) emailRef.current.value = "";
    if (passwordRef.current) passwordRef.current.value = "";
  }, []);

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
          <img src={assetUrl("brand/hunix-icon.png")} alt="Hunix" />
          <div>
            <h1>Hunix</h1>
          </div>
        </div>

        <form autoComplete="off" className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo
            <input
              autoComplete="off"
              name={`${autofillNonce.current}-email`}
              placeholder="Ingresa tu correo"
              ref={emailRef}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
            />
          </label>

          <label>
            Contrasena
            <input
              autoComplete="new-password"
              name={`${autofillNonce.current}-password`}
              placeholder="Ingresa tu contrasena"
              ref={passwordRef}
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
