import type { UsFitxer } from "../../shared/domain/cartells";
import type { FitxerCartells, PlantillaCartells, TipusPlantilla } from "../types/gestio";
import { api } from "./api";

const c = (casalId: string) => `/gestio/casals/${encodeURIComponent(casalId)}/cartells`;
/** null = recursos comuns a tots els casals (administració central). */
const ambit = (casalId: string | null) => (casalId === null ? "/gestio/cartells" : c(casalId));

export const serveiCartells = {
  plantilles: (casalId: string, tipus?: TipusPlantilla, s?: AbortSignal) =>
    api.get<{ plantilles: PlantillaCartells[] }>(`${c(casalId)}/plantilles${tipus ? `?tipus=${tipus}` : ""}`, s),
  plantilla: (casalId: string, id: string, s?: AbortSignal) => api.get<{ plantilla: PlantillaCartells }>(`${c(casalId)}/plantilles/${id}`, s),
  crearPlantilla: (casalId: string | null, dades: unknown) => api.post<{ plantilla: PlantillaCartells }>(`${ambit(casalId)}/plantilles`, dades),
  actualitzarPlantilla: (casalId: string, id: string, dades: unknown) =>
    api.patch<{ plantilla: PlantillaCartells }>(`${c(casalId)}/plantilles/${id}`, dades),

  pujarFitxer: (casalId: string | null, us: UsFitxer, fitxer: File) =>
    api.pujar<{ fitxer: FitxerCartells; existent: boolean }>(
      `${ambit(casalId)}/fitxers?${new URLSearchParams({ us, nom: fitxer.name })}`, fitxer, fitxer.type),
  /** Contingut d'un fitxer del casal o comú (les plantilles queden a la memòria cau del navegador). */
  fitxer: (casalId: string, id: string, s?: AbortSignal) => api.descarregar(`${c(casalId)}/fitxers/${id}`, s),
};
