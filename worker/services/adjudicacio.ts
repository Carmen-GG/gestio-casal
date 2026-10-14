import { adjudica, PARAMETRES_INICIALS, VERSIO_MOTOR, type EntradaMotor, type ParametresAdjudicacio } from "../../shared/domain/adjudicacio";
import { normalitzaText } from "../../shared/domain/ordenacio";
import {
  ACCIONS_OCUPEN_PLACA, ACCIONS_PLACA, ETIQUETES_ESTAT_PLACA, ETIQUETES_MOTIU_NO_ADJUDICADA, ETIQUETES_RESULTAT,
  type AccioPlaca, type EstatPlaca,
} from "../../shared/schemas/adjudicacio";
import { ErrorAplicacio, errors } from "../http/errors";
import { resumSha256, testimoniAleatori } from "../lib/cripto";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Cicle, Execucio, FilaPlaca, FilaResultat, Repositoris } from "../repositories/tipus";
import { dataHoraLocal, filtraParticipant, type TaulaExportacio, type Visibilitat } from "./gestio-sollicituds";
import type { ContextOperacio } from "./traca";

/** Estats del cicle en què es poden desar paràmetres d'adjudicació. */
const ESTATS_PARAMETRES = ["esborrany", "preparacio", "inscripcions_obertes", "inscripcions_tancades", "adjudicacio_en_proces"];
/** Estats del cicle en què es gestionen les places (després de confirmar l'adjudicació). */
export const ESTATS_PLACES = ["adjudicat", "publicat"];

const LLETRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Lletra sortejada al servidor amb un generador criptogràfic (sense biaix). */
function lletraAleatoria(): string {
  const b = new Uint8Array(1);
  do crypto.getRandomValues(b); while (b[0]! >= 26 * 9);
  return LLETRES[b[0]! % 26]!;
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
    const continuitat = parametres.prioritat_continuitat
      ? await this.repos.adjudicacio.continuitat(casalId, cicleId)
      : { parelles: new Set<string>(), cicle_anterior: null };
    const excloses = await this.repos.adjudicacio.parellesExcloses(cicleId);
    const entrada: Omit<EntradaMotor, "lletra" | "llavor"> = {
      sollicituds: sollicituds.map(({ estat: _e, ...s }) => s),
      activitats: dades.activitats.map(({ id, capacitat, disponible }) => ({ id, capacitat, disponible })),
      parametres, continuitat: continuitat.parelles, excloses,
    };
    const empremta = await resumSha256(JSON.stringify({
      s: entrada.sollicituds, a: entrada.activitats, p: parametres,
      c: [...continuitat.parelles].sort(), e: [...excloses].sort(),
    }));
    return { entrada, empremta, dades, continuitat, excloses, nombreFora: dades.sollicituds.length - sollicituds.length };
  }

  async calcularProposta(casalId: string, cicleId: string, d: { lletra?: string }, ctx: ContextOperacio) {
    const cicle = await this.cicle(casalId, cicleId);
    if (cicle.estat !== "adjudicacio_en_proces") {
      throw errors.conflicte("cicle_no_en_adjudicacio", "Per calcular una proposta, el cicle ha d'estar «En procés d'adjudicació».");
    }
    const config = await this.repos.adjudicacio.configuracioVigent(cicleId);
    if (!config) throw errors.conflicte("sense_parametres", "Abans de calcular cal desar els paràmetres d'adjudicació del cicle.");
    const p = config.parametres;
    const { entrada, empremta, dades, continuitat, excloses, nombreFora } = await this.entradaMotor(casalId, cicleId, p);
    if (entrada.sollicituds.length === 0) throw errors.conflicte("sense_sollicituds", "No hi ha cap sol·licitud que entri a l'adjudicació.");
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
      cicle_anterior: continuitat.cicle_anterior,
      noms_activitats: Object.fromEntries(dades.activitats.map((a) => [a.id, a.nom])),
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
      .map((a) => ({
        activitat_id: a.id, activitat: a.nom, capacitat: a.capacitat, estat: a.estat,
        resultats: resultats.filter((r) => r.activitat_id === a.id).map((r) => filtraParticipant(r, vis)),
      }))
      .filter((g) => g.resultats.length > 0);
    const confirmada = await this.repos.adjudicacio.execucioConfirmada(cicle.id);
    return {
      execucio, cicle: { id: cicle.id, nom: cicle.nom, estat: cicle.estat }, grups,
      substitueix: execucio.estat === "proposta" && confirmada ? { id: confirmada.id, versio: confirmada.versio } : null,
      pot_confirmar: execucio.estat === "proposta" && cicle.estat === "adjudicacio_en_proces",
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

  async moviment(casalId: string, placaId: string, d: { accio: AccioPlaca; versio: number; motiu: string }, ctx: ContextOperacio) {
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
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: `places.${d.accio}`, entitat: "placa", entitat_id: placaId,
        resultat: "exit", motiu: d.motiu, id_peticio: ctx.idPeticio ?? null,
        detalls: { activitat_id: placa.activitat_id, sollicitud_id: placa.sollicitud_id, des: placa.estat, cap: accio.cap },
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
          r.posicio_espera, r.per_continuitat ? "Sí" : "No", textMotiu(r.motiu)]);
      }
    }
    return {
      titol: `Adjudicació v${execucio.versio} · ${cicle.nom}`,
      fitxer: `adjudicacio-v${execucio.versio}-${slug(cicle.nom)}.xlsx`,
      columnes: ["Activitat", "Núm. sol·licitud", "Persona", "Preferència", "Resultat", "Posició a la llista d'espera", "Continuïtat", "Observacions"],
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
