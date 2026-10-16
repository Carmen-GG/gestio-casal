import {
  acceptaSollicituds, ETIQUETES_ESTAT_CICLE, tipusTransicioCicle, type EstatCicle,
} from "../../shared/domain/cicles";
import { ErrorAplicacio, errors } from "../http/errors";
import type { CanvisCicle, Cicle, NouCicle, Repositoris } from "../repositories/tipus";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { nouId } from "../lib/ids";
import { diferencies, escriuAmbTraca, type ContextOperacio } from "./traca";

export type { ContextOperacio };

/** Estats en què encara es pot canviar quines dades personals demana el formulari. */
const ESTATS_FORMULARI_EDITABLE: EstatCicle[] = ["preparacio"];

export class ServeiCicles {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async obtenir(casalId: string, cicleId: string): Promise<Cicle> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    return cicle;
  }

  async crear(casalId: string, dades: Omit<NouCicle, "casal_id">, ctx: ContextOperacio): Promise<Cicle> {
    const casal = await this.repos.casals.perId(casalId);
    if (!casal) throw errors.noTrobat("No s'ha trobat el casal.");
    const ara = isoAra(this.rellotge);
    const id = nouId();
    const operacio = nouId();
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.cicles.operacioCrear(id, { ...dades, casal_id: casalId }, ara, operacio),
      condicio: { taula: "cicles", id, operacio },
      historial: { casal_id: casalId, entitat: "cicle", entitat_id: id, accio: "creacio", canvis: { nom: dades.nom }, motiu: null },
      auditoria: { casal_id: casalId, tipus_operacio: "cicle.creacio", entitat: "cicle", entitat_id: id },
      ctx,
    });
    return this.obtenir(casalId, id);
  }

  async actualitzar(
    casalId: string,
    cicleId: string,
    canvis: CanvisCicle,
    opcions: ContextOperacio & { versio: number; motiu?: string | null },
  ): Promise<Cicle> {
    const cicle = await this.obtenir(casalId, cicleId);
    if (cicle.versio !== opcions.versio) {
      throw errors.conflicte("conflicte_concurrencia", "El cicle s'ha modificat mentrestant. Recarregueu-lo.");
    }
    if (cicle.estat === "arxivat") throw errors.conflicte("cicle_arxivat", "Un cicle arxivat no es pot modificar.");

    const diff = diferencies(cicle, canvis);
    if (Object.keys(diff).length === 0) return cicle;

    if ("configuracio_formulari" in diff && !ESTATS_FORMULARI_EDITABLE.includes(cicle.estat)) {
      throw errors.conflicte(
        "formulari_bloquejat",
        "Els camps del formulari només es poden canviar mentre el cicle és en preparació.",
      );
    }

    // Validació de coherència sobre l'estat final, no només sobre els camps enviats.
    const final = { ...cicle, ...canvis };
    if (final.data_fi < final.data_inici) {
      throw errors.peticioInvalida("Dades no vàlides.", { data_fi: "La data de finalització ha de ser posterior a la d'inici." });
    }
    if (final.tancament_inscripcions <= final.obertura_inscripcions) {
      throw errors.peticioInvalida("Dades no vàlides.", { tancament_inscripcions: "El tancament ha de ser posterior a l'obertura." });
    }

    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const canvisEfectius = Object.fromEntries(Object.keys(diff).map((k) => [k, (canvis as Record<string, unknown>)[k]]));
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.cicles.operacioActualitzar(casalId, cicleId, cicle.versio, canvisEfectius, ara, operacio),
      condicio: { taula: "cicles", id: cicleId, operacio },
      historial: { casal_id: casalId, entitat: "cicle", entitat_id: cicleId, accio: "modificacio", canvis: diff, motiu: opcions.motiu?.trim() || null },
      auditoria: { casal_id: casalId, tipus_operacio: "cicle.modificacio", entitat: "cicle", entitat_id: cicleId, detalls: { camps: Object.keys(diff) } },
      ctx: opcions,
    });
    return this.obtenir(casalId, cicleId);
  }

  /**
   * Canvia l'estat d'un cicle aplicant les regles de transició.
   * Les transicions sensibles exigeixen `confirmacio: true` i un motiu.
   */
  async canviarEstat(
    casalId: string,
    cicleId: string,
    cap: EstatCicle,
    opcions: ContextOperacio & { confirmacio?: boolean; motiu?: string | null; versioEsperada?: number },
  ): Promise<Cicle> {
    const cicle = await this.obtenir(casalId, cicleId);
    if (opcions.versioEsperada !== undefined && opcions.versioEsperada !== cicle.versio) {
      throw errors.conflicte("conflicte_concurrencia", "El cicle s'ha modificat mentrestant. Recarregueu-lo.");
    }

    const tipus = tipusTransicioCicle(cicle.estat, cap);
    if (!tipus) {
      throw errors.conflicte(
        "transicio_no_permesa",
        `No es pot passar de «${ETIQUETES_ESTAT_CICLE[cicle.estat]}» a «${ETIQUETES_ESTAT_CICLE[cap]}».`,
      );
    }
    if (cap === "adjudicat" && !(await this.repos.adjudicacio.execucioConfirmada(cicleId))) {
      throw errors.conflicte("sense_adjudicacio_confirmada",
        "Per marcar el cicle com a adjudicat cal confirmar abans una proposta d'adjudicació.");
    }
    const motiu = opcions.motiu?.trim() || null;
    if (tipus === "requereix_confirmacio" && (opcions.confirmacio !== true || !motiu)) {
      throw new ErrorAplicacio(428, "confirmacio_requerida", "Aquest canvi d'estat requereix una confirmació explícita i un motiu.");
    }

    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.cicles.operacioCanviEstat(casalId, cicleId, cicle.versio, cap, ara, operacio),
      condicio: { taula: "cicles", id: cicleId, operacio },
      historial: {
        casal_id: casalId, entitat: "cicle", entitat_id: cicleId, accio: "canvi_estat",
        canvis: { estat: { abans: cicle.estat, despres: cap } }, motiu,
      },
      auditoria: {
        casal_id: casalId, tipus_operacio: "cicle.canvi_estat", entitat: "cicle", entitat_id: cicleId, motiu,
        detalls: { des: cicle.estat, cap, confirmacio: tipus === "requereix_confirmacio" },
      },
      ctx: opcions,
      missatgeConflicte: "El cicle s'ha modificat mentrestant. Torneu-ho a provar.",
    });
    return this.obtenir(casalId, cicleId);
  }

  acceptaSollicituds(cicle: Cicle): boolean {
    return acceptaSollicituds(cicle, this.rellotge.ara());
  }

  /**
   * Elimina un cicle (petició de 2026-10-16). Només si encara no té inscripcions, places,
   * assistència, adjudicacions ni comunicacions: aquestes dades no s'esborren mai. En aquest cas
   * cal arxivar-lo. Les activitats del cicle (i el seu calendari) s'esborren amb ell.
   */
  async eliminar(casalId: string, cicleId: string, d: { versio: number; motiu: string }, ctx: ContextOperacio) {
    const cicle = await this.obtenir(casalId, cicleId);
    if (cicle.versio !== d.versio) throw errors.conflicte("conflicte_concurrencia", "El cicle s'ha modificat mentrestant. Recarregueu-lo.");
    const dades = await this.repos.cicles.dadesVinculades(cicleId);
    const bloquejants = [
      dades.sollicituds && `${dades.sollicituds} sol·licituds`,
      dades.places && `${dades.places} places`,
      dades.marques_assistencia && "assistència registrada",
      dades.adjudicacions && "adjudicacions o sortejos",
      dades.altres && "baixes, comunicacions o incidències",
    ].filter(Boolean);
    if (bloquejants.length) {
      throw errors.conflicte("cicle_amb_dades",
        `No es pot eliminar el cicle perquè ja té ${bloquejants.join(", ")}. Si ja no s'ha de fer servir, arxiveu-lo.`);
    }
    const ara = isoAra(this.rellotge);
    try {
      await this.repos.unitat.executar([
        ...this.repos.cicles.operacionsEliminar(casalId, cicleId),
        this.repos.auditoria.operacioRegistrar({
          casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "cicle.eliminacio", entitat: "cicle", entitat_id: cicleId,
          resultat: "exit", motiu: d.motiu, id_peticio: ctx.idPeticio ?? null,
          detalls: { nom: cicle.nom, any: cicle.any, estat: cicle.estat, activitats: dades.activitats },
        }, ara),
      ]);
    } catch (e) {
      // Alguna dada vinculada que no s'ha comptat: la clau forana atura l'esborrat i no es perd res.
      if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
        throw errors.conflicte("cicle_amb_dades", "No es pot eliminar el cicle perquè té dades vinculades. Si ja no s'ha de fer servir, arxiveu-lo.");
      }
      throw e;
    }
    return { ok: true, activitats: dades.activitats };
  }
}
