import { FormEvent, useState } from "react";

type Props = {
  onSubmit: (email: string, password: string) => Promise<unknown>;
};

export const LoginScreen = ({ onSubmit }: Props) => {
  const [email, setEmail] = useState("admin@botix.cl");
  const [password, setPassword] = useState("123456");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit(email, password);
    } catch {
      setError("No fue posible iniciar sesion. Revisa tus credenciales en Firebase.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/brand/botix.jpg" alt="Botix" />
          <div>
            <h1>BOTIX</h1>
            <p>Sistema para botillerias con delivery en tiempo real</p>
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
