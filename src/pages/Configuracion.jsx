// src/pages/Configuracion.jsx
import { useEffect, useState } from "react";
import PageTitle from "../components/PageTitle";
import { reiniciarDatosOperativos, reiniciarDatosFinancieros, confirmarAccionCritica } from "../services/coreService";
import { numero } from "../utils/numero";
import { formatoMoneda } from "../utils/moneda";
import { ESTADOS_LISTO_PARA_RETIRAR } from "../utils/estadosEnvio";

export default function Configuracion({ tarifas, setTarifas, empresa, setEmpresa, cuentasDinero = [], rol, tema, setTema, mostrarToast, cargarDatos }) {
  const [vista, setVista] = useState("tarifas");
  const [borrando, setBorrando] = useState(false);

  // ===== Tarifas: modo edición explícito =====
  // setTarifas() escribe a Supabase en cada llamada — antes se llamaba en
  // cada tecla, o sea cada letra era un guardado real. Ahora se edita un
  // borrador local; solo se guarda (una sola escritura) al confirmar.
  const [editandoTarifas, setEditandoTarifas] = useState(false);
  const [guardandoTarifas, setGuardandoTarifas] = useState(false);
  const [draftTarifas, setDraftTarifas] = useState(tarifas);
  useEffect(() => { if (!editandoTarifas) setDraftTarifas(tarifas); }, [tarifas, editandoTarifas]);

  const actualizarTarifaDraft = (key, campo, valor) => {
    setDraftTarifas((actual) => ({
      ...actual,
      [key]: { ...actual[key], [campo]: campo === "label" || campo === "destino" ? valor : Number(valor) }
    }));
  };

  const guardarTarifas = async () => {
    setGuardandoTarifas(true);
    try {
      await setTarifas(draftTarifas);
      mostrarToast("Tarifas guardadas.");
      setEditandoTarifas(false);
    } finally {
      setGuardandoTarifas(false);
    }
  };

  const cancelarTarifas = () => {
    setDraftTarifas(tarifas);
    setEditandoTarifas(false);
  };

  // ===== Empresa y documentos: mismo patrón =====
  const [editandoEmpresa, setEditandoEmpresa] = useState(false);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [draftEmpresa, setDraftEmpresa] = useState(empresa);
  useEffect(() => { if (!editandoEmpresa) setDraftEmpresa(empresa); }, [empresa, editandoEmpresa]);

  const actualizarEmpresaDraft = (campo, valor) => setDraftEmpresa({ ...draftEmpresa, [campo]: valor });
  const actualizarDireccionDraft = (punto, valor) =>
    setDraftEmpresa({ ...draftEmpresa, direccionesRetiro: { ...draftEmpresa.direccionesRetiro, [punto]: valor } });

  const cuentasBanco = cuentasDinero.filter((c) => c.tipo === "banco" && c.activa !== false);
  const cuentasEfectivo = cuentasDinero.filter((c) => c.tipo === "efectivo" && c.activa !== false);

  const guardarEmpresa = async () => {
    setGuardandoEmpresa(true);
    try {
      await setEmpresa(draftEmpresa);
      mostrarToast("Cambios guardados.");
      setEditandoEmpresa(false);
    } finally {
      setGuardandoEmpresa(false);
    }
  };

  const cancelarEmpresa = () => {
    setDraftEmpresa(empresa);
    setEditandoEmpresa(false);
  };

  const cambiarVista = (nueva) => {
    if (editandoTarifas) cancelarTarifas();
    if (editandoEmpresa) cancelarEmpresa();
    setVista(nueva);
  };

  const reiniciar = async (tipo, etiqueta) => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede reiniciar datos.", "error");
    if (!confirmarAccionCritica(`Vas a borrar TODOS los registros de ${etiqueta}. Esta acción no se puede deshacer.`)) return;
    setBorrando(true);
    try {
      const error = await reiniciarDatosOperativos(tipo);
      if (error) throw error;
      mostrarToast(`${etiqueta} reiniciado.`);
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo reiniciar.", "error");
    } finally {
      setBorrando(false);
    }
  };

  const reiniciarFinanzas = async () => {
    if (rol !== "admin") return mostrarToast("Solo un administrador puede reiniciar datos.", "error");
    if (!confirmarAccionCritica("Vas a borrar TODA la parte contable: gastos, ingresos, facturas y pagos a proveedores, libro diario, cortes de caja y balance de apertura. El saldo de tus cuentas de dinero se resetea a su saldo inicial. Esta acción no se puede deshacer.")) return;
    setBorrando(true);
    try {
      const error = await reiniciarDatosFinancieros();
      if (error) throw error;
      mostrarToast("Finanzas reiniciada. Vuelve a definir tu balance de apertura cuando estés listo.");
      cargarDatos();
    } catch (err) {
      mostrarToast(err.message || "No se pudo reiniciar.", "error");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="page">
      <PageTitle title="Configuración" subtitle="Tarifas, empresa, apariencia y mantenimiento">
        <button className={`nav-btn ${vista === "tarifas" ? "active" : ""}`} onClick={() => cambiarVista("tarifas")}>Tarifas</button>
        <button className={`nav-btn ${vista === "empresa" ? "active" : ""}`} onClick={() => cambiarVista("empresa")}>Empresa y documentos</button>
        <button className={`nav-btn ${vista === "apariencia" ? "active" : ""}`} onClick={() => cambiarVista("apariencia")}>Apariencia</button>
        {rol === "admin" && <button className={`nav-btn ${vista === "mantenimiento" ? "active" : ""}`} onClick={() => cambiarVista("mantenimiento")}>Mantenimiento</button>}
      </PageTitle>

      {vista === "tarifas" && (
      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          <div>
            <h3>Tarifas por destino</h3>
            <p>Estas tarifas se usan en SHEIN y Paquetería, ya filtradas automáticamente según destino y tipo (marítimo/aéreo).</p>
          </div>
          {rol === "admin" && (
            <div className="segment">
              {editandoTarifas ? (
                <>
                  <button className="btn btn-ghost" disabled={guardandoTarifas} onClick={cancelarTarifas}>Cancelar</button>
                  <button className="btn btn-primary" disabled={guardandoTarifas} onClick={guardarTarifas}>{guardandoTarifas ? "Guardando..." : "Guardar"}</button>
                </>
              ) : (
                <button className="btn" onClick={() => setEditandoTarifas(true)}>Editar</button>
              )}
            </div>
          )}
        </div>
        {rol !== "admin" && <div className="info-box">Solo un administrador puede editar las tarifas. Las ves aquí solo de referencia.</div>}
        <div className="list mt-16">
          {Object.entries(draftTarifas).map(([key, t]) => (
            <div key={key} className="row-card">
              <div className="form-grid" style={{ flex: 1 }}>
                <label><span className="field-label">Nombre</span><input className="input" value={t.label} disabled={!editandoTarifas} onChange={(e) => actualizarTarifaDraft(key, "label", e.target.value)} /></label>
                <label>
                  <span className="field-label">Destino</span>
                  <select className="input" value={t.destino} disabled={!editandoTarifas} onChange={(e) => actualizarTarifaDraft(key, "destino", e.target.value)}>
                    <option>Ometepe</option><option>Managua</option>
                  </select>
                </label>
                <label><span className="field-label">Marítimo $/lb</span><input className="input" type="number" value={t.maritimo} disabled={!editandoTarifas} onChange={(e) => actualizarTarifaDraft(key, "maritimo", e.target.value)} /></label>
                <label><span className="field-label">Aéreo $/lb</span><input className="input" type="number" value={t.aereo} disabled={!editandoTarifas} onChange={(e) => actualizarTarifaDraft(key, "aereo", e.target.value)} /></label>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {vista === "empresa" && (
      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          <div>
            <h3>Empresa y documentos</h3>
            <p>Esta información aparece en el pie de página de los PDFs (recibos y cotizaciones) y en el tipo de cambio mostrado al cliente.</p>
          </div>
          <div className="segment">
            {editandoEmpresa ? (
              <>
                <button className="btn btn-ghost" disabled={guardandoEmpresa} onClick={cancelarEmpresa}>Cancelar</button>
                <button className="btn btn-primary" disabled={guardandoEmpresa} onClick={guardarEmpresa}>{guardandoEmpresa ? "Guardando..." : "Guardar"}</button>
              </>
            ) : (
              <button className="btn" onClick={() => setEditandoEmpresa(true)}>Editar</button>
            )}
          </div>
        </div>
        <div className="form-grid mt-16">
          <label><span className="field-label">Nombre</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.nombre} onChange={(e) => actualizarEmpresaDraft("nombre", e.target.value)} /></label>
          <label><span className="field-label">Eslogan</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.eslogan} onChange={(e) => actualizarEmpresaDraft("eslogan", e.target.value)} /></label>
          <label><span className="field-label">Teléfono / WhatsApp</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.telefono} onChange={(e) => actualizarEmpresaDraft("telefono", e.target.value)} /></label>
          <label><span className="field-label">Correo</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.correo} onChange={(e) => actualizarEmpresaDraft("correo", e.target.value)} /></label>
          <label><span className="field-label">Sitio web</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.web} onChange={(e) => actualizarEmpresaDraft("web", e.target.value)} /></label>
          <label><span className="field-label">Instagram</span><input className="input" disabled={!editandoEmpresa} value={draftEmpresa.instagram} onChange={(e) => actualizarEmpresaDraft("instagram", e.target.value)} /></label>
          <label>
            <span className="field-label">Tipo de cambio (C$ por US$1)</span>
            <input className="input" type="number" step="0.01" disabled={!editandoEmpresa} value={draftEmpresa.tipoCambio} onChange={(e) => actualizarEmpresaDraft("tipoCambio", Number(e.target.value))} />
          </label>
        </div>

        <h3 className="mt-16">Direcciones de los puntos de retiro</h3>
        <p>Se incluyen en el mensaje de WhatsApp "Listo para retirar" cuando el envío llega a ese punto.</p>
        <div className="form-grid mt-16">
          {ESTADOS_LISTO_PARA_RETIRAR.map((punto) => (
            <label key={punto}>
              <span className="field-label">{punto}</span>
              <input className="input" placeholder="Dirección exacta" disabled={!editandoEmpresa} value={draftEmpresa.direccionesRetiro?.[punto] || ""} onChange={(e) => actualizarDireccionDraft(punto, e.target.value)} />
            </label>
          ))}
        </div>

        <h3 className="mt-16">Cuentas de dinero</h3>
        <p>Se gestionan en <b>Finanzas → Cuentas</b> — aquí solo se muestran de referencia. Estas son las que aparecen como opción al saldar un envío o pagar un proveedor.</p>
        <div className="list mt-16">
          {cuentasBanco.map((c) => (
            <div key={c.id} className="row-card">
              <div><b>{c.nombre}</b> <span className="badge badge-neutral">Banco</span></div>
              <b>{formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)}</b>
            </div>
          ))}
          {cuentasEfectivo.map((c) => (
            <div key={c.id} className="row-card">
              <div><b>{c.nombre}</b> <span className="badge badge-neutral">Efectivo</span></div>
              <b>{formatoMoneda(c.saldoActual ?? c.saldo_actual, c.moneda)}</b>
            </div>
          ))}
          {cuentasBanco.length === 0 && cuentasEfectivo.length === 0 && (
            <p>Todavía no has creado ninguna cuenta de dinero — ve a Finanzas → Cuentas para agregar tu primera cuenta de banco o caja.</p>
          )}
        </div>
      </div>
      )}

      {vista === "apariencia" && (
      <div className="card">
        <h3>Apariencia</h3>
        <div className="segment mt-16">
          <button className={`segment-btn ${tema === "light" ? "active" : ""}`} onClick={() => setTema("light")}>Claro</button>
          <button className={`segment-btn ${tema === "dark" ? "active" : ""}`} onClick={() => setTema("dark")}>Oscuro</button>
        </div>
      </div>
      )}

      {vista === "mantenimiento" && rol === "admin" && (
      <div className="card">
        <h3>Mantenimiento (solo admin)</h3>
        <p>Borra registros operativos completos. No afecta clientes ni auditoría.</p>
        <div className="segment mt-16">
          <button className="btn btn-danger" disabled={borrando} onClick={() => reiniciar("pedidos", "Pedidos SHEIN")}>Reiniciar pedidos SHEIN</button>
          <button className="btn btn-danger" disabled={borrando} onClick={() => reiniciar("envios", "Envíos")}>Reiniciar envíos</button>
          <button className="btn btn-danger" disabled={borrando} onClick={() => reiniciar("prealertas", "Prealertas")}>Reiniciar prealertas</button>
          <button className="btn btn-danger" disabled={borrando} onClick={() => reiniciar("gastos", "Gastos")}>Reiniciar gastos</button>
        </div>

        <h3 className="mt-16">Finanzas / Contabilidad</h3>
        <p>
          Borra gastos, ingresos, facturas y pagos a proveedores, el libro diario completo, los cortes de caja y el balance de apertura.
          Tus cuentas de dinero y el catálogo de cuentas <b>no se borran</b> (son configuración) — solo el saldo de cada cuenta de dinero
          vuelve a su saldo inicial. Útil para dejar limpio todo lo de prueba antes de arrancar de verdad.
        </p>
        <p><small>Si también quieres borrar los envíos y trackings de prueba, usa además "Reiniciar envíos" y "Reiniciar prealertas" de arriba.</small></p>
        <div className="segment mt-16">
          <button className="btn btn-danger" disabled={borrando} onClick={reiniciarFinanzas}>Reiniciar Finanzas (contabilidad)</button>
        </div>
      </div>
      )}
    </div>
  );
}