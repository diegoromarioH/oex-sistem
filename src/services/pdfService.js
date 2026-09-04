// src/services/pdfService.js
// Generacion de PDFs (jsPDF) para pedidos SHEIN, cotizacion de paqueteria,
// detalle de envio/recibo y reporte financiero. Usa los colores y
// proporciones del Manual de Identidad OEX v1.0: Naranja #F4562D,
// Navy #0F2445, con la proporcion recomendada 60% neutros / 30% navy /
// 10% naranja como acento.

import jsPDF from "jspdf";
import { numero } from "../utils/numero";
import logoOEX from "../assets/LOGOOEX.png";
import { notaShein, resumenShein, taxProductoShein, totalProductoShein } from "../utils/calculosShein";
import {
  tarifaPorTipoEnvio, calcularTotalesTrackings,
  costoItemCotPaq, taxItemCotPaq, totalItemCotPaq, librasCotPaq, totalCotPaq, totalEnvioCotPaq
} from "../utils/calculosPaqueteria";

// Paleta oficial (Manual de Identidad OEX v1.0, sección 06 — Color)
const NARANJA = [244, 86, 45];       // #F4562D
const NAVY = [15, 36, 69];           // #0F2445
const NAVY_CLARO = [44, 66, 103];    // #2C4267
const GRAFITO = [34, 37, 43];        // #22252B
const GRIS_MEDIO = [138, 143, 152];  // #8A8F98
const GRIS_CLARO = [216, 218, 221];  // #D8DADD
const PAPEL = [247, 246, 243];       // #F7F6F3
const BLANCO = [255, 255, 255];

const formatoFecha = (iso) =>
  new Date(iso || Date.now()).toLocaleDateString("es-NI", { year: "numeric", month: "long", day: "numeric" });

// ===== Header con identidad de marca =====
const pdfHeader = (doc, { titulo, numeroDoc, fechaISO, empresa }) => {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 32, "F");
  doc.setFillColor(...NARANJA);
  doc.rect(0, 0, 210, 2.5, "F");

  // Isotipo simplificado: círculo naranja + wordmark
 doc.addImage(
  logoOEX,
  "PNG",
  7,   // X
  4,    // Y
  27,   // ancho
  24    // alto
);

  doc.setTextColor(...BLANCO);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 196, 13, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (numeroDoc) doc.text(`No. ${numeroDoc}`, 196, 20, { align: "right" });
  doc.text(`Fecha de emisión: ${formatoFecha(fechaISO)}`, 196, 26, { align: "right" });
  doc.setTextColor(...GRAFITO);
};

// ===== Línea de tipo de cambio, cuando la empresa lo tiene configurado =====
const pdfLineaTipoCambio = (doc, y, totalUSD, empresa) => {
  const tc = numero(empresa?.tipoCambio);
  if (!tc) return y;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAFITO);
  doc.text(`Tipo de cambio: C$${tc.toFixed(2)} por US$1.00`, 14, y);
  doc.text(`Total en córdobas: C$${(totalUSD * tc).toFixed(2)}`, 14, y + 5);
  doc.setTextColor(...GRAFITO);
  return y + 12;
};

// ===== Footer con info completa de la empresa =====
const pdfFooter = (doc, nota, empresa) => {
  const y = 265;
  doc.setDrawColor(...GRIS_CLARO);
  doc.line(14, y, 196, y);

  doc.setFontSize(8);
  doc.setTextColor(...GRIS_MEDIO);
  doc.text(nota || "", 14, y + 6, { maxWidth: 182 });

  const contacto = [
    empresa?.telefono ? `Tel/WhatsApp: ${empresa.telefono}` : null,
    empresa?.correo ? `Correo: ${empresa.correo}` : null,
    empresa?.web ? empresa.web : null,
    empresa?.instagram ? `IG: ${empresa.instagram}` : null
  ].filter(Boolean).join("   ·   ");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`${empresa?.nombre || "OEX"} — Estados Unidos · Nicaragua`, 14, 285);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS_MEDIO);
  if (contacto) doc.text(contacto, 14, 290);
  doc.text("Documento generado por OEX Nicaragua.", 14, 295);
};

const pdfSaltoPagina = (doc, y, minimo = 45) => {
  if (y > 297 - minimo) {
    doc.addPage();
    return 20;
  }
  return y;
};

// ===== SHEIN — recibo de pedido =====
export const generarPDFShein = (pedido, ctx, empresa) => {
  const doc = new jsPDF();
  pdfHeader(doc, { titulo: "RECIBO DE PEDIDO SHEIN", numeroDoc: pedido.numero, fechaISO: pedido.fechaISO, empresa });

  let y = 42;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Cliente: ${pedido.cliente}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Contacto: ${pedido.contacto}`, 14, y + 6);
  doc.text(`Código de cliente: ${pedido.clienteCodigo || "—"}`, 14, y + 12);
  doc.setFont("helvetica", "bold");
  doc.text(`Estado: ${pedido.estado}`, 130, y);
  y += 22;

  doc.setFillColor(...PAPEL);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Descripción", 17, y);
  doc.text("Uds.", 130, y);
  doc.text("Costo", 155, y);
  doc.text("Total", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  (pedido.productos || []).forEach((p) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(String(p.descripcion || "").slice(0, 48), 17, y);
    doc.text(String(p.unidades || 1), 130, y);
    doc.text(`$${numero(p.costo_prenda).toFixed(2)}`, 155, y);
    doc.text(`$${numero(p.total_producto).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });

  y += 4;
  doc.setDrawColor(...GRIS_CLARO);
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(`Abono: $${numero(pedido.abono).toFixed(2)}`, 130, y);
  doc.text(`Saldo: $${numero(pedido.saldo).toFixed(2)}`, 130, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  doc.text(`Total: $${numero(pedido.total).toFixed(2)}`, 190, y, { align: "right" });
  doc.setTextColor(...GRAFITO);
  doc.setFontSize(10);

  y = pdfLineaTipoCambio(doc, y + 14, numero(pedido.total), empresa);

  pdfFooter(doc, pedido.nota || notaShein({ modo: ctx?.modo || "con_financiamiento", tipoDocumento: "pedido" }), empresa);
  doc.save(`${pedido.numero || "pedido"}.pdf`);
};

export const generarPDFCotizacionShein = ({ cliente, contacto, productos, ctx, empresa }) => {
  const doc = new jsPDF();
  pdfHeader(doc, { titulo: "COTIZACIÓN SHEIN", numeroDoc: "", fechaISO: new Date().toISOString(), empresa });

  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.text(`Cliente: ${cliente || "—"}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Contacto: ${contacto || "—"}`, 14, y + 6);
  y += 20;

  const r = resumenShein(productos, ctx);
  doc.setFont("helvetica", "bold");
  doc.text("Descripción", 14, y);
  doc.text("Costo", 145, y);
  doc.text("Total", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 6;

  productos.forEach((p) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(String(p.descripcion || "").slice(0, 50), 14, y);
    doc.text(`$${numero(p.costo_prenda).toFixed(2)}`, 145, y);
    doc.text(`$${totalProductoShein(p, ctx).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NARANJA);
  doc.text(`Total estimado: $${r.total.toFixed(2)}`, 190, y, { align: "right" });
  doc.setTextColor(...GRAFITO);

  y = pdfLineaTipoCambio(doc, y + 12, r.total, empresa);

  pdfFooter(doc, notaShein({ modo: ctx.modo, tipoDocumento: "cotizacion" }), empresa);
  doc.save("cotizacion-shein.pdf");
};

export const generarPDFCotizacionPaq = ({ cliente, contacto, items, form, tarifas, empresa }) => {
  const doc = new jsPDF();
  pdfHeader(doc, { titulo: "COTIZACIÓN PAQUETERÍA", numeroDoc: "", fechaISO: new Date().toISOString(), empresa });

  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.text(`Cliente: ${cliente || "—"}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Destino: ${form.destino} · ${form.tipoEnvio}`, 14, y + 6);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.text("Producto", 14, y);
  doc.text("Peso", 110, y);
  doc.text("Costo", 140, y);
  doc.text("Total", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 6;

  items.forEach((i) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(String(i.descripcion || "").slice(0, 40), 14, y);
    doc.text(`${numero(i.peso).toFixed(1)} lb`, 110, y);
    doc.text(`$${costoItemCotPaq(i).toFixed(2)}`, 140, y);
    doc.text(`$${totalItemCotPaq(i).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });

  y += 4;
  doc.line(14, y, 196, y);
  y += 8;
  doc.text(`Peso total: ${librasCotPaq(items).toFixed(1)} lb`, 14, y);
  doc.text(`Envío estimado: $${totalEnvioCotPaq(tarifas, form, items).toFixed(2)}`, 14, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NARANJA);
  const totalEstimado = totalCotPaq(tarifas, form, items);
  doc.text(`Total estimado: $${totalEstimado.toFixed(2)}`, 190, y, { align: "right" });
  doc.setTextColor(...GRAFITO);

  y = pdfLineaTipoCambio(doc, y + 14, totalEstimado, empresa);

  pdfFooter(doc, "Cotización válida por 24 horas. El precio final puede variar según peso real al llegar el paquete.", empresa);
  doc.save("cotizacion-paqueteria.pdf");
};

// ===== Recibo / detalle de envío (el que se adjunta en el aviso de "listo para retirar") =====
export const generarDetalleEnvio = (envio, tarifas, empresa) => {
  const doc = new jsPDF();
  pdfHeader(doc, { titulo: "RECIBO DE ENVÍO", numeroDoc: envio.numero, fechaISO: envio.fechaISO, empresa });

  let y = 42;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Cliente: ${envio.cliente}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Código de cliente: ${envio.clienteCodigo || "—"}`, 14, y + 6);
  doc.setFont("helvetica", "bold");
  doc.text(`Destino: ${envio.destino}`, 130, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Estado: ${envio.estado}`, 130, y + 6);
  y += 22;

  const trackingsDetalle = envio.trackings || [];
  const tiposEnDetalle = [...new Set(trackingsDetalle.map((t) => t.tipoEnvio || envio.tipoEnvio))];

  doc.setFillColor(...PAPEL);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Tracking", 17, y);
  doc.text("Tipo", 95, y);
  doc.text("Peso", 120, y);
  doc.text("Tarifa/lb", 148, y);
  doc.text("Total", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  trackingsDetalle.forEach((t) => {
    y = pdfSaltoPagina(doc, y);
    const tipo = t.tipoEnvio || envio.tipoEnvio;
    const tarifaLb = tarifaPorTipoEnvio(tarifas, envio, tipo);
    doc.text(String(t.codigo || "—"), 17, y);
    doc.text(tipo, 95, y);
    doc.text(`${numero(t.peso).toFixed(1)} lb`, 120, y);
    doc.text(`$${tarifaLb.toFixed(2)}`, 148, y);
    doc.text(`$${(numero(t.peso) * tarifaLb).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });

  if (tiposEnDetalle.length > 1) {
    y += 4;
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS_MEDIO);
    doc.text("* Este envío combina trackings marítimos y aéreos; cada uno se cobra con la tarifa de su propio tipo.", 14, y, { maxWidth: 182 });
    doc.setTextColor(...GRAFITO);
    doc.setFontSize(10);
    y += 8;
  }

  const { total } = calcularTotalesTrackings(tarifas, envio, trackingsDetalle);
  y += 4;
  doc.line(14, y, 196, y);
  y += 8;
  if (numero(envio.descuento) > 0) {
    doc.text(`Descuento aplicado: -$${numero(envio.descuento).toFixed(2)}`, 14, y);
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  doc.text(`Total: $${total.toFixed(2)}`, 190, y, { align: "right" });
  doc.setTextColor(...GRAFITO);
  doc.setFontSize(10);

  y = pdfLineaTipoCambio(doc, y + 14, total, empresa);

  const hayPendientes = trackingsDetalle.some((t) => !numero(t.peso));
  const nota = hayPendientes
    ? `Este envío tiene trackings pendientes de recibir/pesar. El total puede ajustarse cuando se registre el peso real.  Gracias por confiar en OEX.`
    : `Envío con todos los pesos confirmados, la tasa utilizada corresponde al tipo de cambio de compra vigente de los bancos comerciales.

  ¡Gracias por confiar en OEX!.`;
  pdfFooter(doc, nota, empresa);
  doc.save(`${envio.numero || "envio"}.pdf`);
};

// ===== Reporte financiero (Finanzas) =====
// Recibe los mismos datos ya calculados en Finanzas.jsx (useMemo/KPIs) para
// no duplicar lógica de agregación aquí. Genera un PDF de varias páginas:
// resumen de KPIs, ventas por mes, gastos por categoría y top clientes.
export const generarPDFReporteFinanciero = ({
  ventasPorMes, gastosPorCategoria, topClientes, kpis, empresa
}) => {
  const doc = new jsPDF();
  pdfHeader(doc, { titulo: "REPORTE FINANCIERO", numeroDoc: "", fechaISO: new Date().toISOString(), empresa });

  let y = 42;

  // --- KPIs ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumen general", 14, y);
  y += 8;

  const kpiFilas = [
    ["Ventas SHEIN", numero(kpis.ventasShein)],
    ["Ventas Paquetería", numero(kpis.ventasPaq)],
    ["Ganancia real Paquetería", numero(kpis.gananciaPaq)],
    ["Gastos operativos", numero(kpis.totalGastos)],
    ["Utilidad neta operativa", numero(kpis.utilidadNeta)]
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  kpiFilas.forEach(([label, valor], i) => {
    const esUtilidad = label === "Utilidad neta operativa";
    doc.setFont("helvetica", esUtilidad ? "bold" : "normal");
    doc.setTextColor(...(esUtilidad ? NARANJA : GRAFITO));
    doc.text(label, 17, y);
    doc.text(`$${valor.toFixed(2)}`, 190, y, { align: "right" });
    doc.setTextColor(...GRAFITO);
    y += 7;
  });
  y += 6;

  // --- Ventas y gastos por mes ---
  y = pdfSaltoPagina(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Ventas y gastos por mes", 14, y);
  y += 8;

  doc.setFillColor(...PAPEL);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFontSize(9);
  doc.text("Mes", 17, y);
  doc.text("SHEIN", 80, y);
  doc.text("Paquetería", 108, y);
  doc.text("Gastos", 140, y);
  doc.text("Balance", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  ventasPorMes.forEach((m) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(m.mes, 17, y);
    doc.text(`$${numero(m.shein).toFixed(2)}`, 80, y);
    doc.text(`$${numero(m.paqueteria).toFixed(2)}`, 108, y);
    doc.text(`$${numero(m.gastos).toFixed(2)}`, 140, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(m.balance >= 0 ? NAVY : NARANJA));
    doc.text(`$${numero(m.balance).toFixed(2)}`, 190, y, { align: "right" });
    doc.setTextColor(...GRAFITO);
    doc.setFont("helvetica", "normal");
    y += 6;
  });
  y += 8;

  // --- Gastos por categoría ---
  y = pdfSaltoPagina(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Gastos por categoría", 14, y);
  y += 8;

  doc.setFillColor(...PAPEL);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFontSize(9);
  doc.text("Categoría", 17, y);
  doc.text("% del total", 140, y);
  doc.text("Monto", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  gastosPorCategoria.forEach((g) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(g.categoria, 17, y);
    doc.text(`${g.pct.toFixed(0)}%`, 140, y);
    doc.text(`$${numero(g.monto).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });
  y += 8;

  // --- Top clientes ---
  y = pdfSaltoPagina(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Top clientes por monto total", 14, y);
  y += 8;

  doc.setFillColor(...PAPEL);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setFontSize(9);
  doc.text("Cliente", 17, y);
  doc.text("Código", 110, y);
  doc.text("Pedidos/Envíos", 145, y);
  doc.text("Total", 190, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  topClientes.forEach((c) => {
    y = pdfSaltoPagina(doc, y);
    doc.text(String(c.nombre || "—").slice(0, 32), 17, y);
    doc.text(c.codigo || "—", 110, y);
    doc.text(String(c.pedidos), 145, y);
    doc.text(`$${numero(c.total).toFixed(2)}`, 190, y, { align: "right" });
    y += 6;
  });

  pdfFooter(doc, "Reporte financiero generado desde el módulo de Finanzas de OEX CRM.", empresa);
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`reporte-financiero-${fechaArchivo}.pdf`);
};

// La antigua generarFacturaConsolidada() se eliminó: ahora el recibo se
// genera directo desde trackingsService.generarRecibo() con solo los
// trackings listos (nunca con envíos completos), y se imprime reutilizando
// generarDetalleEnvio() de arriba — ya no hace falta una función aparte.