// src/hooks/useEmpresa.js
// Antes vivía en localStorage — cada operador tenía su propia copia sin
// sincronizar. Ahora la configuración de empresa vive en Supabase (tabla
// `empresa_config`, fila única id=1), con una política que solo deja
// escribir a usuarios con rol 'admin' (ver migración
// 08-empresa-compartida.sql). El hook mantiene la misma forma
// { empresa, setEmpresa } de antes para no tener que tocar los componentes
// que ya lo usan.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

// Se usan como valor inicial mientras carga Supabase, y como respaldo si
// por alguna razón la fila está vacía o la consulta falla.
export const EMPRESA_DEFAULT = {
  nombre: "OEX",
  eslogan: "Fácil y seguro, tus envíos de EEUU a Nicaragua",
  telefono: "+505 5706 7044",
  correo: "",
  web: "www.oexni.com",
  instagram: "",
  tipoCambio: 37.14,
  direccionesRetiro: {
    "Punto UNI": "",
    "Jardines de Veracruz": "",
    "Ometepe": ""
  },
  cuentasBancarias: ["BAC CÓRDOBAS DIEGO HERNANDEZ, Cta. 365845825", "BAC DOLAR DIEGO HERNANDEZ, Cta. 373576545", "LA FISE CÓRDOBAS SERGIO MENDOZA, Cta. 130061205", "LA FISE DOLAR SERGIO MENDOZA, Cta. 117269676"]
};

const filaAEmpresa = (fila) => ({
  nombre: fila.nombre || EMPRESA_DEFAULT.nombre,
  eslogan: fila.eslogan || "",
  telefono: fila.telefono || "",
  correo: fila.correo || "",
  web: fila.web || "",
  instagram: fila.instagram || "",
  tipoCambio: Number(fila.tipo_cambio) || 0,
  direccionesRetiro: fila.direcciones_retiro || {},
  cuentasBancarias: Array.isArray(fila.cuentas_bancarias) ? fila.cuentas_bancarias : []
});

export const useEmpresa = () => {
  const [empresa, setEmpresaState] = useState(EMPRESA_DEFAULT);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("empresa_config").select("*").eq("id", 1).maybeSingle();
    if (error) {
      console.log("No se pudo cargar la configuración de empresa de Supabase, usando valores por defecto:", error);
    } else if (data) {
      setEmpresaState(filaAEmpresa(data));
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Guarda el objeto completo en Supabase (upsert de la fila única id=1).
  // Si el usuario no es admin, la política de la base rechaza el cambio —
  // en ese caso se recarga lo que realmente hay guardado, para que la
  // pantalla no se quede mostrando un valor que nunca se guardó.
  const setEmpresa = async (nueva) => {
    setEmpresaState(nueva);
    const { error } = await supabase.from("empresa_config").upsert([{
      id: 1,
      nombre: nueva.nombre,
      eslogan: nueva.eslogan,
      telefono: nueva.telefono,
      correo: nueva.correo,
      web: nueva.web,
      instagram: nueva.instagram,
      tipo_cambio: Number(nueva.tipoCambio) || 0,
      direcciones_retiro: nueva.direccionesRetiro || {},
      cuentas_bancarias: nueva.cuentasBancarias || [],
      updated_at: new Date().toISOString()
    }]);
    if (error) {
      console.log("No se pudo guardar la empresa (¿tu usuario no es admin?):", error);
      cargar();
    }
  };

  return { empresa, setEmpresa, cargandoEmpresa: cargando };
};