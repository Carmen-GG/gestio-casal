import { errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { CategoriaIncidencia, Repositoris } from "../repositories/tipus";
import type { ContextOperacio } from "./traca";

/**
 * Incidències registrades pel casal (petició de 2026-10-16). Alimenten el quadre de
 * comandament de la superadministració. La descripció no ha de contenir dades personals.
 */
export class ServeiIncidencies {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async llistar(casalId: string, any: number | null) {
    const [incidencies, activitats] = await Promise.all([this.repos.incidencies.llistar(casalId, any), this.repos.incidencies.activitats(casalId)]);
    return { incidencies, activitats };
  }

  async crear(casalId: string, d: { data: string; categoria: CategoriaIncidencia; descripcio: string; activitat_id?: string | null }, ctx: ContextOperacio & { usuariId: string }) {
    if (d.activitat_id && !(await this.repos.activitats.perId(casalId, d.activitat_id))) throw errors.noTrobat("No s'ha trobat l'activitat.");
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.repos.incidencies.crear({ id, casal_id: casalId, data: d.data, categoria: d.categoria, descripcio: d.descripcio, activitat_id: d.activitat_id ?? null, usuari_id: ctx.usuariId }, ara);
    // A l'auditoria només la categoria: la descripció és text lliure.
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "incidencies.alta", entitat: "incidencia", entitat_id: id,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { categoria: d.categoria },
    }, ara);
    return { id };
  }

  async resoldre(casalId: string, id: string, d: { resolucio?: string | null }, ctx: ContextOperacio & { usuariId: string }) {
    const ara = isoAra(this.rellotge);
    if (!(await this.repos.incidencies.resoldre(casalId, id, { resolucio: d.resolucio ?? null, usuari_id: ctx.usuariId }, ara))) {
      throw errors.conflicte("transicio_no_permesa", "La incidència no existeix o ja està resolta.");
    }
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "incidencies.resolucio", entitat: "incidencia", entitat_id: id,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null,
    }, ara);
    return { ok: true };
  }
}
