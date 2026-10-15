import type {
  Activitat, AssignacioRol, AutoritzacioTutor, Casal, Cicle, ConfiguracioAdjudicacio, DetallCicle, DetallExecucio, DetallSollicitud, EntradaHistorial,
  DadesGraelles, Execucio, FullAssistencia, Jo, ResumAssistenciaCicle, MovimentPlaca, ResultatBaixaVoluntaria, DadesComunicacions, ComunicacioPlaca, ParellaDuplicada, Previsualitzacio, RespostaLlistat, RespostaPlaces, ResumAdjudicacio, ResultatImportacioActivitats, TaulaExportacio,
  EstatSorteig, IndicadorsCicle, SorteigActivitat,
} from "../types/gestio";
import type { CanalComunicacio, EstatComunicacio, MotiuNoContacte } from "../../shared/schemas/comunicacions";
import { api } from "./api";

const g = (casalId: string) => `/gestio/casals/${encodeURIComponent(casalId)}`;

export const serveiAuth = {
  jo: (s?: AbortSignal) => api.get<Jo>("/auth/jo", s),
  entrar: (testimoni: string) => api.post<{ ok: true }>("/auth/entrar", { testimoni }),
  entrarAmbContrasenya: (email: string, contrasenya: string) =>
    api.post<{ ok: true }>("/auth/entrar-contrasenya", { email, contrasenya }),
  canviarContrasenya: (dades: { actual?: string; nova: string }) => api.post<{ ok: true }>("/auth/contrasenya", dades),
  sortir: () => api.post<{ ok: true }>("/auth/sortir"),
};

export const serveiGestio = {
  casal: (casalId: string, s?: AbortSignal) => api.get<{ casal: Casal }>(g(casalId), s),
  crearCasal: (dades: unknown) => api.post<{ casal: Casal }>("/gestio/casals", dades),

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
  autoritzacioTutor: (casalId: string, id: string, s?: AbortSignal) =>
    api.get<{ autoritzacio: AutoritzacioTutor | null }>(`${g(casalId)}/sollicituds/${id}/autoritzacio-tutor`, s),
  importarActivitatsPgec: (casalId: string, cicleId: string, dades: { files: Record<string, string>[]; nom_fitxer?: string }) =>
    api.post<ResultatImportacioActivitats>(`${g(casalId)}/cicles/${cicleId}/importacions/activitats-pgec`, dades),
  previsualitzarImportacio: (casalId: string, cicleId: string, tipus: "sollicituds" | "activitats", dades: unknown) =>
    api.post<Previsualitzacio>(`${g(casalId)}/cicles/${cicleId}/importacions/${tipus}/previsualitzacio`, dades),
  confirmarImportacio: (casalId: string, cicleId: string, tipus: "sollicituds" | "activitats", dades: unknown) =>
    api.post<{ importacio_id: string; importades: number; omeses: number }>(`${g(casalId)}/cicles/${cicleId}/importacions/${tipus}`, dades),
  exportacioSollicituds: (casalId: string, cicleId: string, activitatId?: string) =>
    api.get<TaulaExportacio>(`${g(casalId)}/cicles/${cicleId}/exportacions/sollicituds${activitatId ? `?activitat=${activitatId}` : ""}`),

  adjudicacio: (casalId: string, cicleId: string, s?: AbortSignal) => api.get<ResumAdjudicacio>(`${g(casalId)}/cicles/${cicleId}/adjudicacio`, s),
  desarParametresAdjudicacio: (casalId: string, cicleId: string, dades: unknown) =>
    api.put<{ configuracio: ConfiguracioAdjudicacio }>(`${g(casalId)}/cicles/${cicleId}/adjudicacio/parametres`, dades),
  calcularProposta: (casalId: string, cicleId: string, dades: unknown) =>
    api.post<{ execucio: Execucio }>(`${g(casalId)}/cicles/${cicleId}/adjudicacio/propostes`, dades),
  execucio: (casalId: string, id: string, s?: AbortSignal) => api.get<DetallExecucio>(`${g(casalId)}/adjudicacions/${id}`, s),
  confirmarExecucio: (casalId: string, id: string, dades: unknown) => api.post<{ execucio: Execucio }>(`${g(casalId)}/adjudicacions/${id}/confirmar`, dades),
  exportacioAdjudicacio: (casalId: string, id: string) => api.get<TaulaExportacio>(`${g(casalId)}/adjudicacions/${id}/exportacio`),
  exportacioSenseActivitat: (casalId: string, id: string) =>
    api.get<TaulaExportacio>(`${g(casalId)}/adjudicacions/${id}/exportacions/sense-activitat`),
  sorteig: (casalId: string, cicleId: string, s?: AbortSignal) => api.get<EstatSorteig>(`${g(casalId)}/cicles/${cicleId}/sorteig`, s),
  assignarNumeros: (casalId: string, cicleId: string) =>
    api.post<{ assignats: number; total: number }>(`${g(casalId)}/cicles/${cicleId}/sorteig/numeros`, {}),
  ferSorteig: (casalId: string, cicleId: string, activitatId: string, dades: { valor_manual?: string; motiu?: string }) =>
    api.post<{ sorteig: SorteigActivitat }>(`${g(casalId)}/cicles/${cicleId}/activitats/${activitatId}/sorteig`, dades),
  anullarSorteig: (casalId: string, cicleId: string, sorteigId: string, motiu: string) =>
    api.post<unknown>(`${g(casalId)}/cicles/${cicleId}/sortejos/${sorteigId}/anullacio`, { motiu }),
  exportacioNumeros: (casalId: string, cicleId: string) =>
    api.get<TaulaExportacio>(`${g(casalId)}/cicles/${cicleId}/exportacions/numeros-sorteig`),
  places: (casalId: string, cicleId: string, s?: AbortSignal) => api.get<RespostaPlaces>(`${g(casalId)}/cicles/${cicleId}/places`, s),
  mourePlaca: (casalId: string, placaId: string, dades: unknown) => api.post<unknown>(`${g(casalId)}/places/${placaId}/moviments`, dades),
  comunicacions: (casalId: string, cicleId: string, s?: AbortSignal) =>
    api.get<DadesComunicacions>(`${g(casalId)}/cicles/${cicleId}/comunicacions`, s),
  registrarComunicacio: (casalId: string, placaId: string, dades: { tipus: "admesa" | "espera"; canal: CanalComunicacio; estat: EstatComunicacio; motiu?: MotiuNoContacte | null; nota?: string | null }) =>
    api.put<{ comunicacio: ComunicacioPlaca }>(`${g(casalId)}/places/${placaId}/comunicacio`, dades),
  desferComunicacio: (casalId: string, placaId: string) => api.post<{ ok: true }>(`${g(casalId)}/places/${placaId}/comunicacio/desfer`),
  baixaVoluntaria: (casalId: string, placaId: string, dades: { versio: number; motiu: string }) =>
    api.post<ResultatBaixaVoluntaria>(`${g(casalId)}/places/${placaId}/baixa-voluntaria`, dades),
  baixaPerAssistencia: (casalId: string, placaId: string, dades: { versio: number; motiu?: string }) =>
    api.post<unknown>(`${g(casalId)}/places/${placaId}/baixa-assistencia`, dades),
  movimentsPlaca: (casalId: string, placaId: string, s?: AbortSignal) =>
    api.get<{ moviments: MovimentPlaca[] }>(`${g(casalId)}/places/${placaId}/moviments`, s),
  exportacioPlaces: (casalId: string, cicleId: string, tipus: "admesos" | "espera") =>
    api.get<TaulaExportacio>(`${g(casalId)}/cicles/${cicleId}/exportacions/places?tipus=${tipus}`),

  indicadors: (casalId: string, cicleId: string, s?: AbortSignal) => api.get<IndicadorsCicle>(`${g(casalId)}/cicles/${cicleId}/indicadors`, s),
  resumAssistencia: (casalId: string, cicleId: string, s?: AbortSignal) =>
    api.get<ResumAssistenciaCicle>(`${g(casalId)}/cicles/${cicleId}/assistencia`, s),
  fullAssistencia: (casalId: string, activitatId: string, s?: AbortSignal) =>
    api.get<FullAssistencia>(`${g(casalId)}/activitats/${activitatId}/assistencia`, s),
  generarSessions: (casalId: string, activitatId: string) =>
    api.post<{ creades: number; existents: number }>(`${g(casalId)}/activitats/${activitatId}/sessions/generacio`),
  afegirSessio: (casalId: string, activitatId: string, dades: unknown) =>
    api.post<{ creades: number }>(`${g(casalId)}/activitats/${activitatId}/sessions`, dades),
  cancellarSessio: (casalId: string, sessioId: string, dades: unknown) => api.post<{ ok: true }>(`${g(casalId)}/sessions/${sessioId}/cancellacio`, dades),
  registrarAssistencia: (casalId: string, sessioId: string, dades: unknown) =>
    api.put<{ noves: number; modificades: number }>(`${g(casalId)}/sessions/${sessioId}/assistencia`, dades),
  graelles: (casalId: string, cicleId: string, telefon = true, s?: AbortSignal) =>
    api.get<DadesGraelles>(`${g(casalId)}/cicles/${cicleId}/exportacions/graelles${telefon ? "" : "?telefon=0"}`, s),
  exportacioAssistencia: (casalId: string, cicleId: string) => api.get<TaulaExportacio>(`${g(casalId)}/cicles/${cicleId}/exportacions/assistencia`),

  historial: (casalId: string, entitat: string, id: string, s?: AbortSignal) =>
    api.get<{ historial: EntradaHistorial[] }>(`${g(casalId)}/historial/${entitat}/${id}`, s),

  assignacions: (casalId: string, s?: AbortSignal) => api.get<{ assignacions: AssignacioRol[] }>(`${g(casalId)}/usuaris`, s),
  assignarRol: (casalId: string, dades: unknown) => api.post<{ assignacio: AssignacioRol }>(`${g(casalId)}/usuaris`, dades),
  revocarRol: (casalId: string, id: string, motiu: string) => api.post<{ ok: true }>(`${g(casalId)}/usuaris/${id}/revocar`, { motiu }),
};
