import {
  activitatsAmbSorteig, adjudica, PARAMETRES_INICIALS, VERSIO_MOTOR, type EntradaMotor, type ParametresAdjudicacio, type Sorteig,
} from "../../shared/domain/adjudicacio";
import { normalitzaText } from "../../shared/domain/ordenacio";
import {
  ACCIONS_OCUPEN_PLACA, ACCIONS_PLACA, ETIQUETES_ESTAT_PLACA, ETIQUETES_MOTIU_NO_ADJUDICADA, ETIQUETES_RESULTAT,
  type AccioPlaca, type EstatPlaca,
} from "../../shared/schemas/adjudicacio";
import { ErrorAplicacio, errors } from "../http/errors";
import { resumSha256, testimoniAleatori } from "../lib/cripto";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Cicle, Execucio, FilaPlaca, FilaResultat, Repositoris, SorteigActivitat } from "../repositories/tipus";
import { dataHoraLocal, filtraParticipant, type TaulaExportacio, type Visibilitat } from "./gestio-sollicituds";
import type { ContextOperacio } from "./traca";

/** Estats del cicle en què es poden desar paràmetres d'adjudicació. */
const ESTATS_PARAMETRES = ["esborrany", "preparacio", "inscripcions_obertes", "inscripcions_tancades", "adjudicacio_en_proces"];
/** Estats del cicle en què es gestionen les places (després de confirmar l'adjudicació). */
export const ESTATS_PLACES = ["adjudicat", "publicat"];

/** Estats del cicle en què es fan els sortejos i s'assignen els números. */
const ESTATS_SORTEIG = ["inscripcions_tancades", "adjudicacio_en_proces"];

const LLETRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Enter uniforme entre 1 i `maxim` amb un generador criptogràfic (sense biaix de mòdul). */
export function enterAleatori(maxim: number): number {
  if (!Number.isInteger(maxim) || maxim < 1 || maxim > 2 ** 32) throw new Error("rang_no_valid");
  const limit = Math.floor(2 ** 32 / maxim) * maxim;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0]! >= limit);
  return (b[0]! % maxim) + 1;
}

/** Lletra sortejada al servidor amb un generador criptogràfic (sense biaix). */
const lletraAleatoria = () => LLETRES[enterAleatori(26) - 1]!;

/** Permutació aleatòria (Fisher-Yates amb generador criptogràfic). */
function barreja<T>(llista: T[]): T[] {
  const r = [...llista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = enterAleatori(i + 1) - 1;
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

const textMotiu = (motiu: string | null) => (motiu ? ETIQUETES_MOTIU_NO_ADJUDICADA[motiu as keyof typeof ETIQUETES_MOTIU_NO_ADJUDICADA] ?? motiu : null);
const nomPersona = (p: { cognom1: string | null; cognom2: string | null; nom: string | null }) =>
  `${[p.cognom1, p.cognom2].filter(Boolean).join(" ")}, ${p.nom ?? ""}`;
const slug = (s: string) => normalitzaText(s).replace(/ /g, "-").slice(0, 60);

export class ServeiAdjudicacio {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  async cicle(casalId: string, cicleId: string): Promise<Cicle> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    return cicle;
  }

  /** Estat de l'adjudicació d'un cicle: paràmetres vigents, versions i execucions. */
  async resum(casalId: string, cicleId: string) {
    const cicle = await this.cicle(casalId, cicleId);
    const [configuracions, execucions] = await Promise.all([
      this.repos.adjudicacio.configuracions(cicleId),
      this.repos.adjudicacio.execucions(casalId, cicleId),
    ]);
    return {
      estat_cicle: cicle.estat,
      configuracio: configuracions[0] ?? null,
      versions_configuracio: configuracions,
      parametres_inicials: PARAMETRES_INICIALS,
      execucions,
      pot_desar_parametres: ESTATS_PARAMETRES.includes(cicle.estat),
      pot_calcular: cicle.estat === "adjudicacio_en_proces" && configuracions.length > 0,
    };
  }

  async desarParametres(casalId: string, cicleId: string, d: { parametres: ParametresAdjudicacio; versio_actual: number | null; motiu?: string }, ctx: ContextOperacio) {
    const cicle = await this.cicle(casalId, cicleId);
    if (!ESTATS_PARAMETRES.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "Els paràmetres d'adjudicació no es poden canviar en aquest estat del cicle.");
    }
    const vigent = await this.repos.adjudicacio.configuracioVigent(cicleId);
    if ((vigent?.versio ?? null) !== d.versio_actual) {
      throw errors.conflicte("conflicte_concurrencia", "Els paràmetres s'han modificat mentrestant. Recarregueu-los.");
    }
    const ara = isoAra(this.rellotge);
    const versio = (vigent?.versio ?? 0) + 1;
    const id = nouId();
    const [r] = await this.repos.unitat.executar([this.repos.adjudicacio.operacioDesarConfiguracio({
      id, cicle_id: cicleId, versio, versio_anterior: vigent?.versio ?? null, parametres: d.parametres, usuari_id: ctx.usuariId!,
    }, ara)]);
    if (!r || r.canvis !== 1) throw errors.conflicte("conflicte_concurrencia", "Els paràmetres s'han modificat mentrestant. Recarregueu-los.");
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "adjudicacio.parametres", entitat: "cicle", entitat_id: cicleId,
      resultat: "exit", motiu: d.motiu?.trim() || null, id_peticio: ctx.idPeticio ?? null, detalls: { versio, parametres: d.parametres },
    }, ara);
    return this.repos.adjudicacio.configuracioVigent(cicleId);
  }

  /** Prepara l'entrada del motor i en calcula l'empremta (per detectar canvis entre la proposta i la confirmació). */
  private async entradaMotor(casalId: string, cicleId: string, parametres: ParametresAdjudicacio) {
    const dades = await this.repos.adjudicacio.dadesMotor(casalId, cicleId);
    const estats = new Set<string>(parametres.estats_sollicitud);
    const sollicituds = dades.sollicituds.filter((s) => estats.has(s.estat));
    const sense = { parelles: new Set<string>(), cicle_anterior: null };
    const [continuitat, esperaAnterior, excloses, sortejos] = await Promise.all([
      parametres.prioritat_continuitat ? this.repos.adjudicacio.continuitat(casalId, cicleId) : sense,
      parametres.prioritat_espera_anterior
        ? this.repos.adjudicacio.esperaAnterior(casalId, cicleId, parametres.preferencia_maxima_espera_anterior) : sense,
      this.repos.adjudicacio.parellesExcloses(cicleId),
      parametres.criteri_ordre === "sorteig_activitat" ? this.repos.adjudicacio.sortejos(cicleId) : Promise.resolve([]),
    ]);
    // Només compten els sortejos vigents del tipus configurat.
    const vigents = sortejos.filter((so) => so.estat === "vigent" && so.tipus === parametres.tipus_sorteig
      && (so.tipus === "lletra" || so.numeracio === parametres.numeracio_sorteig));
    const mapaSortejos = new Map<string, Sorteig>(vigents.map((so) => [so.activitat_id, { tipus: so.tipus, valor: so.valor }]));
    const entrada: Omit<EntradaMotor, "lletra" | "llavor"> = {
      sollicituds: sollicituds.map(({ estat: _e, ...s }) => s),
      activitats: dades.activitats.map(({ id, capacitat, disponible, grup }) => ({ id, capacitat, disponible, grup })),
      limits_grups: dades.limits_grups,
      parametres, continuitat: continuitat.parelles, excloses, espera_anterior: esperaAnterior.parelles, sortejos: mapaSortejos,
    };
    const empremta = await resumSha256(JSON.stringify({
      s: entrada.sollicituds, a: entrada.activitats, p: parametres, lg: entrada.limits_grups,
      c: [...continuitat.parelles].sort(), e: [...excloses].sort(), ea: [...esperaAnterior.parelles].sort(),
      so: [...mapaSortejos.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    }));
    return {
      entrada, empremta, dades, continuitat, esperaAnterior, excloses, vigents,
      nombreFora: dades.sollicituds.length - sollicituds.length,
    };
  }

  /** Comprova que hi ha tot el que cal per al sorteig per activitat (números i sortejos). */
  private comprovaSortejos(entrada: Omit<EntradaMotor, "lletra" | "llavor">, dades: { activitats: { id: string; nom: string }[] }) {
    const p = entrada.parametres;
    if (p.criteri_ordre !== "sorteig_activitat") return;
    if (p.tipus_sorteig === "numero" && p.numeracio_sorteig === "aleatoria" && entrada.sollicituds.some((s) => s.numero_sorteig == null)) {
      throw errors.conflicte("numeros_pendents", "Hi ha sol·licituds sense número de sorteig. Assigneu els números abans de calcular.");
    }
    const pendents = activitatsAmbSorteig(entrada).filter((id) => !entrada.sortejos?.has(id));
    if (pendents.length > 0) {
      const noms = pendents.map((id) => dades.activitats.find((a) => a.id === id)?.nom ?? id);
      throw errors.conflicte("sortejos_pendents", `Falta fer el sorteig de: ${noms.join(", ")}.`);
    }
  }

  async calcularProposta(casalId: string, cicleId: string, d: { lletra?: string }, ctx: ContextOperacio) {
    const cicle = await this.cicle(casalId, cicleId);
    if (cicle.estat !== "adjudicacio_en_proces") {
      throw errors.conflicte("cicle_no_en_adjudicacio", "Per calcular una proposta, el cicle ha d'estar «En procés d'adjudicació».");
    }
    const config = await this.repos.adjudicacio.configuracioVigent(cicleId);
    if (!config) throw errors.conflicte("sense_parametres", "Abans de calcular cal desar els paràmetres d'adjudicació del cicle.");
    const p = config.parametres;
    const { entrada, empremta, dades, continuitat, esperaAnterior, excloses, vigents, nombreFora } = await this.entradaMotor(casalId, cicleId, p);
    if (entrada.sollicituds.length === 0) throw errors.conflicte("sense_sollicituds", "No hi ha cap sol·licitud que entri a l'adjudicació.");
    this.comprovaSortejos(entrada, dades);
    // Només es registren els sortejos que han decidit alguna cosa (activitats amb més sol·licituds que places).
    const calien = new Set(p.criteri_ordre === "sorteig_activitat" ? activitatsAmbSorteig(entrada) : []);
    const lletra = p.criteri_ordre === "lletra" ? (d.lletra?.toUpperCase() ?? lletraAleatoria()) : null;
    const llavor = p.criteri_ordre === "aleatori" ? testimoniAleatori(16) : null;
    const sortida = adjudica({ ...entrada, lletra, llavor });

    const ara = isoAra(this.rellotge);
    const id = nouId();
    const operacio = nouId();
    const versio = (await this.repos.adjudicacio.maxVersioExecucio(cicleId)) + 1;
    const resum = {
      ...sortida.resum, empremta, versio_motor: VERSIO_MOTOR, parametres: p,
      sollicituds_fora_adjudicacio: nombreFora, parelles_excloses: excloses.size, parelles_continuitat: continuitat.parelles.size,
      parelles_espera_anterior: esperaAnterior.parelles.size,
      cicle_anterior: continuitat.cicle_anterior ?? esperaAnterior.cicle_anterior,
      noms_activitats: Object.fromEntries(dades.activitats.map((a) => [a.id, a.nom])),
      // Sortejos aplicats, per poder-los consultar i reproduir el resultat.
      sortejos: vigents.filter((so) => calien.has(so.activitat_id)).map((so) => ({
        id: so.id, activitat_id: so.activitat_id, tipus: so.tipus, valor: so.valor, numeracio: so.numeracio, origen: so.origen,
        realitzat_el: so.realitzat_el,
      })),
    };
    const condicio = { taula: "execucions_adjudicacio" as const, id, operacio };
    const resultats = await this.repos.unitat.executar([
      ...this.repos.adjudicacio.operacionsNovaProposta({
        id, casal_id: casalId, cicle_id: cicleId, configuracio_id: config.id, versio, lletra, llavor, resum,
        usuari_id: ctx.usuariId!, operacio, resultats: sortida.resultats,
      }, ara),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "adjudicacio.proposta", entitat: "execucio_adjudicacio", entitat_id: id,
        resultat: "exit", id_peticio: ctx.idPeticio ?? null,
        detalls: { cicle_id: cicleId, versio, configuracio_versio: config.versio, lletra, llavor, resultats: sortida.resultats.length },
      }, ara, condicio),
    ]);
    if (resultats[1]?.canvis !== 1) {
      throw errors.conflicte("conflicte_concurrencia", "El cicle o els paràmetres han canviat mentrestant. Torneu-ho a provar.");
    }
    return (await this.repos.adjudicacio.execucio(casalId, id))!;
  }

  async execucio(casalId: string, id: string): Promise<Execucio> {
    const e = await this.repos.adjudicacio.execucio(casalId, id);
    if (!e) throw errors.noTrobat("No s'ha trobat l'adjudicació.");
    return e;
  }

  /** Execució amb els resultats agrupats per activitat. */
  async detallExecucio(casalId: string, id: string, vis: Visibilitat) {
    const execucio = await this.execucio(casalId, id);
    const cicle = await this.cicle(casalId, execucio.cicle_id);
    const resultats = await this.repos.adjudicacio.resultats(id);
    const activitats = await this.repos.activitats.llistarPerCicle(casalId, cicle.id);
    const grups = activitats
      .map((a) => {
        const propis = resultats.filter((r) => r.activitat_id === a.id);
        const admeses = propis.filter((r) => r.resultat === "admesa").length;
        return {
          activitat_id: a.id, activitat: a.nom, capacitat: a.capacitat, estat: a.estat,
          minim_participants: a.minim_participants, sota_minim: a.minim_participants !== null && admeses < a.minim_participants,
          resultats: propis.map((r) => filtraParticipant(r, vis)),
        };
      })
      .filter((g) => g.resultats.length > 0);
    const confirmada = await this.repos.adjudicacio.execucioConfirmada(cicle.id);
    return {
      execucio, cicle: { id: cicle.id, nom: cicle.nom, estat: cicle.estat }, grups,
      sense_activitat: this.senseActivitat(resultats, activitats).map((f) => ({ ...f, ...filtraParticipant({ participant: f.participant }, vis) })),
      substitueix: execucio.estat === "proposta" && confirmada ? { id: confirmada.id, versio: confirmada.versio } : null,
      pot_confirmar: execucio.estat === "proposta" && cicle.estat === "adjudicacio_en_proces",
    };
  }

  /**
   * Persones que no han obtingut cap activitat: quantes n'havien demanat i on són
   * (llista d'espera i posició, o el motiu). Per revisar-les a mà.
   */
  private senseActivitat(resultats: FilaResultat[], activitats: { id: string; nom: string }[]) {
    const perSollicitud = new Map<string, FilaResultat[]>();
    for (const r of resultats) perSollicitud.set(r.sollicitud_id, [...(perSollicitud.get(r.sollicitud_id) ?? []), r]);
    const nom = new Map(activitats.map((a) => [a.id, a.nom]));
    return [...perSollicitud.entries()]
      .filter(([, rs]) => !rs.some((r) => r.resultat === "admesa"))
      .map(([sollicitudId, rs]) => {
        const ordenats = [...rs].sort((a, b) => a.preferencia - b.preferencia);
        return {
          sollicitud_id: sollicitudId, numero: rs[0]!.numero, participant: rs[0]!.participant,
          activitats_demanades: rs.length,
          en_llista_espera: rs.filter((r) => r.resultat === "llista_espera").length,
          detall: ordenats.map((r) => ({
            preferencia: r.preferencia, activitat: nom.get(r.activitat_id) ?? r.activitat_id, resultat: r.resultat,
            posicio_espera: r.posicio_espera, motiu: textMotiu(r.motiu),
          })),
        };
      })
      .sort((a, b) => b.activitats_demanades - a.activitats_demanades
        || nomPersona(a.participant).localeCompare(nomPersona(b.participant), "ca") || a.numero - b.numero);
  }

  // ---------- Sorteig per activitat ----------

  /** Rang del sorteig de número: fins al número més alt de la numeració configurada. */
  private async rangNumeros(casalId: string, cicleId: string, numeracio: "inscripcio" | "aleatoria") {
    if (numeracio === "aleatoria") {
      const numeros = await this.repos.adjudicacio.numerosSorteig(cicleId);
      return numeros.length ? Math.max(...numeros.map((n) => n.numero)) : 0;
    }
    const dades = await this.repos.adjudicacio.dadesMotor(casalId, cicleId);
    return dades.sollicituds.length ? Math.max(...dades.sollicituds.map((s) => s.numero)) : 0;
  }

  /** Estat dels sortejos del cicle: activitats que en necessiten, sortejos fets i números assignats. */
  async estatSorteig(casalId: string, cicleId: string) {
    const cicle = await this.cicle(casalId, cicleId);
    const config = await this.repos.adjudicacio.configuracioVigent(cicleId);
    const parametres = config?.parametres ?? null;
    const [sortejos, numeros, dades] = await Promise.all([
      this.repos.adjudicacio.sortejos(cicleId),
      this.repos.adjudicacio.numerosSorteig(cicleId),
      this.repos.adjudicacio.dadesMotor(casalId, cicleId),
    ]);
    const excloses = await this.repos.adjudicacio.parellesExcloses(cicleId);
    const estats = new Set<string>(parametres?.estats_sollicitud ?? []);
    const sollicituds = dades.sollicituds.filter((s) => estats.has(s.estat));
    const demanda = new Map<string, number>();
    for (const s of sollicituds) for (const pr of s.preferencies) demanda.set(pr.activitat_id, (demanda.get(pr.activitat_id) ?? 0) + 1);
    const necessiten = new Set(activitatsAmbSorteig({
      sollicituds, activitats: dades.activitats.map(({ id, capacitat, disponible }) => ({ id, capacitat, disponible })), excloses,
    }));
    const valid = (so: SorteigActivitat) => !!parametres && so.estat === "vigent" && so.tipus === parametres.tipus_sorteig
      && (so.tipus === "lletra" || so.numeracio === parametres.numeracio_sorteig);
    const rang = parametres?.tipus_sorteig === "numero" ? await this.rangNumeros(casalId, cicleId, parametres.numeracio_sorteig) : null;
    return {
      estat_cicle: cicle.estat,
      cicle: { id: cicle.id, nom: cicle.nom },
      parametres: parametres && {
        criteri_ordre: parametres.criteri_ordre, tipus_sorteig: parametres.tipus_sorteig, numeracio_sorteig: parametres.numeracio_sorteig,
      },
      pot_sortejar: ESTATS_SORTEIG.includes(cicle.estat) && parametres?.criteri_ordre === "sorteig_activitat",
      rang_numeros: rang,
      numeros: {
        assignats: numeros.length,
        sense_numero: dades.sollicituds.filter((s) => s.estat !== "anullada" && s.numero_sorteig == null).length,
      },
      activitats: dades.activitats.filter((a) => a.disponible).map((a) => ({
        id: a.id, nom: a.nom, capacitat: a.capacitat, sollicituds: demanda.get(a.id) ?? 0, necessita_sorteig: necessiten.has(a.id),
        sorteig: sortejos.find((so) => so.activitat_id === a.id && valid(so)) ?? null,
        sorteig_altre_tipus: sortejos.some((so) => so.activitat_id === a.id && so.estat === "vigent" && !valid(so)),
      })),
      historial: sortejos,
    };
  }

  /**
   * Assigna un número aleatori a cada sol·licitud no anul·lada que encara no en té.
   * Els números ja assignats no canvien; els nous continuen a partir del més alt.
   */
  async assignarNumeros(casalId: string, cicleId: string, ctx: ContextOperacio) {
    const cicle = await this.cicle(casalId, cicleId);
    if (!ESTATS_SORTEIG.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "Els números de sorteig s'assignen amb les inscripcions tancades o l'adjudicació en procés.");
    }
    const [dades, numeros] = await Promise.all([
      this.repos.adjudicacio.dadesMotor(casalId, cicleId),
      this.repos.adjudicacio.numerosSorteig(cicleId),
    ]);
    const pendents = dades.sollicituds.filter((s) => s.estat !== "anullada" && s.numero_sorteig == null);
    if (pendents.length === 0) return { assignats: 0, total: numeros.length };
    const inici = numeros.length ? Math.max(...numeros.map((n) => n.numero)) : 0;
    const assignacions = barreja(pendents).map((s, i) => ({ sollicitud_id: s.id, numero: inici + i + 1 }));
    const ara = isoAra(this.rellotge);
    try {
      await this.repos.unitat.executar([
        ...this.repos.adjudicacio.operacionsAssignarNumeros({ casal_id: casalId, cicle_id: cicleId, assignacions, usuari_id: ctx.usuariId! }, ara),
        this.repos.auditoria.operacioRegistrar({
          casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "adjudicacio.numeros_sorteig", entitat: "cicle", entitat_id: cicleId,
          resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { assignats: assignacions.length, des_de: inici + 1, fins_a: inici + assignacions.length },
        }, ara),
      ]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed: numeros_sorteig/.test(e.message)) {
        throw errors.conflicte("conflicte_concurrencia", "Algú altre ha assignat números mentrestant. Recarregueu la pàgina.");
      }
      throw e;
    }
    const despres = await this.repos.adjudicacio.numerosSorteig(cicleId);
    if (despres.length !== numeros.length + assignacions.length) {
      throw errors.conflicte("cicle_bloquejat", "No s'han pogut assignar els números: l'estat del cicle ha canviat.");
    }
    return { assignats: assignacions.length, total: despres.length };
  }

  /** Fa el sorteig d'una activitat al servidor, o en registra el resultat si s'ha fet fora de l'aplicació. */
  async ferSorteig(casalId: string, cicleId: string, activitatId: string, d: { valor_manual?: string; motiu?: string }, ctx: ContextOperacio) {
    const cicle = await this.cicle(casalId, cicleId);
    if (!ESTATS_SORTEIG.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "Els sortejos es fan amb les inscripcions tancades o l'adjudicació en procés.");
    }
    const config = await this.repos.adjudicacio.configuracioVigent(cicleId);
    if (!config || config.parametres.criteri_ordre !== "sorteig_activitat") {
      throw errors.conflicte("sense_sorteig_activitat", "Els paràmetres d'adjudicació vigents no preveuen sorteig per activitat.");
    }
    const p = config.parametres;
    const activitat = await this.repos.activitats.perId(casalId, activitatId);
    if (!activitat || activitat.cicle_id !== cicleId) throw errors.noTrobat("No s'ha trobat l'activitat.");
    if (activitat.estat !== "activa") throw errors.conflicte("activitat_no_activa", "Només es fa el sorteig de les activitats actives.");
    let valor: string;
    let rang: number | null = null;
    if (p.tipus_sorteig === "numero") {
      rang = await this.rangNumeros(casalId, cicleId, p.numeracio_sorteig);
      if (rang < 1) {
        throw errors.conflicte("numeros_pendents", p.numeracio_sorteig === "aleatoria"
          ? "Abans del sorteig cal assignar els números aleatoris a les sol·licituds." : "No hi ha sol·licituds en aquest cicle.");
      }
      if (d.valor_manual !== undefined) {
        const n = Number(d.valor_manual);
        if (!/^\d+$/.test(d.valor_manual) || n < 1 || n > rang) {
          throw errors.peticioInvalida(`El número ha de ser entre 1 i ${rang}.`);
        }
        valor = String(n);
      } else valor = String(enterAleatori(rang));
    } else {
      if (d.valor_manual !== undefined && !/^[A-Za-z]$/.test(d.valor_manual)) throw errors.peticioInvalida("Indiqueu una sola lletra (A-Z).");
      valor = d.valor_manual?.toUpperCase() ?? lletraAleatoria();
    }
    const id = nouId();
    const operacio = nouId();
    const ara = isoAra(this.rellotge);
    const origen = d.valor_manual !== undefined ? "manual" as const : "aplicacio" as const;
    const motiu = d.motiu?.trim() || null;
    let r;
    try {
      r = await this.repos.unitat.executar([
        this.repos.adjudicacio.operacioNouSorteig({
          id, casal_id: casalId, cicle_id: cicleId, activitat_id: activitatId, tipus: p.tipus_sorteig, valor, rang_maxim: rang,
          numeracio: p.tipus_sorteig === "numero" ? p.numeracio_sorteig : null, origen, motiu, realitzat_per: ctx.usuariId!, realitzat_el: ara, operacio,
        }),
        this.repos.auditoria.operacioRegistrar({
          casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "adjudicacio.sorteig", entitat: "activitat", entitat_id: activitatId,
          resultat: "exit", motiu, id_peticio: ctx.idPeticio ?? null,
          detalls: { sorteig_id: id, tipus: p.tipus_sorteig, valor, rang_maxim: rang, origen },
        }, ara, { taula: "sortejos_adjudicacio", id, operacio }),
      ]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed: sortejos_adjudicacio/.test(e.message)) {
        throw errors.conflicte("sorteig_existent", "Aquesta activitat ja té un sorteig vigent. Per repetir-lo, primer cal anul·lar-lo amb un motiu.");
      }
      throw e;
    }
    if (r[0]?.canvis !== 1) throw errors.conflicte("cicle_bloquejat", "No s'ha pogut fer el sorteig: l'estat del cicle o de l'activitat ha canviat.");
    return (await this.repos.adjudicacio.sortejos(cicleId)).find((so) => so.id === id)!;
  }

  async anullarSorteig(casalId: string, cicleId: string, sorteigId: string, d: { motiu: string }, ctx: ContextOperacio) {
    await this.cicle(casalId, cicleId);
    const sorteig = (await this.repos.adjudicacio.sortejos(cicleId)).find((so) => so.id === sorteigId);
    if (!sorteig) throw errors.noTrobat("No s'ha trobat el sorteig.");
    if (sorteig.estat !== "vigent") throw errors.conflicte("sorteig_anullat", "Aquest sorteig ja està anul·lat.");
    const operacio = nouId();
    const ara = isoAra(this.rellotge);
    const [r] = await this.repos.unitat.executar([
      this.repos.adjudicacio.operacioAnullarSorteig({ id: sorteigId, casal_id: casalId, cicle_id: cicleId, motiu: d.motiu, usuari_id: ctx.usuariId!, operacio }, ara),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "adjudicacio.sorteig_anullat", entitat: "activitat", entitat_id: sorteig.activitat_id,
        resultat: "exit", motiu: d.motiu, id_peticio: ctx.idPeticio ?? null, detalls: { sorteig_id: sorteigId, valor: sorteig.valor },
      }, ara, { taula: "sortejos_adjudicacio", id: sorteigId, operacio }),
    ]);
    if (!r || r.canvis !== 1) throw errors.conflicte("cicle_bloquejat", "No s'ha pogut anul·lar: el sorteig o l'estat del cicle han canviat.");
    return { anullat: true };
  }

  /** Llista de números aleatoris de sorteig, per publicar-la abans del sorteig. */
  async taulaNumeros(casalId: string, cicleId: string, vis: Visibilitat): Promise<TaulaExportacio> {
    const cicle = await this.cicle(casalId, cicleId);
    const numeros = await this.repos.adjudicacio.llistaNumerosSorteig(casalId, cicleId);
    return {
      titol: `Números de sorteig · ${cicle.nom}`,
      fitxer: `numeros-sorteig-${slug(cicle.nom)}.xlsx`,
      columnes: ["Número de sorteig", "Núm. sol·licitud", "Persona"],
      files: numeros.map((n) => [n.numero, n.numero_sollicitud, nomPersona(filtraParticipant(n, vis).participant)]),
    };
  }

  /** Persones sense cap activitat en una proposta o adjudicació, per revisar-les a mà. */
  async taulaSenseActivitat(casalId: string, id: string, vis: Visibilitat): Promise<TaulaExportacio> {
    const { execucio, cicle, sense_activitat } = await this.detallExecucio(casalId, id, vis);
    const contacte = vis.contacte;
    return {
      titol: `Persones sense cap activitat · adjudicació v${execucio.versio} · ${cicle.nom}`,
      fitxer: `sense-activitat-v${execucio.versio}-${slug(cicle.nom)}.xlsx`,
      columnes: ["Núm. sol·licitud", "Persona", ...(contacte ? ["Telèfon", "Correu electrònic"] : []), "Activitats demanades",
        "En llista d'espera", "Detall (preferència: activitat, situació)"],
      files: sense_activitat.map((f) => [
        f.numero, nomPersona(f.participant), ...(contacte ? [f.participant.telefon, f.participant.email] : []),
        f.activitats_demanades, f.en_llista_espera,
        f.detall.map((x) => `${x.preferencia}: ${x.activitat}, ${x.resultat === "llista_espera" ? `llista d'espera (posició ${x.posicio_espera})` : x.motiu ?? "sense plaça"}`).join(" · "),
      ]),
    };
  }

  async confirmar(casalId: string, id: string, d: { motiu?: string }, ctx: ContextOperacio) {
    const execucio = await this.execucio(casalId, id);
    const cicle = await this.cicle(casalId, execucio.cicle_id);
    if (execucio.estat !== "proposta") throw errors.conflicte("execucio_no_proposta", "Només es pot confirmar una proposta pendent.");
    if (cicle.estat !== "adjudicacio_en_proces") {
      throw errors.conflicte("cicle_no_en_adjudicacio", "El cicle ha d'estar «En procés d'adjudicació» per confirmar.");
    }
    const anterior = await this.repos.adjudicacio.execucioConfirmada(cicle.id);
    const motiu = d.motiu?.trim() || null;
    if (anterior && (!motiu || motiu.length < 3)) {
      throw new ErrorAplicacio(428, "confirmacio_requerida",
        `Ja hi ha una adjudicació confirmada (versió ${anterior.versio}). Per substituir-la cal indicar el motiu.`);
    }
    // Si les sol·licituds, les activitats o les places han canviat des del càlcul, la proposta ja no és vàlida.
    const config = (await this.repos.adjudicacio.configuracions(cicle.id)).find((c) => c.id === execucio.configuracio_id);
    const { empremta } = await this.entradaMotor(casalId, cicle.id, config!.parametres);
    if (empremta !== execucio.resum.empremta) {
      throw errors.conflicte("proposta_obsoleta", "Les dades han canviat des que es va calcular la proposta. Calculeu-ne una de nova.");
    }
    const resultats = await this.repos.adjudicacio.resultats(id);
    const places_noves = resultats
      .filter((r) => r.resultat !== "no_adjudicada")
      .map((r) => ({ id: nouId(), sollicitud_id: r.sollicitud_id, activitat_id: r.activitat_id }));
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const ops = this.repos.adjudicacio.operacionsConfirmar({
      execucio_id: id, cicle_id: cicle.id, casal_id: casalId, anterior_id: anterior?.id ?? null, motiu, usuari_id: ctx.usuariId!,
      operacio, places_noves,
    }, ara);
    const condicioCicle = { taula: "cicles" as const, id: cicle.id, operacio };
    const r = await this.repos.unitat.executar([
      ...ops,
      this.repos.historial.operacioAfegir({
        casal_id: casalId, entitat: "cicle", entitat_id: cicle.id, accio: "canvi_estat", usuari_id: ctx.usuariId,
        canvis: { estat: { abans: cicle.estat, despres: "adjudicat" }, adjudicacio: { versio: execucio.versio, substitueix: anterior?.versio ?? null } },
        motiu,
      }, ara, condicioCicle),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: anterior ? "adjudicacio.substitucio" : "adjudicacio.confirmacio",
        entitat: "execucio_adjudicacio", entitat_id: id, resultat: "exit", motiu, id_peticio: ctx.idPeticio ?? null,
        detalls: { cicle_id: cicle.id, versio: execucio.versio, substitueix: anterior?.id ?? null },
      }, ara, { taula: "execucions_adjudicacio", id, operacio }),
    ]);
    if (r[anterior ? 1 : 0]?.canvis !== 1) {
      throw errors.conflicte("conflicte_concurrencia", "L'adjudicació s'ha modificat mentrestant. Recarregueu-la.");
    }
    return this.execucio(casalId, id);
  }

  /** Places del cicle agrupades per activitat, amb l'ocupació. */
  async places(casalId: string, cicleId: string, vis: Visibilitat) {
    const cicle = await this.cicle(casalId, cicleId);
    const [places, activitats, confirmada] = await Promise.all([
      this.repos.adjudicacio.places(casalId, cicleId),
      this.repos.activitats.llistarPerCicle(casalId, cicleId),
      this.repos.adjudicacio.execucioConfirmada(cicleId),
    ]);
    const grups = activitats.filter((a) => places.some((p) => p.activitat_id === a.id)).map((a) => {
      const files = places.filter((p) => p.activitat_id === a.id);
      const ocupades = files.filter((p) => p.estat === "admesa" || p.estat === "oferta_pendent").length;
      return {
        activitat_id: a.id, activitat: a.nom, capacitat: a.capacitat, ocupades, lliures: Math.max(0, a.capacitat - ocupades),
        minim_participants: a.minim_participants,
        espera: files.filter((p) => p.estat === "llista_espera").length,
        places: files.map((p) => filtraParticipant(p, vis)),
      };
    });
    return {
      estat_cicle: cicle.estat, gestionable: ESTATS_PLACES.includes(cicle.estat),
      execucio_confirmada: confirmada ? { id: confirmada.id, versio: confirmada.versio, confirmada_el: confirmada.confirmada_el } : null,
      grups,
    };
  }

  /**
   * Acció sobre una plaça. `origen` permet que una altra regla (per exemple, la baixa per
   * assistència) quedi a l'auditoria amb el seu propi tipus d'operació i les seves dades.
   */
  async moviment(casalId: string, placaId: string, d: { accio: AccioPlaca; versio: number; motiu: string }, ctx: ContextOperacio,
    origen?: { tipus_operacio: string; detalls: Record<string, unknown> }) {
    const placa = await this.repos.adjudicacio.placa(casalId, placaId);
    if (!placa) throw errors.noTrobat("No s'ha trobat la plaça.");
    const cicle = await this.cicle(casalId, placa.cicle_id);
    if (!ESTATS_PLACES.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "Les places només es gestionen quan el cicle està adjudicat o publicat.");
    }
    if (placa.versio !== d.versio) throw errors.conflicte("conflicte_concurrencia", "La plaça s'ha modificat mentrestant. Recarregueu-la.");
    const accio = ACCIONS_PLACA[d.accio];
    if (!(accio.des as readonly EstatPlaca[]).includes(placa.estat)) {
      throw errors.conflicte("transicio_no_permesa", `No es pot fer «${accio.text}» des de l'estat «${ETIQUETES_ESTAT_PLACA[placa.estat]}».`);
    }
    const ocupa = ACCIONS_OCUPEN_PLACA.includes(d.accio);
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const condicio = { taula: "places" as const, id: placaId, operacio };
    const [r] = await this.repos.unitat.executar([
      this.repos.adjudicacio.operacioMoviment({ placa_id: placaId, versio: d.versio, des: placa.estat, cap: accio.cap, ocupa, operacio }, ara),
      this.repos.adjudicacio.operacioRegistreMoviment({ placa_id: placaId, des: placa.estat, cap: accio.cap, motiu: d.motiu, usuari_id: ctx.usuariId!, operacio }, ara),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: origen?.tipus_operacio ?? `places.${d.accio}`, entitat: "placa", entitat_id: placaId,
        resultat: "exit", motiu: d.motiu, id_peticio: ctx.idPeticio ?? null,
        detalls: { activitat_id: placa.activitat_id, sollicitud_id: placa.sollicitud_id, des: placa.estat, cap: accio.cap, ...origen?.detalls },
      }, ara, condicio),
    ]);
    if (!r || r.canvis !== 1) {
      const actual = await this.repos.adjudicacio.placa(casalId, placaId);
      if (ocupa && actual?.versio === d.versio) {
        throw errors.conflicte("sense_places_lliures", "L'activitat no té cap plaça lliure. Primer cal una renúncia o una baixa.");
      }
      throw errors.conflicte("conflicte_concurrencia", "La plaça s'ha modificat mentrestant. Recarregueu-la.");
    }
    return { placa: await this.repos.adjudicacio.placa(casalId, placaId) };
  }

  async movimentsPlaca(casalId: string, placaId: string) {
    const placa = await this.repos.adjudicacio.placa(casalId, placaId);
    if (!placa) throw errors.noTrobat("No s'ha trobat la plaça.");
    return this.repos.adjudicacio.moviments(placaId);
  }

  // ---------- Exportacions ----------

  /** Resultats d'una execució (proposta o confirmada), una fila per sol·licitud i activitat. */
  async taulaResultats(casalId: string, id: string, vis: Visibilitat): Promise<TaulaExportacio> {
    const { execucio, cicle, grups } = await this.detallExecucio(casalId, id, vis);
    const files: TaulaExportacio["files"] = [];
    for (const g of grups) {
      for (const r of g.resultats as (FilaResultat & { participant: FilaResultat["participant"] })[]) {
        files.push([g.activitat, r.numero, nomPersona(r.participant), r.preferencia, ETIQUETES_RESULTAT[r.resultat],
          r.posicio_espera, r.per_espera_anterior ? "Llista d'espera anterior" : r.per_continuitat ? "Continuïtat" : "", textMotiu(r.motiu)]);
      }
    }
    return {
      titol: `Adjudicació v${execucio.versio} · ${cicle.nom}`,
      fitxer: `adjudicacio-v${execucio.versio}-${slug(cicle.nom)}.xlsx`,
      columnes: ["Activitat", "Núm. sol·licitud", "Persona", "Preferència", "Resultat", "Posició a la llista d'espera", "Prioritat", "Observacions"],
      files,
    };
  }

  /** Situació actual de les places: admeses o llista d'espera, per activitat. */
  async taulaPlaces(casalId: string, cicleId: string, tipus: "admesos" | "espera", vis: Visibilitat): Promise<TaulaExportacio> {
    const cicle = await this.cicle(casalId, cicleId);
    const { grups } = await this.places(casalId, cicleId, vis);
    const estats: EstatPlaca[] = tipus === "admesos" ? ["admesa", "oferta_pendent"] : ["llista_espera"];
    const contacte = vis.contacte;
    const files: TaulaExportacio["files"] = [];
    for (const g of grups) {
      for (const p of g.places.filter((x: FilaPlaca) => estats.includes(x.estat))) {
        files.push([g.activitat, p.numero, nomPersona(p.participant), ...(contacte ? [p.participant.telefon, p.participant.email] : []),
          p.preferencia, ETIQUETES_ESTAT_PLACA[p.estat], p.posicio_espera, dataHoraLocal(p.actualitzat_el)]);
      }
    }
    return {
      titol: `${tipus === "admesos" ? "Persones admeses" : "Llista d'espera"} · ${cicle.nom}`,
      fitxer: `${tipus === "admesos" ? "admesos" : "llista-espera"}-${slug(cicle.nom)}.xlsx`,
      columnes: ["Activitat", "Núm. sol·licitud", "Persona", ...(contacte ? ["Telèfon", "Correu electrònic"] : []), "Preferència", "Estat",
        "Posició a la llista d'espera", "Darrer canvi"],
      files,
    };
  }
}
