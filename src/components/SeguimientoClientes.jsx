// src/components/SeguimientoClientes.jsx
// Panel del Dashboard para dar seguimiento a los envíos de cada cliente:
// en tránsito, listos para retirar, y con saldo pendiente. Reutiliza
// FormularioSaldarEnvio (el mismo que usa EnvioItem) para que el flujo de
// registrar el pago sea idéntico en toda la app.
import { useMemo, useState } from "react";
import { numero } from "../utils/numero";
import { categoriaEnvio, badgeEstado, CATEGORIA_TRANSITO, CATEGORIA_POR_RETIRAR } from "../utils/estadosEnvio";
import FormularioSaldarEnvio from "./FormularioSaldarEnvio";

const FilaEnvio = ({ envio, empresa, cuentasDinero, auth, mostrarToast, cargarDatos, permiteSaldar }) => (
  <div className="row-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
    <div className="page-title" style={{ margin: 0 }}>
      <div>
        <b>{envio.numero}</b> <span className={`badge ${badgeEstado(envio.estado)}`}>{envio.estado}</span>
        <p>{envio.cliente} · {envio.clienteCodigo || "Sin registrar"} · {envio.destino}</p>
      </div>
      <div className="stack-gap-sm text-right">
        <b>Saldo: ${numero(envio.saldo).toFixed(2)}</b>
        {permiteSaldar && (
        <FormularioSaldarEnvio envio={envio} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} />
        )}
      </div>
    </div>
  </div>
);

export default function SeguimientoClientes({ envios, empresa, cuentasDinero = [], auth, mostrarToast, cargarDatos }) {
  const [seccion, setSeccion] = useState("transito");

  const enTransito = useMemo(() => envios.filter((e) => categoriaEnvio(e.estado) === CATEGORIA_TRANSITO), [envios]);
  const porRetirar = useMemo(() => envios.filter((e) => categoriaEnvio(e.estado) === CATEGORIA_POR_RETIRAR), [envios]);
  const conSaldo = useMemo(() => envios.filter((e) => numero(e.saldo) > 0), [envios]);

  const listas = {
    transito: { titulo: "En tránsito", datos: enTransito, permiteSaldar: false },
    retirar: { titulo: "Por retirar", datos: porRetirar, permiteSaldar: true },
    saldo: { titulo: "Con saldo pendiente", datos: conSaldo, permiteSaldar: true }
  };

  const activa = listas[seccion];

  return (
    <div className="card">
      <div className="page-title" style={{ margin: 0 }}>
        <h3>Seguimiento de clientes</h3>
        <div className="segment">
          <button className={`nav-btn ${seccion === "transito" ? "active" : ""}`} onClick={() => setSeccion("transito")}>En tránsito ({enTransito.length})</button>
          <button className={`nav-btn ${seccion === "retirar" ? "active" : ""}`} onClick={() => setSeccion("retirar")}>Por retirar ({porRetirar.length})</button>
          <button className={`nav-btn ${seccion === "saldo" ? "active" : ""}`} onClick={() => setSeccion("saldo")}>Con saldo pendiente ({conSaldo.length})</button>
        </div>
      </div>

      <div className="list mt-16">
        {activa.datos.map((e) => (
          <FilaEnvio key={e.id} envio={e} empresa={empresa} cuentasDinero={cuentasDinero} auth={auth} mostrarToast={mostrarToast} cargarDatos={cargarDatos} permiteSaldar={activa.permiteSaldar} />
        ))}
        {activa.datos.length === 0 && <p>Sin envíos en esta categoría por ahora.</p>}
      </div>
    </div>
  );
}