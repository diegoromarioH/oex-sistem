// src/hooks/useDatosOEX.js
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { cargarDatos as cargarDatosService } from "../services/coreService";

// Tablas que, al cambiar (desde donde sea: la landing pública, otro
// operador, etc.), deben disparar un refresco automático del CRM.
const TABLAS_A_ESCUCHAR = [
  "tracking_registros", "envios", "pedidos", "gastos_operativos", "ingresos_operativos", "clientes",
  "proveedores", "facturas_proveedor", "pagos_proveedor",
  // Fase 1-4 (Finanzas): cuentas, balance de apertura y corte de caja.
  // El libro diario (asientos_contables/movimientos_contables) NO está
  // en esta lista a propósito — se postea siempre como consecuencia de
  // alguna de las tablas de arriba, así que ya dispara un refresco por
  // esa vía; agregarlo aquí solo duplicaría recargas.
  "cuentas_dinero", "cuentas_contables", "balance_apertura", "cortes_caja"
];

export const useDatosOEX = (session) => {
  const [pedidos, setPedidos] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [prealertas, setPrealertas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [facturasProveedor, setFacturasProveedor] = useState([]);
  const [pagosProveedor, setPagosProveedor] = useState([]);

  // Fase 1-4: catálogo de cuentas, cuentas de dinero, balance de
  // apertura. cargarDatosService() (coreService.js) todavía necesita
  // devolver estos campos — por ahora se leen con `|| valorPorDefecto`
  // para no romper nada mientras se termina de conectar esa parte.
  const [cuentasDinero, setCuentasDinero] = useState([]);
  const [cuentasContables, setCuentasContables] = useState([]);
  const [balanceApertura, setBalanceApertura] = useState([]);
  const [fechaApertura, setFechaApertura] = useState(null);

  const [cargando, setCargando] = useState(true);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await cargarDatosService();
      setPedidos(datos.pedidos);
      setEnvios(datos.envios);
      setPrealertas(datos.prealertas);
      setGastos(datos.gastos);
      setIngresos(datos.ingresos);
      setClientes(datos.clientes);
      setAuditLog(datos.auditLog);
      setProveedores(datos.proveedores);
      setFacturasProveedor(datos.facturasProveedor);
      setPagosProveedor(datos.pagosProveedor);

      setCuentasDinero(datos.cuentasDinero || []);
      setCuentasContables(datos.cuentasContables || []);
      setBalanceApertura(datos.balanceApertura || []);
      setFechaApertura(datos.fechaApertura || null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (session) cargarDatos();
  }, [session, cargarDatos]);

  // Realtime: si varias tablas cambian casi al mismo tiempo (ej. generar
  // un recibo borra de tracking_registros e inserta en envios en la misma
  // acción), se agrupan los eventos con un pequeño debounce para no
  // disparar varias recargas seguidas — solo la última cuenta.
  const debounceRef = useRef(null);
  const recargarConDebounce = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarDatos();
    }, 400);
  }, [cargarDatos]);

  useEffect(() => {
    if (!session) return;

    const canal = supabase.channel("cambios-oex");
    TABLAS_A_ESCUCHAR.forEach((tabla) => {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, recargarConDebounce);
    });
    canal.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(canal);
    };
  }, [session, recargarConDebounce]);

  return {
    pedidos, setPedidos,
    envios, setEnvios,
    prealertas, setPrealertas,
    gastos, setGastos,
    ingresos, setIngresos,
    clientes, setClientes,
    auditLog, setAuditLog,
    proveedores, setProveedores,
    facturasProveedor, setFacturasProveedor,
    pagosProveedor, setPagosProveedor,
    cuentasDinero, setCuentasDinero,
    cuentasContables, setCuentasContables,
    balanceApertura, setBalanceApertura,
    fechaApertura, setFechaApertura,
    cargando, cargarDatos
  };
};