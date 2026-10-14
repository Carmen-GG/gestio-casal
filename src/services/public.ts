import type { RespostaActivitatsPubliques, RespostaCiclesPubliques } from "../../shared/api/public";
import { api } from "./api";

const codi = (c: string) => encodeURIComponent(c);

export const serveiPublic = {
  cicles: (codiCasal: string, signal?: AbortSignal) =>
    api.get<RespostaCiclesPubliques>(`/public/casals/${codi(codiCasal)}/cicles`, signal),
  activitats: (codiCasal: string, cicleId: string, signal?: AbortSignal) =>
    api.get<RespostaActivitatsPubliques>(
      `/public/casals/${codi(codiCasal)}/cicles/${encodeURIComponent(cicleId)}/activitats`,
      signal,
    ),
};
