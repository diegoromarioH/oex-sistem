import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

export const CONFIG_OPERATIVA_DEFAULT = {
  costosProveedor: { maritimo: 1.50, aereo: 4.50 },
  tiemposEntrega: {
    Managua: { "Aéreo": [3, 5], "Marítimo": [16, 19] },
    Ometepe: { "Aéreo": [4, 6], "Marítimo": [17, 20] }
  }
};

const normalizar = (valor = {}) => ({
  costosProveedor: {
    maritimo: Number(valor.costosProveedor?.maritimo) > 0 ? Number(valor.costosProveedor.maritimo) : CONFIG_OPERATIVA_DEFAULT.costosProveedor.maritimo,
    aereo: Number(valor.costosProveedor?.aereo) > 0 ? Number(valor.costosProveedor.aereo) : CONFIG_OPERATIVA_DEFAULT.costosProveedor.aereo
  },
  tiemposEntrega: {
    Managua: {
      "Aéreo": valor.tiemposEntrega?.Managua?.["Aéreo"] || CONFIG_OPERATIVA_DEFAULT.tiemposEntrega.Managua["Aéreo"],
      "Marítimo": valor.tiemposEntrega?.Managua?.["Marítimo"] || CONFIG_OPERATIVA_DEFAULT.tiemposEntrega.Managua["Marítimo"]
    },
    Ometepe: {
      "Aéreo": valor.tiemposEntrega?.Ometepe?.["Aéreo"] || CONFIG_OPERATIVA_DEFAULT.tiemposEntrega.Ometepe["Aéreo"],
      "Marítimo": valor.tiemposEntrega?.Ometepe?.["Marítimo"] || CONFIG_OPERATIVA_DEFAULT.tiemposEntrega.Ometepe["Marítimo"]
    }
  }
});

export const useConfiguracionOperativa = (habilitado = true) => {
  const [configOperativa, setState] = useState(CONFIG_OPERATIVA_DEFAULT);
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("empresa_config").select("config_operativa").eq("id", 1).maybeSingle();
    if (!error && data?.config_operativa) setState(normalizar(data.config_operativa));
  }, []);
  useEffect(() => { if (habilitado) cargar(); }, [habilitado, cargar]);

  const setConfigOperativa = async (nueva) => {
    const limpia = normalizar(nueva);
    setState(limpia);
    const { error } = await supabase.from("empresa_config").update({ config_operativa: limpia, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { await cargar(); throw error; }
  };
  return { configOperativa, setConfigOperativa };
};
