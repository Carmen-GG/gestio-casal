import type { EstatCicle } from "../../shared/domain/cicles";
import { CAMPS_PERSONALS, configuracioFormulariEfectiva, ETIQUETES_CAMPS, type CampPersonal } from "../../shared/domain/formulari";
import {
  interpretaData, interpretaDataHoraLocal, interpretaDies, interpretaEnter, interpretaHora, localMadridAIso, netejaNomActivitat,
} from "../../shared/domain/importacio";
import { clauOrdenacioPersona, normalitzaText } from "../../shared/domain/ordenacio";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { activitatCrear } from "../../shared/schemas/gestio";
import { dadesPersonalsSollicitud } from "../../shared/schemas/public";
import {
  CAMPS_IMPORTACIO_ACTIVITATS, CAMPS_IMPORTACIO_SOLLICITUDS, MAX_PREFERENCIES_IMPORTACIO, OBLIGATORIS_IMPORTACIO,
} from "../../shared/schemas/sollicituds";
import { ErrorAplicacio, errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Activitat, Cicle, FilaImportacioSollicitud, NovaActivitat, Repositoris } from "../repositories/tipus";
import { codiConfirmacioAleatori } from "./sollicituds-publiques";
import type { ContextOperacio } from "./traca";

export type EstatFila = "valida" | "avis" | "error" | "buida";

export interface ResultatFila {
  fila: number;
  estat: EstatFila;
  errors: string[];
  avisos: string[];
  /** Resum llegible de la fila (sense dades de contacte). */
  descripcio: string;
}

export interface Previsualitzacio {
  files: ResultatFila[];
  resum: { total: number; valides: number; amb_avisos: number; errors: number; buides: number };
  columnes_absents: string[];
}

/** Estats del cicle que admeten importar sol·licituds (abans de l'adjudicació). */
const ESTATS_IMPORTACIO_SOLLICITUDS: EstatCicle[] = ["esborrany", "preparacio", "inscripcions_obertes", "inscripcions_tancades"];
const ESTATS_IMPORTACIO_ACTIVITATS: EstatCicle[] = ["esborrany", "preparacio", "inscripcions_obertes", "inscripcions_tancades"];

const valor = (f: Record<string, string>, camp: string) => (f[camp] ?? "").trim();
const esBuida = (f: Record<string, string>) => Object.values(f).every((v) => !v.trim());

function resum(files: ResultatFila[]): Previsualitzacio["resum"] {
  return {
    total: files.length,
    valides: files.filter((f) => f.estat === "valida" || f.estat === "avis").length,
    amb_avisos: files.filter((f) => f.estat === "avis").length,
    errors: files.filter((f) => f.estat === "error").length,
    buides: files.filter((f) => f.estat === "buida").length,
  };
}

function estatFila(errorsFila: string[], avisos: string[]): EstatFila {
  return errorsFila.length ? "error" : avisos.length ? "avis" : "valida";
}

/** Columnes obligatòries que no apareixen a cap fila (no s'han mapat). */
function columnesAbsents(files: Record<string, string>[], obligatoris: readonly string[]) {
  return obligatoris.filter((c) => !files.some((f) => c in f));
}

/**
 * Importacions en tres passos: el navegador llegeix el fitxer i mapa les columnes;
 * el servidor valida i retorna la previsualització; la confirmació torna a validar
 * i desa només les files vàlides, en un sol lot atòmic.
 */
export class ServeiImportacions {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  private async cicle(casalId: string, cicleId: string, permesos: EstatCicle[]): Promise<Cicle> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    if (!permesos.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "En l'estat actual del cicle no es poden importar dades.");
    }
    return cicle;
  }

  // ---------- Sol·licituds ----------

  private async analitzaSollicituds(casalId: string, cicle: Cicle, files: Record<string, string>[]) {
    for (const f of files) {
      const desconeguts = Object.keys(f).filter((k) => !(CAMPS_IMPORTACIO_SOLLICITUDS as readonly string[]).includes(k));
      if (desconeguts.length) throw errors.peticioInvalida(`Columnes de destinació desconegudes: ${desconeguts.join(", ")}.`);
    }
    const config = configuracioFormulariEfectiva(cicle.configuracio_formulari);
    const activitats = (await this.repos.activitats.llistarPerCicle(casalId, cicle.id)).filter((a) => a.estat !== "arxivada");
    const perCodi = new Map(activitats.filter((a) => a.codi_extern).map((a) => [a.codi_extern!.toLowerCase(), a]));
    const perNom = new Map<string, Activitat[]>();
    for (const a of activitats) perNom.set(normalitzaText(a.nom), [...(perNom.get(normalitzaText(a.nom)) ?? []), a]);
    const existents = await this.repos.gestioSollicituds.totes(casalId, cicle.id);
    const nomsExistents = new Set(existents.map((s) => clauOrdenacioPersona({
      nom: s.participant.nom ?? "", cognom1: s.participant.cognom1 ?? "", cognom2: s.participant.cognom2,
    })));
    const codisVistos = new Map<string, number>();
    const ara = isoAra(this.rellotge);

    const resultats: ResultatFila[] = [];
    const preparades: (Omit<FilaImportacioSollicitud, "numero" | "codi_confirmacio" | "clau_idempotencia"> & { index: number })[] = [];

    for (const [i, f] of files.entries()) {
      const fila = i + 2; // número de fila del full de càlcul (la 1 és la capçalera)
      if (esBuida(f)) {
        resultats.push({ fila, estat: "buida", errors: [], avisos: [], descripcio: "Fila buida (s'ometrà)" });
        continue;
      }
      const errs: string[] = [];
      const avisos: string[] = [];

      // Dades personals: format i minimització segons la configuració del cicle.
      const dadesText: Record<string, string> = {};
      for (const camp of CAMPS_PERSONALS) {
        const v = valor(f, camp);
        if (!v) continue;
        if (!config.camps[camp].actiu) {
          avisos.push(`«${ETIQUETES_CAMPS[camp]}» no es recull en aquest cicle: no s'importarà.`);
          continue;
        }
        dadesText[camp] = camp === "data_naixement" ? (interpretaData(v) ?? `invalida:${v}`) : v;
      }
      if (!valor(f, "nom") || !valor(f, "cognom1")) errs.push("Registre incomplet: cal el nom i el primer cognom.");
      const r = dadesPersonalsSollicitud.safeParse({ nom: "-", cognom1: "-", ...dadesText });
      if (!r.success) {
        for (const [camp, missatge] of Object.entries(errorsPerCamp(r.error))) {
          errs.push(`${ETIQUETES_CAMPS[camp as CampPersonal] ?? camp}: ${camp === "data_naixement" ? "data incorrecta" : missatge}`);
        }
      }
      for (const camp of CAMPS_PERSONALS) {
        if (config.camps[camp].obligatori && !valor(f, camp) && !["nom", "cognom1"].includes(camp)) {
          avisos.push(`Falta «${ETIQUETES_CAMPS[camp]}», obligatori al formulari públic.`);
        }
      }

      // Data de registre (determina l'ordre d'inscripció). Hora local del casal.
      let rebudaEl = ara;
      const dataRegistre = valor(f, "data_registre");
      if (dataRegistre) {
        const dh = interpretaDataHoraLocal(dataRegistre);
        if (!dh) errs.push(`Data de registre incorrecta: «${dataRegistre}».`);
        else {
          rebudaEl = localMadridAIso(dh.data, dh.hora);
          if (rebudaEl > ara) errs.push("La data de registre és posterior a avui.");
          else if (rebudaEl < cicle.obertura_inscripcions || rebudaEl > cicle.tancament_inscripcions) {
            avisos.push("La data de registre és fora del període d'inscripció del cicle.");
          }
        }
      } else {
        avisos.push("Sense data de registre: s'hi posarà la data i hora de la importació.");
      }

      // Preferències: per codi extern o pel nom exacte (sense accents ni majúscules).
      const preferencies: { activitat_id: string; ordre: number }[] = [];
      const valors = Array.from({ length: MAX_PREFERENCIES_IMPORTACIO }, (_, k) => valor(f, `preferencia_${k + 1}`));
      const darrera = valors.findLastIndex(Boolean);
      if (valors.slice(0, darrera + 1).some((v) => !v)) avisos.push("Hi ha preferències buides entremig: s'han renumerat.");
      for (const v of valors) {
        if (!v) continue;
        const perC = perCodi.get(v.toLowerCase());
        const perN = perNom.get(normalitzaText(v)) ?? [];
        const activitat = perC ?? (perN.length === 1 ? perN[0] : undefined);
        if (!activitat) {
          errs.push(perN.length > 1 ? `Activitat ambigua (hi ha més d'una amb aquest nom): «${v}».` : `Activitat que no existeix en aquest cicle: «${v}».`);
          continue;
        }
        if (preferencies.some((p) => p.activitat_id === activitat.id)) {
          errs.push(`L'activitat «${activitat.nom}» apareix més d'una vegada.`);
          continue;
        }
        if (activitat.estat !== "activa") avisos.push(`L'activitat «${activitat.nom}» no està activa.`);
        preferencies.push({ activitat_id: activitat.id, ordre: preferencies.length + 1 });
      }
      if (preferencies.length === 0 && !errs.some((e) => e.startsWith("Activitat"))) errs.push("Registre incomplet: no hi ha cap activitat.");

      // Identificador intern: únic al fitxer; si ja existeix, s'enllaça sense modificar dades.
      const codi = valor(f, "codi_participant_intern") || null;
      let participantExistent: string | null = null;
      if (codi) {
        if (codisVistos.has(codi)) errs.push(`Identificador duplicat al fitxer (també a la fila ${codisVistos.get(codi)}).`);
        else codisVistos.set(codi, fila);
        const existent = await this.repos.gestioSollicituds.participantPerCodiIntern(casalId, codi);
        if (existent) {
          const mateixaPersona = normalitzaText(existent.nom) === normalitzaText(valor(f, "nom"))
            && normalitzaText(existent.cognom1) === normalitzaText(valor(f, "cognom1"));
          if (!mateixaPersona) errs.push("L'identificador intern ja pertany a una altra persona del casal.");
          else {
            participantExistent = existent.id;
            avisos.push("La persona ja existeix (mateix identificador): s'hi enllaçarà sense modificar-ne les dades.");
          }
        }
      }
      const clau = clauOrdenacioPersona({ nom: valor(f, "nom"), cognom1: valor(f, "cognom1"), cognom2: valor(f, "cognom2") || null });
      if (nomsExistents.has(clau)) avisos.push("Possible duplicat: ja hi ha una sol·licitud amb el mateix nom en aquest cicle.");

      const estat = estatFila(errs, avisos);
      resultats.push({
        fila, estat, errors: errs, avisos,
        descripcio: `${valor(f, "nom")} ${valor(f, "cognom1")} ${valor(f, "cognom2")}`.trim() || "(sense nom)",
      });
      if (estat !== "error" && r.success) {
        const dades = Object.fromEntries(CAMPS_PERSONALS.map((c) => [c, (r.data as Record<string, string | null>)[c] ?? null])) as Record<CampPersonal, string | null>;
        preparades.push({
          index: i, sollicitud_id: nouId(), participant_id: participantExistent ?? nouId(), participant_existent: !!participantExistent,
          dades: { ...dades, nom: valor(f, "nom"), cognom1: valor(f, "cognom1") }, codi_participant_intern: codi,
          clau_ordenacio: clau, rebuda_el: rebudaEl, preferencies,
        });
      }
    }
    return { resultats, preparades };
  }

  async previsualitzarSollicituds(casalId: string, cicleId: string, files: Record<string, string>[]): Promise<Previsualitzacio> {
    const cicle = await this.cicle(casalId, cicleId, ESTATS_IMPORTACIO_SOLLICITUDS);
    const absents = columnesAbsents(files, OBLIGATORIS_IMPORTACIO.sollicituds);
    const { resultats } = await this.analitzaSollicituds(casalId, cicle, files);
    return { files: resultats, resum: resum(resultats), columnes_absents: absents };
  }

  async confirmarSollicituds(casalId: string, cicleId: string, d: { files: Record<string, string>[]; clau: string; nom_fitxer?: string; files_esperades: number },
    ctx: ContextOperacio & { usuariId: string }) {
    const cicle = await this.cicle(casalId, cicleId, ESTATS_IMPORTACIO_SOLLICITUDS);
    const absents = columnesAbsents(d.files, OBLIGATORIS_IMPORTACIO.sollicituds);
    if (absents.length) throw errors.peticioInvalida(`Falten columnes obligatòries: ${absents.join(", ")}.`);
    const { resultats, preparades } = await this.analitzaSollicituds(casalId, cicle, d.files);
    const r = resum(resultats);
    if (r.valides !== d.files_esperades) {
      throw errors.conflicte("previsualitzacio_obsoleta", "Les dades han canviat des de la previsualització. Torneu a validar el fitxer.");
    }
    if (r.valides === 0) throw errors.peticioInvalida("No hi ha cap fila vàlida per importar.");

    // Ordre de les noves sol·licituds: data de registre i, a igualtat, ordre del fitxer.
    preparades.sort((a, b) => (a.rebuda_el < b.rebuda_el ? -1 : a.rebuda_el > b.rebuda_el ? 1 : a.index - b.index));
    const ara = isoAra(this.rellotge);
    const importacioId = nouId();
    for (let intent = 1; ; intent++) {
      const base = await this.repos.gestioSollicituds.maxNumero(cicle.id);
      const filesFinals: FilaImportacioSollicitud[] = preparades.map(({ index, ...p }, k) => ({
        ...p, numero: base + k + 1, codi_confirmacio: codiConfirmacioAleatori(), clau_idempotencia: `${d.clau}:${index}`,
      }));
      try {
        await this.repos.unitat.executar([
          ...this.repos.gestioSollicituds.operacionsImportarSollicituds({
            importacio_id: importacioId, casal_id: casalId, cicle_id: cicle.id, clau: d.clau, nom_fitxer: d.nom_fitxer ?? null,
            usuari_id: ctx.usuariId, resum: r, files: filesFinals,
          }, ara),
          this.repos.auditoria.operacioRegistrar({
            casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "importacio.sollicituds", entitat: "importacio",
            entitat_id: importacioId, resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { cicle_id: cicle.id, ...r },
          }, ara),
        ]);
        return { importacio_id: importacioId, importades: filesFinals.length, omeses: r.errors + r.buides, resum: r };
      } catch (e) {
        const m = (e as Error).message;
        if (/UNIQUE constraint failed: importacions/i.test(m)) {
          throw errors.conflicte("importacio_duplicada", "Aquesta importació ja s'havia confirmat. No s'ha tornat a importar.");
        }
        // Una sol·licitud nova (formulari públic) ha agafat el mateix número: es torna a numerar.
        if (/UNIQUE constraint failed: sollicituds\.(cicle_id, numero|codi_confirmacio)/i.test(m) && intent < 3) continue;
        throw e;
      }
    }
  }

  // ---------- Activitats ----------

  private async analitzaActivitats(casalId: string, cicle: Cicle, files: Record<string, string>[]) {
    for (const f of files) {
      const desconeguts = Object.keys(f).filter((k) => !(CAMPS_IMPORTACIO_ACTIVITATS as readonly string[]).includes(k));
      if (desconeguts.length) throw errors.peticioInvalida(`Columnes de destinació desconegudes: ${desconeguts.join(", ")}.`);
    }
    const existents = await this.repos.activitats.llistarPerCicle(casalId, cicle.id);
    const codisExistents = new Set(existents.filter((a) => a.codi_extern).map((a) => a.codi_extern!.toLowerCase()));
    const nomsExistents = new Set(existents.map((a) => normalitzaText(a.nom)));
    const codisVistos = new Map<string, number>();
    const resultats: ResultatFila[] = [];
    const preparades: (NovaActivitat & { id: string })[] = [];

    for (const [i, f] of files.entries()) {
      const fila = i + 2; // número de fila del full de càlcul (la 1 és la capçalera)
      if (esBuida(f)) {
        resultats.push({ fila, estat: "buida", errors: [], avisos: [], descripcio: "Fila buida (s'ometrà)" });
        continue;
      }
      const errs: string[] = [];
      const avisos: string[] = [];
      const cand: Record<string, unknown> = { nom: netejaNomActivitat(valor(f, "nom")) };
      const text = (camp: string) => { const v = valor(f, camp); if (v) cand[camp] = v; };
      ["descripcio", "categoria", "horari_text", "espai", "codi_extern"].forEach(text);
      const capacitat = interpretaEnter(valor(f, "capacitat"));
      if (capacitat === null) errs.push(valor(f, "capacitat") ? `Capacitat no vàlida: «${valor(f, "capacitat")}».` : "Registre incomplet: falta la capacitat.");
      else cand.capacitat = capacitat;
      if (valor(f, "nombre_sessions")) {
        const n = interpretaEnter(valor(f, "nombre_sessions"));
        if (n === null) errs.push(`Nombre de sessions no vàlid: «${valor(f, "nombre_sessions")}».`);
        else cand.nombre_sessions = n;
      }
      if (valor(f, "dies")) {
        const dies = interpretaDies(valor(f, "dies"));
        if (!dies) errs.push(`Dies no reconeguts: «${valor(f, "dies")}». Feu servir dl, dt, dc, dj, dv, ds, dg.`);
        else cand.dies_setmana = dies;
      }
      for (const camp of ["hora_inici", "hora_fi"]) {
        if (!valor(f, camp)) continue;
        const h = interpretaHora(valor(f, camp));
        if (!h) errs.push(`Hora no vàlida: «${valor(f, camp)}».`);
        else cand[camp] = h;
      }
      for (const camp of ["data_inici", "data_fi"]) {
        if (!valor(f, camp)) continue;
        const d = interpretaData(valor(f, camp));
        if (!d) errs.push(`Data incorrecta: «${valor(f, camp)}».`);
        else cand[camp] = d;
      }
      const r = activitatCrear.safeParse(cand);
      if (!r.success) for (const [camp, m] of Object.entries(errorsPerCamp(r.error))) errs.push(camp === "nom" && !cand.nom ? "Registre incomplet: falta el nom." : `${camp}: ${m}`);
      const codi = valor(f, "codi_extern").toLowerCase();
      if (codi) {
        if (codisVistos.has(codi)) errs.push(`Codi duplicat al fitxer (també a la fila ${codisVistos.get(codi)}).`);
        else codisVistos.set(codi, fila);
        if (codisExistents.has(codi)) errs.push("Ja hi ha una activitat amb aquest codi en el cicle (no se sobreescriu).");
      }
      if (cand.nom && nomsExistents.has(normalitzaText(String(cand.nom)))) avisos.push("Ja hi ha una activitat amb aquest nom en el cicle.");
      const estat = estatFila(errs, avisos);
      resultats.push({ fila, estat, errors: errs, avisos, descripcio: String(cand.nom || "(sense nom)") });
      if (estat !== "error" && r.success) preparades.push({ ...r.data, id: nouId(), casal_id: casalId, cicle_id: cicle.id });
    }
    return { resultats, preparades };
  }

  async previsualitzarActivitats(casalId: string, cicleId: string, files: Record<string, string>[]): Promise<Previsualitzacio> {
    const cicle = await this.cicle(casalId, cicleId, ESTATS_IMPORTACIO_ACTIVITATS);
    const { resultats } = await this.analitzaActivitats(casalId, cicle, files);
    return { files: resultats, resum: resum(resultats), columnes_absents: columnesAbsents(files, OBLIGATORIS_IMPORTACIO.activitats) };
  }

  async confirmarActivitats(casalId: string, cicleId: string, d: { files: Record<string, string>[]; clau: string; nom_fitxer?: string; files_esperades: number },
    ctx: ContextOperacio & { usuariId: string }) {
    const cicle = await this.cicle(casalId, cicleId, ESTATS_IMPORTACIO_ACTIVITATS);
    const absents = columnesAbsents(d.files, OBLIGATORIS_IMPORTACIO.activitats);
    if (absents.length) throw errors.peticioInvalida(`Falten columnes obligatòries: ${absents.join(", ")}.`);
    const { resultats, preparades } = await this.analitzaActivitats(casalId, cicle, d.files);
    const r = resum(resultats);
    if (r.valides !== d.files_esperades) {
      throw errors.conflicte("previsualitzacio_obsoleta", "Les dades han canviat des de la previsualització. Torneu a validar el fitxer.");
    }
    if (r.valides === 0) throw errors.peticioInvalida("No hi ha cap fila vàlida per importar.");
    const ara = isoAra(this.rellotge);
    const importacioId = nouId();
    try {
      await this.repos.unitat.executar([
        ...this.repos.gestioSollicituds.operacionsImportarActivitats({
          importacio_id: importacioId, casal_id: casalId, cicle_id: cicle.id, clau: d.clau, nom_fitxer: d.nom_fitxer ?? null,
          usuari_id: ctx.usuariId, resum: r, activitats: preparades,
        }, ara),
        this.repos.auditoria.operacioRegistrar({
          casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "importacio.activitats", entitat: "importacio",
          entitat_id: importacioId, resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { cicle_id: cicle.id, ...r },
        }, ara),
      ]);
    } catch (e) {
      if (/UNIQUE constraint failed: importacions/i.test((e as Error).message)) {
        throw errors.conflicte("importacio_duplicada", "Aquesta importació ja s'havia confirmat. No s'ha tornat a importar.");
      }
      if (/UNIQUE constraint failed: activitats/i.test((e as Error).message)) {
        throw new ErrorAplicacio(409, "codi_duplicat", "Una altra persona ha creat mentrestant una activitat amb el mateix codi. Torneu a validar el fitxer.");
      }
      throw e;
    }
    return { importacio_id: importacioId, importades: preparades.length, omeses: r.errors + r.buides, resum: r };
  }
}
