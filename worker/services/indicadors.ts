import { acceptaSollicituds } from "../../shared/domain/cicles";
import { errors } from "../http/errors";
import type { Rellotge } from "../lib/rellotge";
import type { Repositoris } from "../repositories/tipus";

const ESTATS_PREVIS = ["esborrany", "preparacio"];

/**
 * Quadre de comandament d'un cicle. Totes les xifres surten de la base de dades en el moment
 * de la consulta; no hi ha cap valor estimat ni desat a part.
 */
export class ServeiIndicadors {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async cicle(casalId: string, cicleId: string) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    const d = await this.repos.indicadors.cicle(casalId, cicleId);
    const ara = this.rellotge.ara();

    const actives = d.activitats.filter((a) => a.estat === "activa");
    const ocupades = (a: (typeof d.activitats)[number]) => a.admeses + a.ofertes;
    const total = (f: (a: (typeof d.activitats)[number]) => number) => actives.reduce((n, a) => n + f(a), 0);
    const perEstat = d.sollicituds_per_estat;
    const sollicituds = Object.entries(perEstat).filter(([e]) => e !== "anullada").reduce((n, [, v]) => n + v, 0);

    let inscripcions: "pendents" | "obertes" | "fora_de_termini" | "tancades";
    if (ESTATS_PREVIS.includes(cicle.estat)) inscripcions = "pendents";
    else if (cicle.estat === "inscripcions_obertes") inscripcions = acceptaSollicituds(cicle, ara) ? "obertes" : "fora_de_termini";
    else inscripcions = "tancades";

    const e = d.darrera_execucio;
    return {
      cicle: { id: cicle.id, nom: cicle.nom, estat: cicle.estat },
      calculat_el: ara.toISOString(),
      inscripcions: { estat: inscripcions, obertura: cicle.obertura_inscripcions, tancament: cicle.tancament_inscripcions },
      adjudicacio: e
        ? { estat: e.estat, versio: e.versio, data: e.estat === "confirmada" ? e.confirmada_el : e.executada_el }
        : { estat: "sense_proposta" as const, versio: null, data: null },
      totals: {
        activitats: actives.length,
        activitats_no_actives: d.activitats.length - actives.length,
        sollicituds,
        sollicituds_per_estat: {
          rebuda: perEstat.rebuda ?? 0, validada: perEstat.validada ?? 0, pendent_revisio: perEstat.pendent_revisio ?? 0, anullada: perEstat.anullada ?? 0,
        },
        persones: d.persones,
        places_disponibles: total((a) => a.capacitat),
        places_ocupades: total(ocupades),
        places_lliures: total((a) => Math.max(0, a.capacitat - ocupades(a))),
        admeses: total((a) => a.admeses),
        espera: total((a) => a.espera),
        baixes_voluntaries: total((a) => a.baixes_voluntaries),
        activitats_sense_inscripcions: actives.filter((a) => a.sollicituds === 0).length,
        activitats_mes_demanda: actives.filter((a) => a.sollicituds > a.capacitat).length,
      },
      activitats: actives.map((a) => ({
        id: a.id, nom: a.nom, capacitat: a.capacitat, minim_participants: a.minim_participants,
        sollicituds: a.sollicituds, primera_preferencia: a.primera_preferencia,
        admeses: a.admeses, ofertes: a.ofertes, espera: a.espera, baixes_voluntaries: a.baixes_voluntaries, lliures: Math.max(0, a.capacitat - ocupades(a)),
        sense_inscripcions: a.sollicituds === 0,
        mes_demanda: a.sollicituds > a.capacitat,
      })),
    };
  }
}
