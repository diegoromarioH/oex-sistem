export default function Toast({ toast }) {
  const esError = toast?.tipo === "error";
  const contenido = toast && (
    <div className={`toast ${esError ? "toast-error" : toast.tipo === "warning" ? "toast-warning" : ""}`}>
      <span>{toast.mensaje}</span>
    </div>
  );

  return (
    <>
      <div role="status" aria-atomic="true">{!esError && contenido}</div>
      <div role="alert" aria-atomic="true">{esError && contenido}</div>
    </>
  );
}
