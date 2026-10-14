import { acceptaSollicituds, tipusTransicioCicle, type EstatCicle, ETIQUETES_ESTAT_CICLE } from "../../shared/domain/cicles";
import { ErrorAplicacio, errors } from "../http/errors";
import type { Cicle, Repositoris } from "../repositories/tipus";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { nouId } from "../lib/ids";

export interface ContextOperacio {
  usuariId: string | null;
  idPeticio?: string | null;
}

export class ServeiCicles {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  /**
   * Canvia l'estat d'un cicle aplicant les regles de transició.
   * Les transicions sensibles exigeixen `confirmacio: true` i un motiu.
   * El canvi, l'historial i l'auditoria es desen en un sol lot atòmic; l'historial
   * i l'auditoria només s'insereixen si l'actualització ha tingut efecte.
   */
  async canviarEstat(
    casalId: string,
    cicleId: string,
    cap: EstatCicle,
    opcions: ContextOperacio & { confirmacio?: boolean; motiu?: string | null; versioEsperada?: number },
  ): Promise<Cicle> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
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
    const motiu = opcions.motiu?.trim() || null;
    if (tipus === "requereix_confirmacio" && (opcions.confirmacio !== true || !motiu)) {
      throw new ErrorAplicacio(
        428,
        "confirmacio_requerida",
        "Aquest canvi d'estat requereix una confirmació explícita i un motiu.",
      );
    }

    const ara = isoAra(this.rellotge);
    const condicio = { taula: "cicles" as const, id: cicleId, operacio: nouId() };
    const [actualitzacio] = await this.repos.unitat.executar([
      this.repos.cicles.operacioCanviEstat(casalId, cicleId, cicle.versio, cap, ara, condicio.operacio),
      this.repos.historial.operacioAfegir(
        {
          casal_id: casalId,
          entitat: "cicle",
          entitat_id: cicleId,
          accio: "canvi_estat",
          canvis: { estat: { abans: cicle.estat, despres: cap } },
          usuari_id: opcions.usuariId,
          motiu,
        },
        ara,
        condicio,
      ),
      this.repos.auditoria.operacioRegistrar(
        {
          casal_id: casalId,
          usuari_id: opcions.usuariId,
          tipus_operacio: "cicle.canvi_estat",
          entitat: "cicle",
          entitat_id: cicleId,
          resultat: "exit",
          motiu,
          detalls: { des: cicle.estat, cap, confirmacio: tipus === "requereix_confirmacio" },
          id_peticio: opcions.idPeticio ?? null,
        },
        ara,
        condicio,
      ),
    ]);

    if (!actualitzacio || actualitzacio.canvis !== 1) {
      throw errors.conflicte("conflicte_concurrencia", "El cicle s'ha modificat mentrestant. Torneu-ho a provar.");
    }
    return (await this.repos.cicles.perId(casalId, cicleId))!;
  }

  acceptaSollicituds(cicle: Cicle): boolean {
    return acceptaSollicituds(cicle, this.rellotge.ara());
  }
}
