// src/components/Toast.jsx
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tipo === "error" ? "toast-error" : toast.tipo === "warning" ? "toast-warning" : ""}`}>
      <span>{toast.mensaje}</span>
    </div>
  );
}
