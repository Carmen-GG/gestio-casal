import {
  ABREVIATURES_ASSISTENCIA, avuiLocal, datesSessions, ETIQUETES_ASSISTENCIA, resumAssistencia, sotaLlindar, type EstatAssistencia,
} from "../../shared/domain/assistencia";
import { comparaPersones } from "../../shared/domain/ordenacio";
import { ErrorAplicacio, errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Activitat, Cicle, FilaPlaca, Marca, Operacio, Repositoris, Sessio } from "../repositories/tipus";
import { ESTATS_PLACES, ServeiAdjudicacio } from "./adjudicacio";
import { filtraParticipant, type TaulaExportacio, type Visibilitat } from "./gestio-sollicituds";
import type { ContextOperacio } from "./traca";

/** Estats del cicle en què es poden crear o cancel·lar sessions. */
const ESTATS_SESSIONS = ["preparacio", "inscripcions_obertes", "inscripcions_tancades", "adjudicacio_en_proces", "adjudicat", "publicat"];
const DIES = ["", "dl", "dt", "dc", "dj", "dv", "ds", "dg"];

const nomPersona = (p: { cognom1: string | null; cognom2: string | null; nom: string | null }) =>
  `${[p.cognom1, p.cognom2].filter(Boolean).join(" ")}, ${p.nom ?? ""}`;
const perPersona = (a: FilaPlaca, b: FilaPlaca) =>
  comparaPersones({ cognom1: a.participant.cognom1 ?? "", cognom2: a.participant.cognom2, nom: a.participant.nom ?? "" },
    { cognom1: b.participant.cognom1 ?? "", cognom2: b.participant.cognom2, nom: b.participant.nom ?? "" }) || a.numero - b.numero;

export function horariText(a: Activitat): string | null {
  if (a.horari_text) return a.horari_text;
  const dies = a.dies_setmana.map((d) => DIES[d]).filter(Boolean).join(", ");
  const hores = a.hora_inici && a.hora_fi ? `${a.hora_inici}–${a.hora_fi}` : a.hora_inici ?? "";
  return [dies, hores].filter(Boolean).join(" · ") || null;
}

const errorConcurrencia = () => errors.conflicte("conflicte_concurrencia",
  "Algú altre ha registrat o modificat l'assistència d'aquesta sessió mentrestant. Recarregueu-la.");

export class ServeiAssistencia {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  private async activitatICicle(casalId: string, activitatId: string): Promise<{ activitat: Activitat; cicle: Cicle }> {
    const activitat = await this.repos.activitats.perId(casalId, activitatId);
    if (!activitat) throw errors.noTrobat("No s'ha trobat l'activitat.");
    const cicle = (await this.repos.cicles.perId(casalId, activitat.cicle_id))!;
    return { activitat, cicle };
  }

  /** Places que formen part del control d'assistència: admeses ara o amb alguna marca registrada. */
  private participants(places: FilaPlaca[], marques: Marca[]) {
    const ambMarques = new Set(marques.map((m) => m.placa_id));
    return places.filter((p) => p.estat === "admesa" || ambMarques.has(p.id)).sort(perPersona);
  }

  /** Full d'assistència d'una activitat: sessions, persones, marques i percentatges. */
  async activitat(casalId: string, activitatId: string, vis: Visibilitat) {
    const { activitat, cicle } = await this.activitatICicle(casalId, activitatId);
    const [sessions, places, marques] = await Promise.all([
      this.repos.assistencia.sessions(activitatId),
      this.repos.adjudicacio.places(casalId, cicle.id, activitatId),
      this.repos.assistencia.marquesActivitat(activitatId),
    ]);
    const perPlaca = new Map<string, Marca[]>();
    for (const m of marques) perPlaca.set(m.placa_id, [...(perPlaca.get(m.placa_id) ?? []), m]);
    const persones = this.participants(places, marques).map((p) => {
      const propies = perPlaca.get(p.id) ?? [];
      const resum = resumAssistencia(propies.map((m) => m.estat));
      return {
        ...filtraParticipant(p, vis),
        marques: Object.fromEntries(propies.map((m) => [m.sessio_id, { estat: m.estat, versio: m.versio }])),
        resum, sota_llindar: sotaLlindar(resum.percentatge, cicle.llindar_assistencia),
      };
    });
    return {
      activitat: { id: activitat.id, nom: activitat.nom, capacitat: activitat.capacitat, horari: horariText(activitat), nombre_sessions: activitat.nombre_sessions,
        dies_setmana: activitat.dies_setmana, data_inici: activitat.data_inici, data_fi: activitat.data_fi },
      cicle: { id: cicle.id, nom: cicle.nom, estat: cicle.estat, llindar_assistencia: cicle.llindar_assistencia, data_inici: cicle.data_inici, data_fi: cicle.data_fi },
      sessions, persones,
      avui: avuiLocal(this.rellotge.ara()),
      pot_registrar: ESTATS_PLACES.includes(cicle.estat),
      pot_crear_sessions: ESTATS_SESSIONS.includes(cicle.estat),
    };
  }

  /**
   * Regla del casal: baixa d'una plaça admesa per assistència inferior al llindar del cicle.
   * No és automàtica: la confirma una persona autoritzada, plaça per plaça. El servidor
   * recalcula el percentatge i només la permet si hi ha llindar i la persona hi és per sota.
   */
  async baixaPerAssistencia(casalId: string, placaId: string, d: { versio: number; motiu?: string }, ctx: ContextOperacio) {
    const placa = await this.repos.adjudicacio.placa(casalId, placaId);
    if (!placa) throw errors.noTrobat("No s'ha trobat la plaça.");
    const cicle = (await this.repos.cicles.perId(casalId, placa.cicle_id))!;
    const llindar = cicle.llindar_assistencia;
    if (llindar === null) throw errors.conflicte("sense_llindar", "El cicle no té llindar d'assistència.");
    const marques = (await this.repos.assistencia.marquesActivitat(placa.activitat_id)).filter((m) => m.placa_id === placaId);
    const { percentatge } = resumAssistencia(marques.map((m) => m.estat));
    if (!sotaLlindar(percentatge, llindar)) {
      throw errors.conflicte("no_sota_llindar", percentatge === null
        ? "Encara no hi ha prou sessions registrades per calcular el percentatge d'assistència."
        : `L'assistència és del ${percentatge}%, no és inferior al llindar del ${llindar}%.`);
    }
    const motiu = `Assistència del ${percentatge}%, inferior al llindar del ${llindar}%.${d.motiu ? ` ${d.motiu}` : ""}`;
    return new ServeiAdjudicacio(this.repos, this.rellotge).moviment(casalId, placaId, { accio: "donar_baixa", versio: d.versio, motiu }, ctx,
      { tipus_operacio: "places.baixa_assistencia", detalls: { percentatge, llindar } });
  }

  /** Genera les sessions previstes segons els dies i les dates de l'activitat (o del cicle). No duplica les existents. */
  async generarSessions(casalId: string, activitatId: string, ctx: ContextOperacio) {
    const { activitat, cicle } = await this.activitatICicle(casalId, activitatId);
    this.comprovaEstatSessions(cicle);
    const dates = datesSessions(activitat.dies_setmana, activitat.data_inici ?? cicle.data_inici, activitat.data_fi ?? cicle.data_fi);
    if (dates.length === 0) {
      throw errors.peticioInvalida("L'activitat no té dies de la setmana o dates per generar el calendari. Afegiu les sessions una a una.");
    }
    return this.creaSessions(casalId, activitat, dates.map((data) => ({ data, hora_inici: activitat.hora_inici, hora_fi: activitat.hora_fi })), ctx, "generacio");
  }

  async afegirSessio(casalId: string, activitatId: string, d: { data: string; hora_inici?: string | null; hora_fi?: string | null }, ctx: ContextOperacio) {
    const { activitat, cicle } = await this.activitatICicle(casalId, activitatId);
    this.comprovaEstatSessions(cicle);
    const hora_inici = d.hora_inici === undefined ? activitat.hora_inici : d.hora_inici;
    const hora_fi = d.hora_fi === undefined ? activitat.hora_fi : d.hora_fi;
    const r = await this.creaSessions(casalId, activitat, [{ data: d.data, hora_inici, hora_fi }], ctx, "manual");
    if (r.creades === 0) throw errors.conflicte("sessio_existent", "Ja hi ha una sessió en aquesta data i hora.");
    return r;
  }

  private comprovaEstatSessions(cicle: Cicle) {
    if (!ESTATS_SESSIONS.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "En aquest estat del cicle no es poden modificar les sessions.");
    }
  }

  private async creaSessions(casalId: string, activitat: Activitat, sessions: { data: string; hora_inici: string | null; hora_fi: string | null }[], ctx: ContextOperacio, origen: string) {
    const ara = isoAra(this.rellotge);
    const [r] = await this.repos.unitat.executar([
      this.repos.assistencia.operacioCrearSessions(sessions.map((s) => ({ id: nouId(), activitat_id: activitat.id, ...s })), ctx.usuariId!, ara),
    ]);
    const creades = r?.canvis ?? 0;
    if (creades > 0) {
      await this.repos.auditoria.registrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "sessions.creacio", entitat: "activitat", entitat_id: activitat.id,
        resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { creades, origen },
      }, ara);
    }
    return { creades, existents: sessions.length - creades };
  }

  async cancellarSessio(casalId: string, sessioId: string, d: { versio: number; motiu: string }, ctx: ContextOperacio) {
    const sessio = await this.repos.assistencia.sessio(casalId, sessioId);
    if (!sessio) throw errors.noTrobat("No s'ha trobat la sessió.");
    this.comprovaEstatSessions((await this.repos.cicles.perId(casalId, sessio.cicle_id))!);
    if (sessio.marques > 0) throw errors.conflicte("sessio_amb_assistencia", "No es pot cancel·lar una sessió amb assistència registrada.");
    if (sessio.estat !== "prevista") throw errors.conflicte("transicio_no_permesa", "Només es poden cancel·lar sessions previstes.");
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const condicio = { taula: "sessions_activitat" as const, id: sessioId, operacio };
    const [r] = await this.repos.unitat.executar([
      this.repos.assistencia.operacioCancellarSessio(sessioId, d.versio, d.motiu, ara, operacio),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "sessions.cancellacio", entitat: "sessio", entitat_id: sessioId,
        resultat: "exit", motiu: d.motiu, id_peticio: ctx.idPeticio ?? null, detalls: { activitat_id: sessio.activitat_id, data: sessio.data },
      }, ara, condicio),
    ]);
    if (!r || r.canvis !== 1) throw errors.conflicte("conflicte_concurrencia", "La sessió s'ha modificat mentrestant. Recarregueu-la.");
    return { ok: true };
  }

  /**
   * Registra l'assistència d'una sessió. Les marques noves s'insereixen; les
   * modificacions exigeixen la versió vista i un motiu, i queden a l'historial.
   * Tot en una sola transacció: o es desa tot o res.
   */
  async registrar(casalId: string, sessioId: string, d: { marques: { placa_id: string; estat: EstatAssistencia; versio: number | null }[]; motiu?: string }, ctx: ContextOperacio) {
    const sessio = await this.repos.assistencia.sessio(casalId, sessioId);
    if (!sessio) throw errors.noTrobat("No s'ha trobat la sessió.");
    const cicle = (await this.repos.cicles.perId(casalId, sessio.cicle_id))!;
    if (!ESTATS_PLACES.includes(cicle.estat)) {
      throw errors.conflicte("cicle_bloquejat", "L'assistència només es registra quan el cicle està adjudicat o publicat.");
    }
    if (sessio.estat === "cancellada") throw errors.conflicte("sessio_cancellada", "La sessió està cancel·lada.");
    if (sessio.data > avuiLocal(this.rellotge.ara())) {
      throw errors.conflicte("sessio_futura", "No es pot registrar l'assistència d'una sessió que encara no s'ha fet.");
    }
    const [places, marques] = await Promise.all([
      this.repos.adjudicacio.places(casalId, cicle.id, sessio.activitat_id),
      this.repos.assistencia.marquesActivitat(sessio.activitat_id),
    ]);
    const valides = new Map(this.participants(places, marques).map((p) => [p.id, p]));
    const actuals = new Map(marques.filter((m) => m.sessio_id === sessioId).map((m) => [m.placa_id, m]));
    const motiu = d.motiu?.trim() || null;
    const ara = isoAra(this.rellotge);
    const operacio = nouId();
    const ops: Operacio[] = [];
    let noves = 0;
    let modificades = 0;
    for (const m of d.marques) {
      const placa = valides.get(m.placa_id);
      if (!placa) throw errors.peticioInvalida("Hi ha persones que no tenen plaça admesa en aquesta activitat.");
      const actual = actuals.get(m.placa_id);
      if (!actual) {
        if (m.versio !== null) throw errorConcurrencia();
        ops.push(this.repos.assistencia.operacioNovaMarca({ sessio_id: sessioId, placa_id: m.placa_id, estat: m.estat, usuari_id: ctx.usuariId!, operacio }, ara));
        noves++;
        continue;
      }
      if (m.versio !== actual.versio) throw errorConcurrencia();
      if (actual.estat === m.estat) continue;
      if (!motiu || motiu.length < 3) {
        throw new ErrorAplicacio(428, "motiu_requerit", "Per modificar una marca d'assistència ja registrada cal indicar el motiu.");
      }
      ops.push(this.repos.assistencia.operacioModificarMarca({ sessio_id: sessioId, placa_id: m.placa_id, estat: m.estat, versio: m.versio, usuari_id: ctx.usuariId!, operacio }, ara));
      ops.push(this.repos.assistencia.operacioHistorialMarca({
        casal_id: casalId, sessio_id: sessioId, placa_id: m.placa_id, data: sessio.data, abans: actual.estat, despres: m.estat,
        motiu, usuari_id: ctx.usuariId!, operacio,
      }, ara));
      modificades++;
    }
    if (ops.length === 0) return { noves: 0, modificades: 0 };
    ops.push(this.repos.assistencia.operacioSessioRealitzada(sessioId, ara));
    ops.push(this.repos.auditoria.operacioRegistrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "assistencia.registre", entitat: "sessio", entitat_id: sessioId,
      resultat: "exit", motiu, id_peticio: ctx.idPeticio ?? null, detalls: { activitat_id: sessio.activitat_id, noves, modificades },
    }, ara));
    try {
      await this.repos.unitat.executar(ops);
    } catch (e) {
      // Una altra persona ha registrat o modificat alguna marca: no s'ha desat res.
      if (e instanceof Error && /UNIQUE constraint failed: registres_assistencia|NOT NULL constraint failed: historial_canvis\.accio/.test(e.message)) {
        throw errorConcurrencia();
      }
      throw e;
    }
    return { noves, modificades };
  }

  /** Resum per activitat del cicle (panell). */
  async resumCicle(casalId: string, cicleId: string) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    const [activitats, places, sessions, marques] = await Promise.all([
      this.repos.activitats.llistarPerCicle(casalId, cicleId),
      this.repos.adjudicacio.places(casalId, cicleId),
      this.repos.assistencia.sessionsCicle(cicleId),
      this.repos.assistencia.marquesCicle(cicleId),
    ]);
    const files = activitats.filter((a) => a.estat !== "arxivada").map((a) => {
      const propies = sessions.filter((s) => s.activitat_id === a.id);
      const ids = new Set(propies.map((s) => s.id));
      const marquesA = marques.filter((m) => ids.has(m.sessio_id));
      const persones = this.participants(places.filter((p) => p.activitat_id === a.id), marquesA);
      const resums = persones.map((p) => resumAssistencia(marquesA.filter((m) => m.placa_id === p.id).map((m) => m.estat)));
      const amb = resums.filter((r) => r.percentatge !== null);
      return {
        activitat_id: a.id, activitat: a.nom, horari: horariText(a), admeses: persones.filter((p) => p.estat === "admesa").length,
        sessions: propies.filter((s) => s.estat !== "cancellada").length,
        realitzades: propies.filter((s) => s.estat === "realitzada").length,
        cancellades: propies.filter((s) => s.estat === "cancellada").length,
        nombre_sessions_previst: a.nombre_sessions,
        mitjana: amb.length ? Math.round(amb.reduce((n, r) => n + r.percentatge!, 0) / amb.length) : null,
        sota_llindar: resums.filter((r) => sotaLlindar(r.percentatge, cicle.llindar_assistencia)).length,
      };
    });
    return { llindar_assistencia: cicle.llindar_assistencia, activitats: files };
  }

  // ---------- Exportacions ----------

  /**
   * Dades de les graelles d'assistència: una per activitat amb places, amb les
   * persones admeses per ordre alfabètic i la llista d'espera per posició.
   */
  async graelles(casalId: string, cicleId: string, vis: Visibilitat, ambTelefon: boolean) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    const casal = (await this.repos.casals.perId(casalId))!;
    const telefon = ambTelefon && vis.contacte;
    const [activitats, places, sessions, marques] = await Promise.all([
      this.repos.activitats.llistarPerCicle(casalId, cicleId),
      this.repos.adjudicacio.places(casalId, cicleId),
      this.repos.assistencia.sessionsCicle(cicleId),
      this.repos.assistencia.marquesCicle(cicleId),
    ]);
    const marca = new Map(marques.map((m) => [`${m.sessio_id}:${m.placa_id}`, ABREVIATURES_ASSISTENCIA[m.estat]]));
    const graelles = activitats
      .filter((a) => places.some((p) => p.activitat_id === a.id))
      .map((a) => {
        const propies = places.filter((p) => p.activitat_id === a.id);
        const sessionsA = sessions.filter((s: Sessio) => s.activitat_id === a.id && s.estat !== "cancellada");
        const admeses = propies.filter((p) => p.estat === "admesa").sort(perPersona);
        const espera = propies.filter((p) => p.estat === "llista_espera" || p.estat === "oferta_pendent")
          .sort((x, y) => (x.posicio_espera ?? 1e9) - (y.posicio_espera ?? 1e9) || x.numero - y.numero);
        return {
          activitat: a.nom, horari: horariText(a), capacitat: a.capacitat, espai: a.espai,
          sessions: sessionsA.map((s) => ({ id: s.id, data: s.data })),
          columnes_buides: sessionsA.length === 0 ? Math.min(Math.max(a.nombre_sessions ?? 12, 1), 60) : 0,
          admeses: admeses.map((p, i) => ({
            ordre: i + 1, numero: p.numero, persona: nomPersona(p.participant), telefon: telefon ? p.participant.telefon : null,
            marques: sessionsA.map((s) => marca.get(`${s.id}:${p.id}`) ?? ""),
          })),
          espera: espera.map((p) => ({
            posicio: p.posicio_espera, numero: p.numero, persona: nomPersona(p.participant), telefon: telefon ? p.participant.telefon : null,
            oferta_pendent: p.estat === "oferta_pendent",
          })),
        };
      });
    return {
      casal: casal.nom, cicle: cicle.nom, telefon, graelles,
      totals: { activitats: graelles.length, admeses: graelles.reduce((n, g) => n + g.admeses.length, 0), espera: graelles.reduce((n, g) => n + g.espera.length, 0) },
      llegenda: Object.entries(ABREVIATURES_ASSISTENCIA).map(([k, v]) => `${v}: ${ETIQUETES_ASSISTENCIA[k as EstatAssistencia]}`).join(" · "),
    };
  }

  /** Dades d'assistència per persona i activitat (exportació XLSX de taula). */
  async taulaAssistencia(casalId: string, cicleId: string): Promise<TaulaExportacio> {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    const [activitats, places, sessions, marques] = await Promise.all([
      this.repos.activitats.llistarPerCicle(casalId, cicleId),
      this.repos.adjudicacio.places(casalId, cicleId),
      this.repos.assistencia.sessionsCicle(cicleId),
      this.repos.assistencia.marquesCicle(cicleId),
    ]);
    const files: TaulaExportacio["files"] = [];
    for (const a of activitats) {
      const ids = new Set(sessions.filter((s) => s.activitat_id === a.id).map((s) => s.id));
      const marquesA = marques.filter((m) => ids.has(m.sessio_id));
      for (const p of this.participants(places.filter((x) => x.activitat_id === a.id), marquesA)) {
        const r = resumAssistencia(marquesA.filter((m) => m.placa_id === p.id).map((m) => m.estat));
        files.push([a.nom, p.numero, nomPersona(p.participant), r.presents, r.absents, r.justificades,
          r.percentatge, sotaLlindar(r.percentatge, cicle.llindar_assistencia) ? "Sí" : "No"]);
      }
    }
    return {
      titol: `Assistència · ${cicle.nom}`,
      fitxer: `assistencia-${cicle.nom.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 50)}.xlsx`,
      columnes: ["Activitat", "Núm. sol·licitud", "Persona", "Presències", "Absències", "Absències justificades", "% d'assistència",
        cicle.llindar_assistencia ? `Per sota del ${cicle.llindar_assistencia}%` : "Per sota del llindar (no configurat)"],
      files,
    };
  }
}
