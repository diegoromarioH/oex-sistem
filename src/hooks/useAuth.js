// src/hooks/useAuth.js
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";

export const useAuth = () => {
  const [session, setSession] = useState(null);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [rol, setRol] = useState(null);
  const [autorizado, setAutorizado] = useState(false);
  const [errorAuth, setErrorAuth] = useState("");
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const cargarPerfil = useCallback(async (sesion) => {
    if (!sesion?.user) {
      setUsuarioActual(null);
      setRol(null);
      setAutorizado(false);
      setErrorAuth("");
      return;
    }
    const { data, error } = await supabase
      .from("usuarios")
      .select("nombre, rol")
      .eq("id", sesion.user.id)
      .maybeSingle();

    if (error) {
      setUsuarioActual(null);
      setRol(null);
      setAutorizado(false);
      setErrorAuth("No se pudo verificar tu acceso. Intenta nuevamente.");
      return;
    }

    if (data && ["admin", "operador"].includes(data.rol)) {
      setUsuarioActual({ nombre: data.nombre || sesion.user.email, email: sesion.user.email });
      setRol(data.rol);
      setAutorizado(true);
      setErrorAuth("");
    } else {
      setUsuarioActual(null);
      setRol(null);
      setAutorizado(false);
      setErrorAuth("Tu cuenta no tiene acceso autorizado a OEX Sistema.");
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setErrorAuth("No se pudo recuperar la sesión.");
        setCargandoAuth(false);
        return;
      }
      setSession(data.session);
      cargarPerfil(data.session).finally(() => setCargandoAuth(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion);
      setCargandoAuth(true);
      cargarPerfil(nuevaSesion).finally(() => setCargandoAuth(false));
    });

    return () => listener?.subscription?.unsubscribe();
  }, [cargarPerfil]);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return { session, usuarioActual, rol, autorizado, errorAuth, cargandoAuth, login, logout };
};
