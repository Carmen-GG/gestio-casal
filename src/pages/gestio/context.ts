import { useOutletContext } from "react-router";
import type { Jo } from "../../types/gestio";

export interface ContextGestio {
  jo: Jo;
  recarregarJo: () => void;
}

export const useGestio = () => useOutletContext<ContextGestio>();

/** Permisos de l'usuari en un casal (els decideix el servidor; aquí només amaguen accions no permeses). */
export function usePermisos(casalId: string) {
  const { jo } = useGestio();
  const permisos = jo.casals.find((c) => c.id === casalId)?.permisos ?? [];
  return (permis: string) => permisos.includes(permis);
}
