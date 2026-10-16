import type { EstatPublicacio } from "../../shared/domain/instagram";
import { api } from "./api";

export interface EstatCompteInstagram {
  /** El servidor té el secret per desar testimonis (si no, només es pot publicar a mà). */
  configurat: boolean;
  compte: { nom_usuari: string; connectat_el: string; testimoni_caduca_el: string | null } | null;
}

export interface PublicacioInstagram {
  id: string;
  casal_id: string;
  fitxer_id: string;
  titol: string;
  peu: string;
  estat: EstatPublicacio;
  ig_media_id: string | null;
  enllac: string | null;
  error_missatge: string | null;
  versio: number;
  creat_el: string;
  publicat_el: string | null;
  actualitzat_el: string;
}

const b = (casalId: string) => `/gestio/casals/${encodeURIComponent(casalId)}/instagram`;
type P = { publicacio: PublicacioInstagram };

export const serveiInstagram = {
  compte: (casalId: string, s?: AbortSignal) => api.get<EstatCompteInstagram>(`${b(casalId)}/compte`, s),
  connectar: (casalId: string, testimoni: string) => api.put<EstatCompteInstagram>(`${b(casalId)}/compte`, { testimoni }),
  desconnectar: (casalId: string) => api.post<EstatCompteInstagram>(`${b(casalId)}/compte/desconnecta`),
  publicacions: (casalId: string, s?: AbortSignal) => api.get<{ publicacions: PublicacioInstagram[] }>(`${b(casalId)}/publicacions`, s),
  publicacio: (casalId: string, id: string, s?: AbortSignal) => api.get<P>(`${b(casalId)}/publicacions/${id}`, s),
  crear: (casalId: string, dades: { fitxer_id: string; titol: string; peu: string }) => api.post<P>(`${b(casalId)}/publicacions`, dades),
  actualitzar: (casalId: string, id: string, dades: { versio: number; peu?: string; descartar?: true }) =>
    api.patch<P>(`${b(casalId)}/publicacions/${id}`, dades),
  publicar: (casalId: string, id: string, versio: number) =>
    api.postLent<P>(`${b(casalId)}/publicacions/${id}/publica`, { versio, confirmo: true }),
  marcarManual: (casalId: string, id: string, versio: number, enllac: string | null) =>
    api.post<P>(`${b(casalId)}/publicacions/${id}/manual`, { versio, enllac }),
};
