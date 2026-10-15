import type { z } from "zod";
import {
  CAMPS_PERSONA, GRUPS_CAMPS, LLISTA_CAMPS_PERSONA, campCoincideix, clauAlternativa, clauPersona, interpretaCerca, netejaFilaPersona,
  normalitzaDocument, textCerca, type CampPersona, type CondicionsCerca, type DadesPersona, type GrupCamps,
} from "../../shared/domain/persones-plataforma";
import { clauOrdenacioPersona } from "../../shared/domain/ordenacio";
import type { importacioPersones } from "../../shared/schemas/persones-plataforma";
import { errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { PersonaPlataforma, Repositoris } from "../repositories/tipus";
import { emmascaraDocument, type Visibilitat } from "./gestio-sollicituds";
import type { ContextOperacio } from "./traca";

/** Resultats que es mostren d'una cerca; si n'hi ha més, cal afinar-la. */
const LIMIT_RESULTATS = 100;
/** Candidats que es revisen quan la cerca es limita a un camp concret. */
const LIMIT_CANDIDATS_CAMP = 2000;

const visible = (camp: CampPersona, vis: Visibilitat) => CAMPS_PERSONA[camp].nivell === "basic" || vis.contacte;

/** Valor que es mostra d'un camp: els documents, sempre emmascarats. */
const valorVisible = (camp: CampPersona, v: string) => (CAMPS_PERSONA[camp].tipus === "document" ? emmascaraDocument(v)! : v);

/**
 * Persones usuàries de la PGEc importades dels seus llistats (petició de 2026-10-15),
 * per cercar-les per qualsevol camp mentre l'aplicació no s'hi connecti.
 */
export class ServeiPersonesPlataforma {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  /**
   * Importa un bloc de files ja mapades. La mateixa persona (mateix document; si no en té,
   * mateix nom, cognoms i data de naixement) es completa: els valors nous substitueixen els
   * antics, però una cel·la buida mai no esborra el que ja hi havia.
   */
  async importar(casalId: string, d: z.infer<typeof importacioPersones>, ctx: ContextOperacio) {
    if (!(await this.repos.casals.perId(casalId))) throw errors.noTrobat("No s'ha trobat el casal.");
    const ara = isoAra(this.rellotge);
    const omeses: { fila: number; motiu: string }[] = [];
    // Files del bloc agrupades per persona, en l'ordre del fitxer.
    const perClau = new Map<string, { dades: DadesPersona; per_document: boolean; alternativa: string | null }>();
    d.files.forEach((fila, i) => {
      const dades = netejaFilaPersona(fila);
      if (Object.keys(dades).length === 0) return;
      const clau = clauPersona(dades);
      if (!clau) {
        omeses.push({ fila: d.primera_fila + i, motiu: "Falta el document, o bé el nom, el primer cognom i una data de naixement vàlida." });
        return;
      }
      const previ = perClau.get(clau.clau);
      perClau.set(clau.clau, {
        dades: { ...previ?.dades, ...dades }, per_document: clau.per_document,
        alternativa: previ?.alternativa ?? (clau.per_document ? clauAlternativa(dades) : null),
      });
    });

    const claus = [...perClau.keys(), ...[...perClau.values()].flatMap((p) => (p.alternativa ? [p.alternativa] : []))];
    const existents = new Map((await this.repos.personesPlataforma.perClaus(casalId, claus)).map((p) => [p.clau, p]));
    const usats = new Set<string>();
    const desar: PersonaPlataforma[] = [];
    let creades = 0, actualitzades = 0, senseCanvis = 0;

    for (const [clau, nova] of perClau) {
      // Una persona importada abans sense document passa a identificar-se pel document.
      let previa = existents.get(clau);
      if (!previa && nova.alternativa) {
        const alt = existents.get(nova.alternativa);
        if (alt && !usats.has(alt.id)) previa = alt;
      }
      if (previa) usats.add(previa.id);
      const dades: DadesPersona = { ...previa?.dades, ...nova.dades };
      const origens = [...new Set([...(previa?.origens ?? []), d.origen])].sort();
      if (previa && previa.clau === clau && JSON.stringify(ordenat(previa.dades)) === JSON.stringify(ordenat(dades))
        && previa.origens.join() === origens.join()) {
        senseCanvis++;
        continue;
      }
      if (previa) actualitzades++; else creades++;
      desar.push({
        id: previa?.id ?? nouId(), clau,
        document_norm: normalitzaDocument(dades.document) || null,
        nom: dades.nom ?? null, cognom1: dades.cognom1 ?? null, cognom2: dades.cognom2 ?? null,
        clau_ordenacio: clauOrdenacioPersona({ nom: dades.nom ?? "", cognom1: dades.cognom1 ?? "", cognom2: dades.cognom2 ?? null }),
        data_naixement: dades.data_naixement && /^\d{4}-\d{2}-\d{2}$/.test(dades.data_naixement) ? dades.data_naixement : null,
        dades, origens, text_basic: textCerca(dades, "basic"), text_contacte: textCerca(dades, "contacte"),
        creat_el: previa?.creat_el ?? ara, actualitzat_el: ara,
      });
    }
    await this.repos.personesPlataforma.desar(casalId, desar);
    const resultat = { creades, actualitzades, sense_canvis: senseCanvis, omeses };
    // A l'auditoria només hi van recomptes: cap dada personal ni el nom del fitxer.
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "persones_plataforma.importacio", entitat: "casal", entitat_id: casalId,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null,
      detalls: { origen: d.origen, files: d.files.length, creades, actualitzades, sense_canvis: senseCanvis, omeses: omeses.length },
    }, ara);
    return resultat;
  }

  async resum(casalId: string) {
    return this.repos.personesPlataforma.resum(casalId);
  }

  /** Cerca a tots els camps (o a un de sol) que la persona usuària pot veure. */
  async cercar(casalId: string, q: string, camp: CampPersona | "tots", vis: Visibilitat) {
    if (camp !== "tots" && !visible(camp, vis)) throw errors.sensePermis();
    const cond = interpretaCerca(q);
    if (!cond) return { persones: [], total: 0, mes_resultats: false };
    let persones: PersonaPlataforma[];
    let total: number;
    if (camp === "tots") {
      ({ persones, total } = await this.repos.personesPlataforma.cercar(casalId, { ...cond, contacte: vis.contacte, limit: LIMIT_RESULTATS }));
    } else {
      // La cerca general dona els candidats; aquí es comprova que coincideixi en el camp triat.
      const condGeneral = { ...cond, data_naixement: camp === "data_naixement" ? cond.data_naixement : null };
      const candidats = await this.repos.personesPlataforma.cercar(casalId, { ...condGeneral, contacte: vis.contacte, limit: LIMIT_CANDIDATS_CAMP });
      const coincidents = candidats.persones.filter((p) => campCoincideix(p.dades, camp, cond));
      persones = coincidents.slice(0, LIMIT_RESULTATS);
      total = coincidents.length;
    }
    return {
      persones: persones.map((p) => this.resumPersona(p, cond, vis)),
      total, mes_resultats: total > persones.length,
    };
  }

  private resumPersona(p: PersonaPlataforma, cond: CondicionsCerca, vis: Visibilitat) {
    const d = p.dades;
    // Camps on apareix alguna paraula de la cerca, per entendre per què surt la persona.
    const coincidencies = LLISTA_CAMPS_PERSONA
      .filter((c) => visible(c, vis) && !["nom", "cognom1", "cognom2"].includes(c))
      .filter((c) => cond.paraules.some((w) => campCoincideix(d, c, { paraules: [w], data_naixement: null }))
        || (c === "data_naixement" && cond.data_naixement === d.data_naixement))
      .map((c) => CAMPS_PERSONA[c].etiqueta);
    return {
      id: p.id, nom: d.nom ?? "", cognoms: [d.cognom1, d.cognom2].filter(Boolean).join(" "), nom_sentit: d.nom_sentit ?? null,
      document: emmascaraDocument(d.document ?? null), data_naixement: d.data_naixement ?? null,
      localitat_naixement: d.localitat_naixement ?? null, numero_soci: d.numero_soci ?? null,
      telefon: vis.contacte ? d.telefon_mobil ?? d.telefon_fix ?? d.telefon_opcional ?? null : null,
      origens: p.origens, coincidencies,
    };
  }

  /** Fitxa completa: tots els camps visibles, agrupats, i la participació a les activitats del casal. */
  async fitxa(casalId: string, id: string, vis: Visibilitat) {
    const p = await this.repos.personesPlataforma.perId(casalId, id);
    if (!p) throw errors.noTrobat("No s'ha trobat la persona.");
    const grups = (Object.keys(GRUPS_CAMPS) as GrupCamps[]).map((grup) => ({
      grup, titol: GRUPS_CAMPS[grup],
      camps: LLISTA_CAMPS_PERSONA
        .filter((c) => CAMPS_PERSONA[c].grup === grup && visible(c, vis) && p.dades[c])
        .map((c) => ({ camp: c, etiqueta: CAMPS_PERSONA[c].etiqueta, valor: valorVisible(c, p.dades[c]!), tipus: CAMPS_PERSONA[c].tipus ?? "text" })),
    })).filter((g) => g.camps.length > 0);
    const files = await this.repos.personesPlataforma.participacions(
      casalId, p.document_norm, p.clau_ordenacio, p.data_naixement);
    const cicles = new Map<string, { cicle_id: string; cicle: string; data_inici: string | null; sollicituds: number[];
      activitats: { activitat_id: string; activitat: string; preferencia: number; estat: string | null; posicio_espera: number | null; sollicitud_anullada: boolean }[] }>();
    for (const f of files) {
      const c = cicles.get(f.cicle_id) ?? { cicle_id: f.cicle_id, cicle: f.cicle, data_inici: f.cicle_data_inici, sollicituds: [], activitats: [] };
      if (!c.sollicituds.includes(f.sollicitud_numero)) c.sollicituds.push(f.sollicitud_numero);
      c.activitats.push({ activitat_id: f.activitat_id, activitat: f.activitat, preferencia: f.preferencia, estat: f.placa_estat,
        posicio_espera: f.posicio_espera, sollicitud_anullada: f.sollicitud_estat === "anullada" });
      cicles.set(f.cicle_id, c);
    }
    return {
      persona: {
        id: p.id, nom: p.dades.nom ?? "", cognoms: [p.dades.cognom1, p.dades.cognom2].filter(Boolean).join(" "),
        origens: p.origens, actualitzat_el: p.actualitzat_el,
      },
      grups, dades_restringides: !vis.contacte, participacio: [...cicles.values()],
    };
  }
}

const ordenat = (d: DadesPersona) => Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b)));
