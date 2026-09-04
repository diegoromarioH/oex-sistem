// src/services/excelService.js
import * as XLSX from "xlsx";
import { numero } from "../utils/numero";

export const exportarPedidosExcel = (pedidos) => {
  const filas = pedidos.map((p) => ({
    Numero: p.numero,
    Cliente: p.cliente,
    "Código cliente": p.clienteCodigo,
    Contacto: p.contacto,
    Estado: p.estado,
    Total: numero(p.total),
    Abono: numero(p.abono),
    Saldo: numero(p.saldo),
    Fecha: p.fecha
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Pedidos SHEIN");
  XLSX.writeFile(libro, "pedidos-shein.xlsx");
};

export const exportarEnviosExcel = (envios) => {
  const filas = envios.map((e) => ({
    Numero: e.numero,
    Cliente: e.cliente,
    "Código cliente": e.clienteCodigo,
    Destino: e.destino,
    Tipo: e.tipoEnvio,
    Estado: e.estado,
    "Trackings": e.trackings.map((t) => t.codigo).filter(Boolean).join(", "),
    "IDs almacén": e.trackings.map((t) => t.almacenId).filter(Boolean).join(", "),
    "Libras totales": numero(e.totalLibras),
    Total: numero(e.total),
    "Costo interno": numero(e.costoInternoTotal),
    "Ganancia real": numero(e.gananciaReal),
    Fecha: e.fecha
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Envíos");
  XLSX.writeFile(libro, "envios-paqueteria.xlsx");
};

export const exportarClientesExcel = (clientes) => {
  const filas = clientes.map((c) => ({
    Codigo: c.codigo,
    Nombre: c.nombre,
    Telefono: c.telefono,
    Tipo: c.tipo,
    Correo: c.correo,
    Direccion: c.direccion,
    "Registrado": c.fecha
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Clientes");
  XLSX.writeFile(libro, "clientes.xlsx");
};

// ===== Reporte financiero completo (Finanzas) =====
// Genera un solo .xlsx con varias hojas: Resumen, Ventas por mes,
// Gastos por categoría, Top clientes, Gastos (detalle), Pedidos y Envíos.
// Recibe los mismos datos ya calculados en Finanzas.jsx (useMemo) para no
// duplicar lógica de agregación aquí.
export const exportarReporteFinancieroExcel = ({
  pedidos, envios, gastos,
  ventasPorMes, gastosPorCategoria, topClientes,
  kpis
}) => {
  const libro = XLSX.utils.book_new();

  // --- Hoja: Resumen ---
  const hojaResumen = XLSX.utils.json_to_sheet([
    { Indicador: "Ventas SHEIN", Valor: numero(kpis.ventasShein) },
    { Indicador: "Ventas Paquetería", Valor: numero(kpis.ventasPaq) },
    { Indicador: "Ganancia real Paquetería", Valor: numero(kpis.gananciaPaq) },
    { Indicador: "Gastos operativos", Valor: numero(kpis.totalGastos) },
    { Indicador: "Utilidad neta operativa", Valor: numero(kpis.utilidadNeta) }
  ]);
  XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

  // --- Hoja: Ventas y gastos por mes ---
  const hojaMeses = XLSX.utils.json_to_sheet(
    ventasPorMes.map((m) => ({
      Mes: m.mes,
      "Ventas SHEIN": numero(m.shein),
      "Ventas Paquetería": numero(m.paqueteria),
      "Ganancia real Paquetería": numero(m.gananciaPaq),
      "Gastos": numero(m.gastos),
      "Balance": numero(m.balance)
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaMeses, "Ventas por mes");

  // --- Hoja: Gastos por categoría ---
  const hojaCategorias = XLSX.utils.json_to_sheet(
    gastosPorCategoria.map((g) => ({
      Categoría: g.categoria,
      Monto: numero(g.monto),
      "% del total": Number(g.pct.toFixed(1))
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaCategorias, "Gastos por categoría");

  // --- Hoja: Top clientes ---
  const hojaClientes = XLSX.utils.json_to_sheet(
    topClientes.map((c) => ({
      Cliente: c.nombre,
      Código: c.codigo,
      "Pedidos/Envíos": c.pedidos,
      "Total gastado": numero(c.total)
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaClientes, "Top clientes");

  // --- Hoja: Detalle de gastos ---
  const hojaGastos = XLSX.utils.json_to_sheet(
    gastos.map((g) => ({
      Fecha: g.fecha,
      Categoría: g.categoria,
      Descripción: g.descripcion,
      Monto: numero(g.monto),
      "Registrado por": g.creadoPor
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaGastos, "Detalle gastos");

  // --- Hoja: Pedidos SHEIN (detalle, igual a exportarPedidosExcel) ---
  const hojaPedidos = XLSX.utils.json_to_sheet(
    pedidos.map((p) => ({
      Numero: p.numero,
      Cliente: p.cliente,
      "Código cliente": p.clienteCodigo,
      Estado: p.estado,
      Total: numero(p.total),
      Abono: numero(p.abono),
      Saldo: numero(p.saldo),
      Fecha: p.fecha
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaPedidos, "Pedidos SHEIN");

  // --- Hoja: Envíos Paquetería (detalle) ---
  const hojaEnvios = XLSX.utils.json_to_sheet(
    envios.map((e) => ({
      Numero: e.numero,
      Cliente: e.cliente,
      "Código cliente": e.clienteCodigo,
      Destino: e.destino,
      Total: numero(e.total),
      "Costo interno": numero(e.costoInternoTotal),
      "Ganancia real": numero(e.gananciaReal),
      Fecha: e.fecha
    }))
  );
  XLSX.utils.book_append_sheet(libro, hojaEnvios, "Envíos Paquetería");

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `reporte-financiero-${fechaArchivo}.xlsx`);
};
