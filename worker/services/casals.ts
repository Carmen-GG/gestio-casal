import { errors } from "../http/errors";
import type { CanvisCasal, Casal, Repositoris } from "../repositories/tipus";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { nouId } from "../lib/ids";
import { diferencies, escriuAmbTraca, type ContextOperacio } from "./traca";

export class ServeiCasals {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async obtenir(id: string): Promise<Casal> {
    const casal = await this.repos.casals.perId(id);
    if (!casal) throw errors.noTrobat("No s'ha trobat el casal.");
    return casal;
  }

  async actualitzar(id: string, canvis: CanvisCasal, opcions: ContextOperacio & { motiu?: string | null }): Promise<Casal> {
    const casal = await this.obtenir(id);
    const diff = diferencies(casal, canvis);
    if (Object.keys(diff).length === 0) return casal;
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const motiu = opcions.motiu?.trim() || null;
    const canvisEfectius = Object.fromEntries(Object.keys(diff).map((k) => [k, (canvis as Record<string, unknown>)[k]]));
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.casals.operacioActualitzar(id, casal.versio, canvisEfectius, ara, operacio),
      condicio: { taula: "casals", id, operacio },
      historial: { casal_id: id, entitat: "casal", entitat_id: id, accio: "modificacio", canvis: diff, motiu },
      auditoria: { casal_id: id, tipus_operacio: "casal.modificacio", entitat: "casal", entitat_id: id, motiu, detalls: { camps: Object.keys(diff) } },
      ctx: opcions,
    });
    return this.obtenir(id);
  }
}
