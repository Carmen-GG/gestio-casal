import type { Activitat, AssignacioRol, Casal, Cicle, DetallCicle, EntradaHistorial, Jo } from "../types/gestio";
import { api } from "./api";

const g = (casalId: string) => `/gestio/casals/${encodeURIComponent(casalId)}`;

export const serveiAuth = {
  jo: (s?: AbortSignal) => api.get<Jo>("/auth/jo", s),
  entrar: (testimoni: string) => api.post<{ ok: true }>("/auth/entrar", { testimoni }),
  sortir: () => api.post<{ ok: true }>("/auth/sortir"),
};

export const serveiGestio = {
  casal: (casalId: string, s?: AbortSignal) => api.get<{ casal: Casal }>(g(casalId), s),

  cicles: (casalId: string, s?: AbortSignal) => api.get<{ cicles: Cicle[] }>(`${g(casalId)}/cicles`, s),
  cicle: (casalId: string, cicleId: string, s?: AbortSignal) => api.get<DetallCicle>(`${g(casalId)}/cicles/${cicleId}`, s),
  crearCicle: (casalId: string, dades: unknown) => api.post<{ cicle: Cicle }>(`${g(casalId)}/cicles`, dades),
  actualitzarCicle: (casalId: string, cicleId: string, dades: unknown) => api.patch<{ cicle: Cicle }>(`${g(casalId)}/cicles/${cicleId}`, dades),
  canviarEstatCicle: (casalId: string, cicleId: string, dades: unknown) => api.post<{ cicle: Cicle }>(`${g(casalId)}/cicles/${cicleId}/estat`, dades),

  activitats: (casalId: string, cicleId: string, s?: AbortSignal) =>
    api.get<{ activitats: Activitat[] }>(`${g(casalId)}/cicles/${cicleId}/activitats`, s),
  crearActivitat: (casalId: string, cicleId: string, dades: unknown) =>
    api.post<{ activitat: Activitat }>(`${g(casalId)}/cicles/${cicleId}/activitats`, dades),
  actualitzarActivitat: (casalId: string, id: string, dades: unknown) => api.patch<{ activitat: Activitat }>(`${g(casalId)}/activitats/${id}`, dades),
  canviarEstatActivitat: (casalId: string, id: string, dades: unknown) => api.post<{ activitat: Activitat }>(`${g(casalId)}/activitats/${id}/estat`, dades),
  duplicarActivitat: (casalId: string, id: string) => api.post<{ activitat: Activitat }>(`${g(casalId)}/activitats/${id}/duplicar`, {}),

  historial: (casalId: string, entitat: string, id: string, s?: AbortSignal) =>
    api.get<{ historial: EntradaHistorial[] }>(`${g(casalId)}/historial/${entitat}/${id}`, s),

  assignacions: (casalId: string, s?: AbortSignal) => api.get<{ assignacions: AssignacioRol[] }>(`${g(casalId)}/usuaris`, s),
  assignarRol: (casalId: string, dades: unknown) => api.post<{ assignacio: AssignacioRol }>(`${g(casalId)}/usuaris`, dades),
  revocarRol: (casalId: string, id: string, motiu: string) => api.post<{ ok: true }>(`${g(casalId)}/usuaris/${id}/revocar`, { motiu }),
};
