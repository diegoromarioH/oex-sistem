// src/services/estadoResultadosService.js
//
// Estado de Resultados calculado 100% desde el libro diario — nada de
// fórmulas hardcodeadas por módulo. Suma los movimientos de cada cuenta
// tipo ingreso/costo/gasto dentro del rango de fechas pedido.
import { supabase } from "../supabase";
import { numero } from "../utils/numero";

const TIPOS_RESULTADO = ["ingreso", "costo", "gasto"];

// desde/hasta: strings ISO. Devuelve totales + desglose por cuenta, ya
// filtrado a cuentas con movimiento (las que están en $0 no se listan).
export const calcularEstadoResultados = async ({ desde, hasta }) => {
  const { data: cuentas, error: errorCuentas } = await supabase
    .from("cuentas_contables")
    .select("id, codigo, nombre, tipo")
    .in("tipo", TIPOS_RESULTADO);
  if (errorCuentas) throw errorCuentas;

  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));
  const ids = cuentas.map((c) => c.id);
  if (ids.length === 0) return { ingresos: 0, costos: 0, gastos: 0, utilidad: 0, porCuenta: [] };

  const { data: movimientos, error } = await supabase
    .from("movimientos_contables")
    .select("cuenta_contable_id, debe, haber, asientos_contables!inner(fecha)")
    .in("cuenta_contable_id", ids)
    .gte("asientos_contables.fecha", desde)
    .lte("asientos_contables.fecha", hasta);
  if (error) throw error;

  const totalesPorCuenta = new Map();
  movimientos.forEach((m) => {
    const cuenta = cuentaPorId.get(m.cuenta_contable_id);
    if (!cuenta) return;
    // Ingreso es de naturaleza acreedora → su saldo "positivo" es
    // haber−debe. Costo/Gasto son de naturaleza deudora → su saldo
    // "positivo" es debe−haber. Mismo criterio que usa todo el libro
    // diario, no una regla especial de este reporte.
    const monto = cuenta.tipo === "ingreso" ? numero(m.haber) - numero(m.debe) : numero(m.debe) - numero(m.haber);
    totalesPorCuenta.set(cuenta.id, (totalesPorCuenta.get(cuenta.id) || 0) + monto);
  });

  const porCuenta = [...totalesPorCuenta.entries()]
    .map(([id, monto]) => ({ ...cuentaPorId.get(id), monto }))
    .filter((c) => Math.abs(c.monto) > 0.005)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const ingresos = porCuenta.filter((c) => c.tipo === "ingreso").reduce((a, c) => a + c.monto, 0);
  const costos = porCuenta.filter((c) => c.tipo === "costo").reduce((a, c) => a + c.monto, 0);
  const gastos = porCuenta.filter((c) => c.tipo === "gasto").reduce((a, c) => a + c.monto, 0);

  return { ingresos, costos, gastos, utilidad: ingresos - costos - gastos, porCuenta };
};