// src/pages/Login.jsx
import { useState } from "react";
import logo from "../assets/logo.svg";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={enviar}>
        <img src={logo} alt="OEX" />
        <h2>OEX Sistema</h2>
        <p>Inicia sesión para continuar</p>
        <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <span className="badge badge-danger">{error}</span>}
        <button className="btn btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
