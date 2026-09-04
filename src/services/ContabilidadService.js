// src/services/contabilidadService.js
//
// Motor de partida doble. Nadie fuera de este archivo debería escribir
// directamente en asientos_contables / movimientos_contables — todos
// los demás services (gastosService, ingresosService, proveedoresService,
// balanceAperturaService) pasan por postearAsiento() para garantizar que
// nunca se guarde un asiento descuadrado.
import { supabase } from "../supabase";
import { numero } from "../utils/numero";

const firmaUsuario = (auth) => ({
  created_by: auth.session?.user?.id || null,
  created_by_name: auth.usuarioActual?.nombre || auth.usuarioActual?.email || auth.session?.user?.email || "Usuario"
});

const idsPorCodigo = async (codigos) => {
  const unicos = [...new Set(codigos)];
  const { data, error } = await supabase.from("cuentas_contables").select("id, codigo").in("codigo", unicos);
  if (error) throw error;
  const mapa = new Map(data.map((c) => [c.codigo, c.id]));
  unicos.forEach((cod) => {
    if (!mapa.has(cod)) throw new Error(`No existe la cuenta contable "${cod}" en el catálogo — créala en Finanzas → Cuentas antes de continuar.`);
  });
  return mapa;
};

// Núcleo interno: recibe líneas ya resueltas a cuentaContableId. Todo lo
// demás en este archivo (y en los services que lo consumen) termina
// llamando aquí.
const insertarAsientoConIds = async ({ fecha, descripcion, origenModulo, origenId, lineas, auth }) => {
  const totalDebe = lineas.reduce((a, l) => a + numero(l.debe), 0);
  const totalHaber = lineas.reduce((a, l) => a + numero(l.haber), 0);
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    // Esto NO debería pasar nunca si los services arman bien sus líneas
    // — si aparece, es un bug en cómo se construyó el asiento, no algo
    // que el usuario pueda corregir desde la UI.
    throw new Error(`Error interno: asiento descuadrado (debe $${totalDebe.toFixed(2)} vs haber $${totalHaber.toFixed(2)}). No se guardó nada.`);
  }
  if (lineas.length < 2) {
    throw new Error("Error interno: un asiento necesita al menos 2 líneas.");
  }

  const { data: asiento, error: errorAsiento } = await supabase.from("asientos_contables").insert([{
    fecha: fecha || new Date().toISOString(),
    descripcion,
    origen_modulo: origenModulo,
    origen_id: origenId ?? null,
    ...firmaUsuario(auth)
  }]).select().single();
  if (errorAsiento) throw errorAsiento;

  const { error: errorLineas } = await supabase.from("movimientos_contables").insert(
    lineas.map((l) => ({
      asiento_id: asiento.id,
      cuenta_contable_id: l.cuentaContableId,
      cuenta_dinero_id: l.cuentaDineroId || null,
      debe: numero(l.debe),
      haber: numero(l.haber)
    }))
  );
  if (errorLineas) throw errorLineas;

  return asiento;
};

// API que usan los services de negocio: líneas con `cuentaCodigo` (ej.
// "6010", "1010") en vez de ids — más legible en el código de cada
// service y evita que tengan que cargar el catálogo completo solo para
// esto.
export const postearAsiento = async ({ fecha, descripcion, origenModulo, origenId, lineas, auth }) => {
  const mapaCuentas = await idsPorCodigo(lineas.map((l) => l.cuentaCodigo));
  return insertarAsientoConIds({
    fecha, descripcion, origenModulo, origenId, auth,
    lineas: lineas.map((l) => ({
      cuentaContableId: mapaCuentas.get(l.cuentaCodigo),
      cuentaDineroId: l.cuentaDineroId,
      debe: l.debe,
      haber: l.haber
    }))
  });
};

// Variante para quien ya tiene los ids resueltos a mano (balanceAperturaService,
// que ya recibe el catálogo completo desde la UI).
export const postearAsientoPorId = insertarAsientoConIds;

// Reversa TODOS los asientos que vinieron de un origen dado, creando el
// asiento espejo (debe↔haber invertidos) en vez de borrar el original —
// así el libro diario nunca pierde el rastro de que algo se registró y
// luego se anuló. Se usa cuando se elimina un gasto/ingreso ya posteado.
export const reversarAsientosDeOrigen = async ({ origenModulo, origenId, auth }) => {
  const { data: asientos, error } = await supabase
    .from("asientos_contables")
    .select("id, descripcion, movimientos_contables(cuenta_contable_id, cuenta_dinero_id, debe, haber)")
    .eq("origen_modulo", origenModulo)
    .eq("origen_id", origenId);
  if (error) throw error;

  for (const asiento of asientos || []) {
    if (!asiento.movimientos_contables?.length) continue;
    await insertarAsientoConIds({
      descripcion: `Reversión: ${asiento.descripcion}`,
      origenModulo: `${origenModulo}_reversion`,
      origenId,
      auth,
      lineas: asiento.movimientos_contables.map((m) => ({
        cuentaContableId: m.cuenta_contable_id,
        cuentaDineroId: m.cuenta_dinero_id,
        debe: numero(m.haber),
        haber: numero(m.debe)
      }))
    });
  }
};

// Solo para el asiento de apertura (balanceAperturaService): al ser un
// snapshot único que se reemplaza completo cada vez que se guarda, no
// tiene sentido "reversarlo" — se borra y se postea de nuevo.
export const eliminarAsientosDeOrigen = async (origenModulo) => {
  const { error } = await supabase.from("asientos_contables").delete().eq("origen_modulo", origenModulo);
  if (error) throw error;
};

// Libro diario completo, para la pantalla de consulta. Trae cada asiento
// con sus líneas y el nombre/código de cuenta ya resueltos.
export const listarLibroDiario = async () => {
  const { data, error } = await supabase
    .from("asientos_contables")
    .select("id, fecha, descripcion, origen_modulo, created_by_name, movimientos_contables(debe, haber, cuenta_dinero_id, cuentas_contables(codigo, nombre))")
    .order("fecha", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data;
};