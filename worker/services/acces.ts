import { errors } from "../http/errors";
import { codiPrimerAcces, resumCodiPrimerAcces } from "../lib/cripto";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Repositoris } from "../repositories/tipus";
import type { ContextOperacio } from "./traca";

/** Vigència del codi de primer accés. */
export const DIES_CODI_PRIMER_ACCES = 7;

export interface CodiLliurat {
  codi: string;
  caduca_el: string;
}

/**
 * Codis de primer accés (decisió de 2026-10-15): qui dona d'alta una persona rep un codi
 * d'un sol ús per fer-li arribar; amb el seu correu i el codi, la persona crea la contrasenya.
 * El codi només es mostra una vegada i a la base de dades només se'n desa el resum.
 */
export class ServeiAcces {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async generarCodi(usuariId: string, casalId: string | null, ctx: ContextOperacio): Promise<CodiLliurat> {
    const codi = codiPrimerAcces();
    const ara = isoAra(this.rellotge);
    const caduca = new Date(this.rellotge.ara().getTime() + DIES_CODI_PRIMER_ACCES * 86_400_000).toISOString();
    await this.repos.sessions.crearCodiPrimerAcces(await resumCodiPrimerAcces(codi), usuariId, ara, caduca);
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "usuari.codi_primer_acces", entitat: "usuari", entitat_id: usuariId,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null,
    }, ara);
    return { codi, caduca_el: caduca };
  }

  /**
   * Un equip de casal només pot lliurar codis a persones que no tenen accés enlloc més:
   * si no, el codi li donaria entrada als altres casals de la persona.
   */
  async exigeixNomesAquestCasal(usuariId: string, casalId: string) {
    const assignacions = await this.repos.usuaris.assignacionsUsuari(usuariId);
    if (assignacions.some((a) => a.casal_id !== casalId)) {
      throw errors.conflicte("acces_altres_casals",
        "Aquesta persona també té accés a altres casals: el codi d'accés l'ha de generar la superadministració.");
    }
  }
}
