// src/hooks/useToast.js
import { useCallback, useRef, useState } from "react";

export const useToast = () => {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, mostrarToast };
};
