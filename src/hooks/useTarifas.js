// src/hooks/useTarifas.js
// Antes vivía en localStorage — cada operador tenía su propia copia sin
// sincronizar. Ahora las tarifas viven en Supabase (tabla `tarifas`), con
// una política que solo deja escribir a usuarios con rol 'admin' (ver
// migración 02-tarifas-compartidas.sql). El hook mantiene la misma forma
// { tarifas, setTarifas } de antes para no tener que tocar los componentes
// que ya lo usan.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

// Se usan como valor inicial mientras carga Supabase, y como respaldo si
// por alguna razón la tabla está vacía o la consulta falla.
export const TARIFAS_DEFAULT = {
  managua_estandar: { label: "Estándar Managua", destino: "Managua", maritimo: 2.50, aereo: 6.50 },
  ometepe_estandar: { label: "Estándar Ometepe", destino: "Ometepe", maritimo: 2.90, aereo: 7.50 },
  ometepe_emprendedor: { label: "Emprendedor Ometepe", destino: "Ometepe", maritimo: 2.50, aereo: 6.00 },
  managua_promocional: { label: "Promocional Managua", destino: "Managua", maritimo: 2.00, aereo: 6.00 },
  managua_emprendedor: { label: "Emprendedor Managua", destino: "Managua", maritimo: 2.00, aereo: 5.50 },
  ometepe_promocional: { label: "Promocional Ometepe", destino: "Ometepe", maritimo: 2.70, aereo: 6.95 },
  ometepe_fd_emprendedor: { label: "FD Emprendedor", destino: "Ometepe", maritimo: 2.50, aereo: 5.50 },
  costo_managua: { label: "Costo", destino: "Managua", maritimo: 1.50, aereo: 4.50 },
  costo_ometepe: { label: "Costo", destino: "Ometepe", maritimo: 1.50, aereo: 4.50 }
};

const filaATarifa = (fila) => ({
  label: fila.label,
  destino: fila.destino,
  maritimo: Number(fila.maritimo),
  aereo: Number(fila.aereo)
});

export const useTarifas = () => {
  const [tarifas, setTarifasState] = useState(TARIFAS_DEFAULT);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("tarifas").select("*");
    if (error) {
      console.log("No se pudieron cargar las tarifas de Supabase, usando valores por defecto:", error);
    } else if (data && data.length > 0) {
      const mapa = {};
      data.forEach((fila) => { mapa[fila.id] = filaATarifa(fila); });
      setTarifasState((actual) => ({ ...actual, ...mapa }));
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Guarda el objeto completo de tarifas en Supabase (upsert por id). Si
  // el usuario no es admin, la política de la base rechaza el cambio — en
  // ese caso se recarga lo que realmente hay guardado, para que la
  // pantalla no se quede mostrando un valor que nunca se guardó.
  const setTarifas = async (nuevas) => {
    setTarifasState(nuevas);
    const filas = Object.entries(nuevas).map(([id, t]) => ({
      id,
      label: t.label,
      destino: t.destino,
      maritimo: Number(t.maritimo),
      aereo: Number(t.aereo),
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from("tarifas").upsert(filas);
    if (error) {
      console.log("No se pudo guardar la tarifa (¿tu usuario no es admin?):", error);
      cargar();
    }
  };

  return { tarifas, setTarifas, cargandoTarifas: cargando };
};
