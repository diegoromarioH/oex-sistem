import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export const useFeriadosNicaragua = () => {
  const [feriados, setFeriados] = useState([]);

  useEffect(() => {
    let activo = true;
    supabase
      .from("feriados_nicaragua")
      .select("fecha,nombre,activo")
      .eq("activo", true)
      .order("fecha", { ascending: true })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) throw error;
        setFeriados(data || []);
      })
      .catch(() => activo && setFeriados([]));

    return () => { activo = false; };
  }, []);

  return feriados;
};
