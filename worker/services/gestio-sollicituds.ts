import type { EstatCicle } from "../../shared/domain/cicles";
import { CAMPS_PERSONALS, configuracioFormulariEfectiva, type CampPersonal } from "../../shared/domain/formulari";
import { clauOrdenacioPersona, normalitzaText } from "../../shared/domain/ordenacio";
import { missatgeErrorPreferencies, validaPreferencies } from "../../shared/domain/preferencies";
import type { EstatSollicitud } from "../../shared/schemas/sollicituds";
import { errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type {
  CanvisParticipant, Cicle, DetallSollicitud, FilaSollicitud, FiltreSollicituds, OrdreLlistat, Operacio, ParellaDuplicada,
  Participant, Repositoris,
} from "../repositories/tipus";
import type { UsuariAutenticat } from "../auth/permisos";
import type { ContextOperacio } from "./traca";

/** Camps visibles amb el permís bàsic de consulta. La resta requereix «sollicituds.dades_contacte». */
const CAMPS_BASICS: CampPersonal[] = ["nom", "cognom1", "cognom2"];

/** Estats del cicle en què es poden modificar les preferències (abans de l'adjudicació). */
export const ESTATS_PREFERENCIES_EDITABLES: EstatCicle[] = ["preparacio", "inscripcions_obertes", "adjudicacio_en_proces"];
/** Estats del cicle en què es pot canviar l'estat d'una sol·licitud. */
const ESTATS_CANVI_ESTAT: EstatCicle[] = ESTATS_PREFERENCIES_EDITABLES;

/** El DNI/NIE no es mostra mai sencer: només els darrers caràcters per poder-lo contrastar. */
export const emmascaraDocument = (d: string | null) => (d ? `${"•".repeat(Math.max(d.length - 4, 0))}${d.slice(-4)}` : null);

export type Visibilitat = { contacte: boolean };

/** Treu de la fila les dades que la persona usuària no pot veure. */
export function filtraParticipant<T extends { participant: Participant }>(fila: T, vis: Visibilitat): T & { dades_restringides: boolean } {
  const p = { ...fila.participant } as Participant;
  for (const camp of CAMPS_PERSONALS) {
    if (!CAMPS_BASICS.includes(camp) && !vis.contacte) (p as Record<string, unknown>)[camp] = null;
  }
  p.document_identitat = emmascaraDocument(p.document_identitat);
  return { ...fila, participant: p, dades_restringides: !vis.contacte };
}

export function visibilitat(usuari: UsuariAutenticat, casalId: string): Visibilitat {
  return { contacte: usuari.pot("sollicituds.dades_contacte", casalId) };
}

/** Converteix la cerca escrita en paraules normalitzades o en un número de sol·licitud. */
export function filtreCerca(q: string | undefined): Pick<FiltreSollicituds, "paraules" | "numero"> {
  if (!q) return {};
  const t = q.trim();
  if (/^\d{1,7}$/.test(t)) return { numero: Number(t) };
  const paraules = normalitzaText(t).split(" ").filter(Boolean).slice(0, 6);
  return paraules.length ? { paraules } : {};
}

const ORDRES_VISTA: Record<"inscripcio" | "alfabetic", OrdreLlistat> = { inscripcio: "inscripcio", alfabetic: "alfabetic" };

export class ServeiGestioSollicituds {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async cicle(casalId: string, cicleId: string): Promise<Cicle> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    return cicle;
  }

  async llistar(casalId: string, cicleId: string, consulta: {
    vista: "inscripcio" | "alfabetic" | "activitat"; ordre?: OrdreLlistat; dir: "asc" | "desc"; q?: string;
    activitat?: string; estat?: EstatSollicitud; pagina: number; mida: number;
  }, vis: Visibilitat) {
    await this.cicle(casalId, cicleId);
    const filtre: FiltreSollicituds = {
      ...filtreCerca(consulta.q), activitatId: consulta.activitat, estat: consulta.estat,
      ordre: consulta.ordre ?? (consulta.vista === "activitat" ? "alfabetic" : ORDRES_VISTA[consulta.vista]),
      descendent: consulta.dir === "desc", pagina: consulta.pagina, mida: consulta.mida,
    };
    if (consulta.vista === "activitat") {
      const grups = await this.repos.gestioSollicituds.perActivitat(casalId, cicleId, filtre);
      return { vista: "activitat" as const, grups: grups.map((g) => ({ ...g, files: g.files.map((f) => filtraParticipant(f, vis)) })) };
    }
    const { files, total } = await this.repos.gestioSollicituds.llistar(casalId, cicleId, filtre);
    return {
      vista: consulta.vista, total, pagina: consulta.pagina, mida: consulta.mida,
      files: files.map((f) => filtraParticipant(f, vis)),
    };
  }

  async obtenir(casalId: string, id: string): Promise<DetallSollicitud> {
    const s = await this.repos.gestioSollicituds.detall(casalId, id);
    if (!s) throw errors.noTrobat("No s'ha trobat la sol·licitud.");
    const avis = await this.repos.avisosRebuda.perSollicitud(id);
    return { ...s, avis_rebuda: avis && { canal: avis.canal, estat: avis.estat, motiu: avis.motiu, creat_el: avis.creat_el } };
  }

  private comprovaVersio(actual: number, esperada: number) {
    if (actual !== esperada) {
      throw errors.conflicte("conflicte_concurrencia", "La sol·licitud s'ha modificat mentrestant. Recarregueu-la per veure els canvis.");
    }
  }

  private async executa(principal: Operacio, extres: Operacio[], ctx: ContextOperacio, d: {
    casalId: string; taula: "participants" | "sollicituds"; id: string; operacio: string; ara: string;
    sollicitudId: string; accio: "modificacio" | "canvi_estat"; canvis: Record<string, unknown>; motiu: string; tipus: string;
  }) {
    const condicio = { taula: d.taula, id: d.id, operacio: d.operacio };
    const [r] = await this.repos.unitat.executar([
      principal,
      ...extres,
      this.repos.historial.operacioAfegir({
        casal_id: d.casalId, entitat: "sollicitud", entitat_id: d.sollicitudId, accio: d.accio, canvis: d.canvis,
        usuari_id: ctx.usuariId, motiu: d.motiu,
      }, d.ara, condicio),
      this.repos.auditoria.operacioRegistrar({
        casal_id: d.casalId, usuari_id: ctx.usuariId, tipus_operacio: d.tipus, entitat: "sollicitud", entitat_id: d.sollicitudId,
        resultat: "exit", id_peticio: ctx.idPeticio ?? null,
        // Només els noms dels camps: mai els valors personals.
        detalls: { camps: Object.keys(d.canvis) },
      }, d.ara, condicio),
    ]);
    if (!r || r.canvis !== 1) {
      throw errors.conflicte("conflicte_concurrencia", "La sol·licitud s'ha modificat mentrestant. Recarregueu-la per veure els canvis.");
    }
  }

  /**
   * Edició de dades personals. A l'historial només es desa quins camps han canviat,
   * no els valors (minimització: l'historial no ha de duplicar dades personals).
   */
  async actualitzarDades(casalId: string, id: string, dades: Partial<Record<CampPersonal | "codi_participant_intern", string | null>>,
    opcions: ContextOperacio & { versioParticipant: number; motiu: string; vis: Visibilitat }) {
    const s = await this.obtenir(casalId, id);
    const cicle = await this.cicle(casalId, s.cicle_id);
    if (cicle.estat === "arxivat") throw errors.conflicte("cicle_arxivat", "Un cicle arxivat no es pot modificar.");
    this.comprovaVersio(s.participant.versio, opcions.versioParticipant);

    const canvis: CanvisParticipant = {};
    for (const [camp, valor] of Object.entries(dades) as [CampPersonal | "codi_participant_intern", string | null | undefined][]) {
      if (valor === undefined) continue;
      if (!CAMPS_BASICS.includes(camp as CampPersonal) && camp !== "codi_participant_intern" && !opcions.vis.contacte) throw errors.sensePermis();
      if ((s.participant[camp] ?? null) !== valor) canvis[camp] = valor;
    }
    if (canvis.nom === null || canvis.cognom1 === null) {
      throw errors.peticioInvalida("Hi ha dades no vàlides.", { [canvis.nom === null ? "dades.nom" : "dades.cognom1"]: "Aquest camp és obligatori." });
    }
    // Minimització: no es poden afegir dades que el cicle no recull.
    const config = configuracioFormulariEfectiva(cicle.configuracio_formulari);
    const noRecollits = (Object.keys(canvis) as CampPersonal[]).filter((c) => CAMPS_PERSONALS.includes(c) && !config.camps[c].actiu && canvis[c] !== null);
    if (noRecollits.length) {
      throw errors.peticioInvalida("Hi ha dades no vàlides.", Object.fromEntries(noRecollits.map((c) => [`dades.${c}`, "Aquest cicle no recull aquest camp."])));
    }
    if (Object.keys(canvis).length === 0) return this.obtenir(casalId, id);
    if (canvis.nom !== undefined || canvis.cognom1 !== undefined || canvis.cognom2 !== undefined) {
      const p = { ...s.participant, ...canvis };
      canvis.clau_ordenacio = clauOrdenacioPersona({ nom: p.nom!, cognom1: p.cognom1!, cognom2: p.cognom2 });
    }
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const { clau_ordenacio: _, ...visibles } = canvis;
    await this.executa(
      this.repos.gestioSollicituds.operacioActualitzarParticipant(casalId, s.participant.id, s.participant.versio, canvis, ara, operacio),
      [], opcions, {
        casalId, taula: "participants", id: s.participant.id, operacio, ara, sollicitudId: id, accio: "modificacio",
        canvis: Object.fromEntries(Object.keys(visibles).map((k) => [k, { modificat: true }])), motiu: opcions.motiu, tipus: "sollicitud.dades",
      });
    return this.obtenir(casalId, id);
  }

  async canviarEstat(casalId: string, id: string, estat: EstatSollicitud, opcions: ContextOperacio & { versio: number; motiu: string }) {
    const s = await this.obtenir(casalId, id);
    const cicle = await this.cicle(casalId, s.cicle_id);
    if (!ESTATS_CANVI_ESTAT.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "En l'estat actual del cicle ja no es pot canviar l'estat de les sol·licituds.");
    }
    this.comprovaVersio(s.versio, opcions.versio);
    if (s.estat === estat) return s;
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    await this.executa(
      this.repos.gestioSollicituds.operacioActualitzarSollicitud(casalId, id, s.versio, { estat }, ara, operacio),
      [], opcions, {
        casalId, taula: "sollicituds", id, operacio, ara, sollicitudId: id, accio: "canvi_estat",
        canvis: { estat: { abans: s.estat, despres: estat } }, motiu: opcions.motiu, tipus: "sollicitud.canvi_estat",
      });
    return this.obtenir(casalId, id);
  }

  async actualitzarPreferencies(casalId: string, id: string, preferencies: { activitat_id: string; ordre: number | null }[],
    opcions: ContextOperacio & { versio: number; motiu: string }) {
    const s = await this.obtenir(casalId, id);
    const cicle = await this.cicle(casalId, s.cicle_id);
    if (!ESTATS_PREFERENCIES_EDITABLES.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "Les preferències només es poden modificar abans de l'adjudicació.");
    }
    this.comprovaVersio(s.versio, opcions.versio);
    const error = validaPreferencies(preferencies);
    if (error) throw errors.peticioInvalida("Les preferències no són vàlides.", { preferencies: missatgeErrorPreferencies(error) });
    const activitats = new Map((await this.repos.activitats.llistarPerCicle(casalId, cicle.id)).map((a) => [a.id, a]));
    // Es permeten les activitats actives i les que ja tenia la sol·licitud (encara que s'hagin desactivat).
    const teniaJa = new Set(s.preferencies.map((p) => p.activitat_id));
    if (preferencies.some((p) => activitats.get(p.activitat_id)?.estat !== "activa" && !teniaJa.has(p.activitat_id))) {
      throw errors.peticioInvalida("Alguna activitat no està disponible.", { preferencies: "Alguna activitat no està disponible en aquest cicle." });
    }
    const noves = [...preferencies].sort((a, b) => a.ordre! - b.ordre!).map((p) => ({ activitat_id: p.activitat_id, ordre: p.ordre! }));
    const nom = (aid: string) => activitats.get(aid)?.nom ?? aid;
    const abans = s.preferencies.map((p) => `${p.ordre}. ${p.activitat}`);
    const despres = noves.map((p) => `${p.ordre}. ${nom(p.activitat_id)}`);
    if (JSON.stringify(abans) === JSON.stringify(despres)) return s;
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    await this.executa(
      this.repos.gestioSollicituds.operacioActualitzarSollicitud(casalId, id, s.versio, {}, ara, operacio),
      this.repos.gestioSollicituds.operacionsSubstituirPreferencies(id, cicle.id, casalId, noves, operacio),
      opcions, {
        casalId, taula: "sollicituds", id, operacio, ara, sollicitudId: id, accio: "modificacio",
        canvis: { preferencies: { abans, despres } }, motiu: opcions.motiu, tipus: "sollicitud.preferencies",
      });
    return this.obtenir(casalId, id);
  }

  /**
   * Possibles duplicats per a revisió manual. No s'esborra ni s'uneix res
   * automàticament. Els criteris de contacte només s'apliquen si la persona
   * usuària pot veure aquestes dades.
   */
  async duplicats(casalId: string, cicleId: string, vis: Visibilitat): Promise<(ParellaDuplicada & { a: FilaSollicitud & { dades_restringides: boolean }; b: FilaSollicitud & { dades_restringides: boolean } })[]> {
    await this.cicle(casalId, cicleId);
    const files = await this.repos.gestioSollicituds.totes(casalId, cicleId);
    const revisions = new Map((await this.repos.gestioSollicituds.revisionsDuplicats(casalId, cicleId)).map((r) => [`${r.a}|${r.b}`, r]));
    const claus: [ParellaDuplicada["motius"][number], (f: FilaSollicitud) => string | null][] = [
      ["mateixa_persona", (f) => f.participant.id],
      ["mateix_nom", (f) => clauOrdenacioPersona({ nom: f.participant.nom ?? "", cognom1: f.participant.cognom1 ?? "", cognom2: f.participant.cognom2 })],
      ["mateix_codi_intern", (f) => f.participant.codi_participant_intern],
    ];
    if (vis.contacte) {
      claus.push(
        ["mateix_email", (f) => f.participant.email?.toLowerCase() ?? null],
        ["mateix_telefon", (f) => f.participant.telefon?.replace(/\D/g, "").slice(-9) || null],
        ["mateix_document", (f) => f.participant.document_identitat],
      );
    }
    const parelles = new Map<string, ParellaDuplicada>();
    for (const [motiu, clau] of claus) {
      const grups = new Map<string, FilaSollicitud[]>();
      for (const f of files) {
        const k = clau(f);
        if (k) grups.set(k, [...(grups.get(k) ?? []), f]);
      }
      for (const grup of grups.values()) {
        if (grup.length < 2 || grup.length > 25) continue; // grups enormes: probablement un valor genèric, no un duplicat
        for (let i = 0; i < grup.length; i++) {
          for (let j = i + 1; j < grup.length; j++) {
            const [a, b] = grup[i]!.id < grup[j]!.id ? [grup[i]!, grup[j]!] : [grup[j]!, grup[i]!];
            const k = `${a.id}|${b.id}`;
            const p = parelles.get(k) ?? { a, b, motius: [], revisio: null };
            if (!p.motius.includes(motiu)) p.motius.push(motiu);
            const r = revisions.get(k);
            p.revisio = r ? { decisio: r.decisio, motiu: r.motiu, revisat_el: r.revisat_el } : null;
            parelles.set(k, p);
          }
        }
      }
    }
    return [...parelles.values()]
      .sort((x, y) => Number(!!x.revisio) - Number(!!y.revisio) || x.a.numero - y.a.numero)
      .map((p) => ({ ...p, a: filtraParticipant(p.a, vis), b: filtraParticipant(p.b, vis) }));
  }

  async revisarDuplicat(casalId: string, cicleId: string, d: { a: string; b: string; decisio: "no_duplicat" | "duplicat"; motiu?: string },
    ctx: ContextOperacio & { usuariId: string }) {
    if (d.a === d.b) throw errors.peticioInvalida("Cal indicar dues sol·licituds diferents.");
    const [a, b] = d.a < d.b ? [d.a, d.b] : [d.b, d.a];
    for (const id of [a, b]) {
      const s = await this.repos.gestioSollicituds.detall(casalId, id);
      if (!s || s.cicle_id !== cicleId) throw errors.noTrobat("No s'ha trobat la sol·licitud.");
    }
    const ara = isoAra(this.rellotge);
    await this.repos.unitat.executar([
      this.repos.gestioSollicituds.operacioRevisioDuplicat({
        id: nouId(), casal_id: casalId, cicle_id: cicleId, a, b, decisio: d.decisio, motiu: d.motiu?.trim() || null, usuari_id: ctx.usuariId,
      }, ara),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "sollicitud.revisio_duplicat", entitat: "sollicitud", entitat_id: a,
        resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { a, b, decisio: d.decisio },
      }, ara),
    ]);
    return { ok: true };
  }
}

export interface TaulaExportacio {
  titol: string;
  /** Nom del fitxer suggerit, sense dades personals. */
  fitxer: string;
  columnes: string[];
  files: (string | number | null)[][];
}

const ETIQ_ESTAT: Record<EstatSollicitud, string> = { rebuda: "Rebuda", validada: "Validada", pendent_revisio: "Pendent de revisió", anullada: "Anul·lada" };
const ETIQ_ADJ = { pendent: "Sense adjudicar", admesa: "Admesa", llista_espera: "Llista d'espera", sense_placa: "Sense plaça" } as const;

/** Data i hora en hora del casal (Europa/Madrid), en format DD/MM/AAAA HH:MM. */
export function dataHoraLocal(iso: string): string {
  const p = new Intl.DateTimeFormat("ca-ES", {
    timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

const slug = (s: string) => normalitzaText(s).replace(/ /g, "-").slice(0, 60);

/**
 * Taules d'exportació. Es construeixen al servidor amb les mateixes regles de
 * visibilitat que la consulta; el navegador només les converteix a XLSX.
 */
export async function taulaSollicituds(repos: Repositoris, casalId: string, cicle: Cicle, vis: Visibilitat, activitatId?: string): Promise<TaulaExportacio> {
  const totes = await repos.gestioSollicituds.totes(casalId, cicle.id);
  // Només els camps que el cicle recull i que la persona usuària pot veure.
  const config = configuracioFormulariEfectiva(cicle.configuracio_formulari);
  const camps = (["nom", "cognom1", "cognom2", ...(vis.contacte ? ["telefon", "email"] : [])] as CampPersonal[])
    .filter((c) => config.camps[c].actiu || totes.some((s) => s.participant[c]));
  const etiquetes: Record<string, string> = { nom: "Nom", cognom1: "Primer cognom", cognom2: "Segon cognom", telefon: "Telèfon", email: "Correu electrònic" };
  if (activitatId) {
    const activitat = await repos.activitats.perId(casalId, activitatId);
    if (!activitat || activitat.cicle_id !== cicle.id) throw errors.noTrobat("No s'ha trobat l'activitat.");
    const files = totes
      .filter((s) => s.preferencies.some((p) => p.activitat_id === activitatId))
      .map((s) => ({ s, k: clauOrdenacioPersona({ nom: s.participant.nom ?? "", cognom1: s.participant.cognom1 ?? "", cognom2: s.participant.cognom2 }) }))
      .sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.s.numero - y.s.numero))
      .map((x) => x.s);
    return {
      titol: `${activitat.nom} (${cicle.nom})`,
      fitxer: `sollicitants-${slug(activitat.nom)}.xlsx`,
      columnes: ["Núm. sol·licitud", "Data i hora de registre", ...camps.map((c) => etiquetes[c]!), "Preferència per a l'activitat", "Estat", "Estat d'adjudicació"],
      files: files.map((s) => [
        s.numero, dataHoraLocal(s.rebuda_el), ...camps.map((c) => s.participant[c] ?? null),
        s.preferencies.find((p) => p.activitat_id === activitatId)!.ordre, ETIQ_ESTAT[s.estat], ETIQ_ADJ[s.estat_adjudicacio],
      ]),
    };
  }
  const maxPrefs = Math.max(0, ...totes.map((s) => s.preferencies.length));
  return {
    titol: `Sol·licituds · ${cicle.nom}`,
    fitxer: `sollicituds-${slug(cicle.nom)}.xlsx`,
    columnes: ["Núm. sol·licitud", "Data i hora de registre", ...camps.map((c) => etiquetes[c]!), "Estat", "Estat d'adjudicació",
      "Nombre d'activitats", ...Array.from({ length: maxPrefs }, (_, i) => `Preferència ${i + 1}`)],
    files: totes.map((s) => [
      s.numero, dataHoraLocal(s.rebuda_el), ...camps.map((c) => s.participant[c] ?? null), ETIQ_ESTAT[s.estat], ETIQ_ADJ[s.estat_adjudicacio],
      s.preferencies.length, ...Array.from({ length: maxPrefs }, (_, i) => s.preferencies[i]?.activitat ?? null),
    ]),
  };
}
