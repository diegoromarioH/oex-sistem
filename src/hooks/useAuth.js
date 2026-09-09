// src/hooks/useAuth.js
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";

export const useAuth = () => {
  const [session, setSession] = useState(null);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [rol, setRol] = useState(null);
  const [autorizado, setAutorizado] = useState(false);
  const [errorAuth, setErrorAuth] = useState("");
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const perfilVerificadoId = useRef(null);

  const cargarPerfil = useCallback(async (sesion) => {
    if (!sesion?.user) {
      perfilVerificadoId.current = null;
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
      perfilVerificadoId.current = null;
      setUsuarioActual(null);
      setRol(null);
      setAutorizado(false);
      setErrorAuth("No se pudo verificar tu acceso. Intenta nuevamente.");
      return;
    }

    if (data && ["admin", "operador"].includes(data.rol)) {
      perfilVerificadoId.current = sesion.user.id;
      setUsuarioActual({ nombre: data.nombre || sesion.user.email, email: sesion.user.email });
      setRol(data.rol);
      setAutorizado(true);
      setErrorAuth("");
    } else {
      perfilVerificadoId.current = null;
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

    const { data: listener } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSession(nuevaSesion);

      if (!nuevaSesion?.user) {
        perfilVerificadoId.current = null;
        setUsuarioActual(null);
        setRol(null);
        setAutorizado(false);
        setErrorAuth("");
        setCargandoAuth(false);
        return;
      }

      // Supabase puede emitir SIGNED_IN nuevamente al recuperar el foco y
      // TOKEN_REFRESHED al renovar el JWT. Si el mismo usuario ya fue
      // autorizado, solo actualizamos la sesión: no mostramos la pantalla de
      // carga ni desmontamos los formularios que el usuario está completando.
      const mismoPerfil = perfilVerificadoId.current === nuevaSesion.user.id;
      if (mismoPerfil && ["SIGNED_IN", "TOKEN_REFRESHED"].includes(evento)) return;

      if (!mismoPerfil) setCargandoAuth(true);
      // Diferimos la consulta para no ejecutar otra llamada de Supabase dentro
      // del callback síncrono de cambio de autenticación.
      setTimeout(() => {
        cargarPerfil(nuevaSesion).finally(() => setCargandoAuth(false));
      }, 0);
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
