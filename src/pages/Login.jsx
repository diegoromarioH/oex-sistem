// src/pages/Login.jsx
import { useState } from "react";
import logo from "../assets/logo.svg";

export default function Login({ onLogin, onLogout, bloqueado = false, errorInicial = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(errorInicial);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  };

  if (bloqueado) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src={logo} alt="OEX" />
          <h2>Acceso restringido</h2>
          <p>{errorInicial || "Tu cuenta no tiene permiso para entrar al sistema."}</p>
          <button className="btn btn-primary" type="button" onClick={onLogout}>
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={enviar}>
        <img src={logo} alt="OEX" />
        <h2>OEX Sistema</h2>
        <p>Inicia sesión para continuar</p>
        <label>
          <span className="field-label">Correo electrónico</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <span className="field-label">Contraseña</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <div role="alert">{error && <span className="badge badge-danger">{error}</span>}</div>
        <button className="btn btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
