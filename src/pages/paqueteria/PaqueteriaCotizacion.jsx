// src/pages/paqueteria/PaqueteriaCotizacion.jsx
import { useState } from "react";
import { perfilEstandarDestino, librasCotPaq, totalProductosCotPaq, totalEnvioCotPaq, totalCotPaq, totalItemCotPaq } from "../../utils/calculosPaqueteria";
import { generarPDFCotizacionPaq } from "../../services/pdfService";
import TarifaSelect from "../../components/TarifaSelect";
import Select from "../../components/Select";

const itemVacio = () => ({ descripcion: "", peso: "", costo: "", unidades: "1" });

export default function PaqueteriaCotizacion({ tarifas, empresa, mostrarToast }) {
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [destino, setDestino] = useState("Ometepe");
  const [tarifaPerfil, setTarifaPerfil] = useState("ometepe_estandar");
  const [tarifaPersonalizada, setTarifaPersonalizada] = useState("");
  const [tipoEnvio, setTipoEnvio] = useState("Marítimo");
  const [items, setItems] = useState([itemVacio()]);

  const cambiarDestino = (nuevo) => {
    setDestino(nuevo);
    setTarifaPerfil((actual) => (actual === "personalizada" ? actual : perfilEstandarDestino(nuevo)));
  };

  const cambiarItem = (i, campo, valor) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const agregarItem = () => setItems((prev) => [...prev, itemVacio()]);
  const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const form = { destino, tarifaPerfil, tipoEnvio, tarifaPersonalizada };

  const descargar = () => {
    if (items.every((i) => !i.descripcion.trim())) {
      mostrarToast("Agrega al menos un producto para cotizar.", "warning");
      return;
    }
    generarPDFCotizacionPaq({ cliente, contacto, items, form, tarifas, empresa });
  };

  return (
    <div className="card">
      <h3>Cotización de paquetería</h3>
      <p>Estimación rápida — no genera envío ni tracking, solo un PDF de referencia para el cliente.</p>

      <div className="form-grid mt-16">
        <label>
          <span className="field-label">Cliente</span>
          <input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </label>
        <label>
          <span className="field-label">Contacto</span>
          <input className="input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
        </label>
        <Select label="Destino" value={destino} onChange={(e) => cambiarDestino(e.target.value)} options={["Ometepe", "Managua"]} />
        <TarifaSelect tarifas={tarifas} destino={destino} value={tarifaPerfil} onChange={setTarifaPerfil} />
        <Select label="Tipo de envío" value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)} options={["Marítimo", "Aéreo"]} />
      </div>

      <h3 className="mt-16">Productos a cotizar</h3>
      {items.map((it, i) => (
        <div className="product-row" key={i}>
          <input className="input" placeholder="Descripción" value={it.descripcion} onChange={(e) => cambiarItem(i, "descripcion", e.target.value)} />
          <input className="input" type="number" placeholder="Unidades" value={it.unidades} onChange={(e) => cambiarItem(i, "unidades", e.target.value)} />
          <input className="input" type="number" placeholder="Costo $" value={it.costo} onChange={(e) => cambiarItem(i, "costo", e.target.value)} />
          <input className="input" type="number" placeholder="Peso lb" value={it.peso} onChange={(e) => cambiarItem(i, "peso", e.target.value)} />
          <span className="badge badge-neutral text-right">${totalItemCotPaq(it).toFixed(2)}</span>
          <button type="button" className="btn btn-danger" onClick={() => quitarItem(i)}>Quitar</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={agregarItem}>+ Agregar producto</button>

      <div className="grid-4 mt-16">
        <div className="metric"><b>Peso total</b><span className="metric-value">{librasCotPaq(items).toFixed(1)} lb</span></div>
        <div className="metric"><b>Productos</b><span className="metric-value">${totalProductosCotPaq(items).toFixed(2)}</span></div>
        <div className="metric"><b>Envío estimado</b><span className="metric-value">${totalEnvioCotPaq(tarifas, form, items).toFixed(2)}</span></div>
        <div className="metric"><b>Total estimado</b><span className="metric-value">${totalCotPaq(tarifas, form, items).toFixed(2)}</span></div>
      </div>

      <button className="btn btn-primary mt-16" type="button" onClick={descargar}>Descargar cotización PDF</button>
    </div>
  );
}
