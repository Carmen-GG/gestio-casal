import type { EstatCicle } from "../../shared/domain/cicles";
import { ErrorAplicacio, errors } from "../http/errors";
import type { Activitat, CanvisActivitat, EstatActivitat, NovaActivitat, Repositoris } from "../repositories/tipus";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { nouId } from "../lib/ids";
import { diferencies, escriuAmbTraca, type ContextOperacio } from "./traca";

/** Cicles on ja no es poden crear ni modificar activitats. */
const ESTATS_CICLE_TANCATS: EstatCicle[] = ["finalitzat", "arxivat"];
/** A partir d'aquests estats, canviar la capacitat afecta l'adjudicació: cal confirmació. */
const ESTATS_CAPACITAT_SENSIBLE: EstatCicle[] = ["adjudicacio_en_proces", "adjudicat", "publicat"];

const TRANSICIONS_ACTIVITAT: Record<EstatActivitat, EstatActivitat[]> = {
  esborrany: ["activa", "arxivada"],
  activa: ["inactiva", "arxivada"],
  inactiva: ["activa", "arxivada"],
  arxivada: ["inactiva"],
};

export const ETIQUETES_ESTAT_ACTIVITAT: Record<EstatActivitat, string> = {
  esborrany: "Esborrany",
  activa: "Activa",
  inactiva: "Inactiva",
  arxivada: "Arxivada",
};

export class ServeiActivitats {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async obtenir(casalId: string, id: string): Promise<Activitat> {
    const a = await this.repos.activitats.perId(casalId, id);
    if (!a) throw errors.noTrobat("No s'ha trobat l'activitat.");
    return a;
  }

  private async cicleEditable(casalId: string, cicleId: string) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    if (ESTATS_CICLE_TANCATS.includes(cicle.estat)) {
      throw errors.conflicte("cicle_tancat", "Aquest cicle està finalitzat o arxivat i no admet canvis d'activitats.");
    }
    return cicle;
  }

  async crear(casalId: string, cicleId: string, dades: Omit<NovaActivitat, "casal_id" | "cicle_id" | "estat">,
    ctx: ContextOperacio, accio: "creacio" | "duplicacio" = "creacio", origenId?: string): Promise<Activitat> {
    await this.cicleEditable(casalId, cicleId);
    const ara = isoAra(this.rellotge);
    const id = nouId();
    const operacio = nouId();
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.activitats.operacioCrear(id, { ...dades, casal_id: casalId, cicle_id: cicleId, estat: "esborrany" }, ara, operacio),
      condicio: { taula: "activitats", id, operacio },
      historial: {
        casal_id: casalId, entitat: "activitat", entitat_id: id, accio,
        canvis: origenId ? { origen: origenId } : { nom: dades.nom }, motiu: null,
      },
      auditoria: {
        casal_id: casalId, tipus_operacio: `activitat.${accio}`, entitat: "activitat", entitat_id: id,
        detalls: { cicle_id: cicleId, ...(origenId ? { origen: origenId } : {}) },
      },
      ctx,
    });
    return this.obtenir(casalId, id);
  }

  async actualitzar(
    casalId: string,
    id: string,
    canvis: CanvisActivitat,
    opcions: ContextOperacio & { versio: number; confirmacio?: boolean; motiu?: string | null },
  ): Promise<Activitat> {
    const actual = await this.obtenir(casalId, id);
    if (actual.versio !== opcions.versio) {
      throw errors.conflicte("conflicte_concurrencia", "L'activitat s'ha modificat mentrestant. Recarregueu-la.");
    }
    if (actual.estat === "arxivada") throw errors.conflicte("activitat_arxivada", "Una activitat arxivada no es pot modificar.");
    const cicle = await this.cicleEditable(casalId, actual.cicle_id);

    const diff = diferencies(actual, canvis);
    if (Object.keys(diff).length === 0) return actual;
    const motiu = opcions.motiu?.trim() || null;
    if ("capacitat" in diff && ESTATS_CAPACITAT_SENSIBLE.includes(cicle.estat) && (opcions.confirmacio !== true || !motiu)) {
      throw new ErrorAplicacio(428, "confirmacio_requerida",
        "El cicle ja està en adjudicació o adjudicat. Canviar la capacitat requereix confirmació i un motiu.");
    }

    const final = { ...actual, ...canvis };
    if (final.hora_inici && final.hora_fi && final.hora_fi <= final.hora_inici) {
      throw errors.peticioInvalida("Dades no vàlides.", { hora_fi: "L'hora de finalització ha de ser posterior a la d'inici." });
    }
    if (final.data_inici && final.data_fi && final.data_fi < final.data_inici) {
      throw errors.peticioInvalida("Dades no vàlides.", { data_fi: "La data de finalització ha de ser posterior a la d'inici." });
    }

    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const canvisEfectius = Object.fromEntries(Object.keys(diff).map((k) => [k, (canvis as Record<string, unknown>)[k]]));
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.activitats.operacioActualitzar(casalId, id, actual.versio, canvisEfectius, ara, operacio),
      condicio: { taula: "activitats", id, operacio },
      historial: { casal_id: casalId, entitat: "activitat", entitat_id: id, accio: "modificacio", canvis: diff, motiu },
      auditoria: { casal_id: casalId, tipus_operacio: "activitat.modificacio", entitat: "activitat", entitat_id: id, motiu, detalls: { camps: Object.keys(diff) } },
      ctx: opcions,
    });
    return this.obtenir(casalId, id);
  }

  async canviarEstat(casalId: string, id: string, cap: EstatActivitat,
    opcions: ContextOperacio & { versio: number; motiu?: string | null }): Promise<Activitat> {
    const actual = await this.obtenir(casalId, id);
    if (actual.versio !== opcions.versio) {
      throw errors.conflicte("conflicte_concurrencia", "L'activitat s'ha modificat mentrestant. Recarregueu-la.");
    }
    await this.cicleEditable(casalId, actual.cicle_id);
    if (!TRANSICIONS_ACTIVITAT[actual.estat].includes(cap)) {
      throw errors.conflicte("transicio_no_permesa",
        `No es pot passar de «${ETIQUETES_ESTAT_ACTIVITAT[actual.estat]}» a «${ETIQUETES_ESTAT_ACTIVITAT[cap]}».`);
    }
    const motiu = opcions.motiu?.trim() || null;
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.activitats.operacioActualitzar(casalId, id, actual.versio, { estat: cap }, ara, operacio),
      condicio: { taula: "activitats", id, operacio },
      historial: {
        casal_id: casalId, entitat: "activitat", entitat_id: id, accio: cap === "arxivada" ? "arxivat" : "canvi_estat",
        canvis: { estat: { abans: actual.estat, despres: cap } }, motiu,
      },
      auditoria: { casal_id: casalId, tipus_operacio: "activitat.canvi_estat", entitat: "activitat", entitat_id: id, motiu, detalls: { des: actual.estat, cap } },
      ctx: opcions,
    });
    return this.obtenir(casalId, id);
  }

  /** Crea una còpia en esborrany, al mateix cicle o a un altre cicle del mateix casal. */
  async duplicar(casalId: string, id: string, opcions: ContextOperacio & { cicle_id?: string; nom?: string }): Promise<Activitat> {
    const o = await this.obtenir(casalId, id);
    const cicleDesti = opcions.cicle_id ?? o.cicle_id;
    const nom = opcions.nom ?? (cicleDesti === o.cicle_id ? `${o.nom} (còpia)` : o.nom);
    return this.crear(casalId, cicleDesti, {
      nom, descripcio: o.descripcio, categoria: o.categoria, dies_setmana: o.dies_setmana, hora_inici: o.hora_inici,
      hora_fi: o.hora_fi, horari_text: o.horari_text, data_inici: o.data_inici, data_fi: o.data_fi, espai: o.espai, destinataris: o.destinataris, grup: o.grup,
      capacitat: o.capacitat, nombre_sessions: o.nombre_sessions, minim_participants: o.minim_participants, informacio_difusio: o.informacio_difusio,
      configuracio_continuitat: o.configuracio_continuitat, codi_extern: null,
    }, opcions, "duplicacio", o.id);
  }
}
