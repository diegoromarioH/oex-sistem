// src/hooks/useAuth.js
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";

export const useAuth = () => {
  const [session, setSession] = useState(null);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [rol, setRol] = useState("operador");
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const cargarPerfil = useCallback(async (sesion) => {
    if (!sesion?.user) {
      setUsuarioActual(null);
      setRol("operador");
      return;
    }
    const { data } = await supabase.from("usuarios").select("*").eq("id", sesion.user.id).single();
    if (data) {
      setUsuarioActual({ nombre: data.nombre || sesion.user.email, email: sesion.user.email });
      setRol(data.rol || "operador");
    } else {
      setUsuarioActual({ nombre: sesion.user.email, email: sesion.user.email });
      setRol("operador");
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      cargarPerfil(data.session).finally(() => setCargandoAuth(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion);
      cargarPerfil(nuevaSesion);
    });

    return () => listener?.subscription?.unsubscribe();
  }, [cargarPerfil]);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return { session, usuarioActual, rol, cargandoAuth, login, logout };
};
