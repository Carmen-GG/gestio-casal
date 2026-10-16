import type { UsFitxer } from "../../shared/domain/cartells";
import type { FitxerCartells, FotoCartells, PlantillaCartells, TipusPlantilla } from "../types/gestio";
import { api } from "./api";

const c = (casalId: string) => `/gestio/casals/${encodeURIComponent(casalId)}/cartells`;
/** null = recursos comuns a tots els casals (administració central). */
const ambit = (casalId: string | null) => (casalId === null ? "/gestio/cartells" : c(casalId));

export const serveiCartells = {
  // Fototeca
  fotos: (casalId: string | null, s?: AbortSignal) => api.get<{ fotos: FotoCartells[] }>(`${ambit(casalId)}/fotos`, s),
  pujarImatge: (casalId: string | null, us: UsFitxer, imatge: Blob, nom: string) =>
    api.pujar<{ fitxer: FitxerCartells; existent: boolean }>(`${ambit(casalId)}/fitxers?${new URLSearchParams({ us, nom })}`, imatge, imatge.type),
  afegirFoto: (casalId: string | null, dades: { fitxer_id: string; miniatura_id: string; carpeta: string; nom: string; amplada: number; alcada: number }) =>
    api.post<{ foto: FotoCartells; existent: boolean }>(`${ambit(casalId)}/fotos`, dades),
  retirarFoto: (casalId: string | null, id: string) => api.delete<{ ok: true }>(`${ambit(casalId)}/fotos/${id}`, {}),
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
