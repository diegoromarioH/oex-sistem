export const solicitarNavegacion = (modulo, subvista) => {
  window.dispatchEvent(new CustomEvent("oex:navegar", { detail: { modulo, subvista } }));
};
