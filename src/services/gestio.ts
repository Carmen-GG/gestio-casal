import type {
  Activitat, AssignacioRol, Casal, Cicle, DetallCicle, DetallSollicitud, EntradaHistorial, Jo, ParellaDuplicada, Previsualitzacio,
  RespostaLlistat, TaulaExportacio,
} from "../types/gestio";
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

  sollicituds: (casalId: string, cicleId: string, params: Record<string, string>, s?: AbortSignal) =>
    api.get<RespostaLlistat>(`${g(casalId)}/cicles/${cicleId}/sollicituds?${new URLSearchParams(params)}`, s),
  sollicitud: (casalId: string, id: string, s?: AbortSignal) => api.get<{ sollicitud: DetallSollicitud }>(`${g(casalId)}/sollicituds/${id}`, s),
  actualitzarDadesSollicitud: (casalId: string, id: string, dades: unknown) =>
    api.patch<{ sollicitud: DetallSollicitud }>(`${g(casalId)}/sollicituds/${id}/dades`, dades),
  canviarEstatSollicitud: (casalId: string, id: string, dades: unknown) =>
    api.post<{ sollicitud: DetallSollicitud }>(`${g(casalId)}/sollicituds/${id}/estat`, dades),
  canviarPreferencies: (casalId: string, id: string, dades: unknown) =>
    api.put<{ sollicitud: DetallSollicitud }>(`${g(casalId)}/sollicituds/${id}/preferencies`, dades),
  duplicats: (casalId: string, cicleId: string, s?: AbortSignal) =>
    api.get<{ parelles: ParellaDuplicada[] }>(`${g(casalId)}/cicles/${cicleId}/duplicats`, s),
  revisarDuplicat: (casalId: string, cicleId: string, dades: unknown) => api.post<{ ok: true }>(`${g(casalId)}/cicles/${cicleId}/duplicats/revisio`, dades),
  previsualitzarImportacio: (casalId: string, cicleId: string, tipus: "sollicituds" | "activitats", dades: unknown) =>
    api.post<Previsualitzacio>(`${g(casalId)}/cicles/${cicleId}/importacions/${tipus}/previsualitzacio`, dades),
  confirmarImportacio: (casalId: string, cicleId: string, tipus: "sollicituds" | "activitats", dades: unknown) =>
    api.post<{ importacio_id: string; importades: number; omeses: number }>(`${g(casalId)}/cicles/${cicleId}/importacions/${tipus}`, dades),
  exportacioSollicituds: (casalId: string, cicleId: string, activitatId?: string) =>
    api.get<TaulaExportacio>(`${g(casalId)}/cicles/${cicleId}/exportacions/sollicituds${activitatId ? `?activitat=${activitatId}` : ""}`),

  historial: (casalId: string, entitat: string, id: string, s?: AbortSignal) =>
    api.get<{ historial: EntradaHistorial[] }>(`${g(casalId)}/historial/${entitat}/${id}`, s),

  assignacions: (casalId: string, s?: AbortSignal) => api.get<{ assignacions: AssignacioRol[] }>(`${g(casalId)}/usuaris`, s),
  assignarRol: (casalId: string, dades: unknown) => api.post<{ assignacio: AssignacioRol }>(`${g(casalId)}/usuaris`, dades),
  revocarRol: (casalId: string, id: string, motiu: string) => api.post<{ ok: true }>(`${g(casalId)}/usuaris/${id}/revocar`, { motiu }),
};
