import type { RespostaSollicitudRegistrada } from "../../shared/api/public";
import { acceptaSollicituds } from "../../shared/domain/cicles";
import { CAMPS_PERSONALS, configuracioFormulariEfectiva, errorsDadesSegonsConfiguracio, type CampPersonal } from "../../shared/domain/formulari";
import { clauOrdenacioPersona } from "../../shared/domain/ordenacio";
import { missatgeErrorPreferencies, validaPreferencies } from "../../shared/domain/preferencies";
import type { SollicitudPublica } from "../../shared/schemas/public";
import { ErrorAplicacio, errors } from "../http/errors";
import { resumSha256 } from "../lib/cripto";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { Cicle, Repositoris, SollicitudRegistrada } from "../repositories/tipus";
import { ServeiConsultaPublica } from "./consulta-publica";

/** Clau d'idempotència generada pel navegador (UUID o similar). */
const PATRO_CLAU = /^[A-Za-z0-9_-]{16,64}$/;

/** Alfabet de Crockford (32 símbols, sense I, L, O ni U): fàcil de dictar i sense biaix amb 5 bits per símbol. */
const ALFABET_CODI = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function codiConfirmacioAleatori(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const s = [...bytes].map((b) => ALFABET_CODI[b & 31]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

const INTENTS_MAXIMS = 3;

/**
 * Recepció de sol·licituds del formulari públic. Totes les comprovacions es fan
 * al servidor, encara que el navegador ja les hagi fet: el navegador només ajuda.
 */
export class ServeiSollicitudsPubliques {
  private readonly consulta: ServeiConsultaPublica;

  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {
    this.consulta = new ServeiConsultaPublica(repos, rellotge);
  }

  async registrar(
    codiCasal: string, cicleId: string, clau: string | undefined, cos: SollicitudPublica, idPeticio: string | null,
  ): Promise<RespostaSollicitudRegistrada> {
    if (!clau || !PATRO_CLAU.test(clau)) {
      throw new ErrorAplicacio(400, "clau_idempotencia_requerida", "Falta l'identificador d'enviament. Recarregueu la pàgina i torneu-ho a provar.");
    }
    if (cos.web) {
      // Camp parany omplert: enviament automàtic. No es desa res ni es dona cap detall.
      throw new ErrorAplicacio(400, "peticio_rebutjada", "No s'ha pogut registrar la sol·licitud.");
    }
    const casal = await this.consulta.casalActiu(codiCasal);
    const cicle = await this.consulta.ciclePublicat(casal, cicleId);

    const dades = Object.fromEntries(CAMPS_PERSONALS.map((c) => [c, cos.dades[c] ?? null])) as Record<CampPersonal, string | null>;
    const preferencies = [...cos.preferencies].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const resum = await resumSha256(JSON.stringify({ dades, preferencies }));

    // Reintent (doble clic, connexió tallada): mateixa clau → mateixa confirmació.
    const previa = await this.repos.sollicituds.perClauIdempotencia(casal.id, cicle.id, clau);
    if (previa) return this.respostaRepetida(previa, resum, cicle);

    const config = configuracioFormulariEfectiva(cicle.configuracio_formulari);
    if (!config.informacio_privacitat) {
      throw errors.conflicte("privacitat_no_configurada",
        "Aquest formulari encara no està disponible. Torneu-ho a provar més endavant o adreceu-vos al casal.");
    }
    if (!acceptaSollicituds(cicle, this.rellotge.ara())) {
      throw errors.conflicte("cicle_tancat", "El període d'inscripció d'aquest cicle no està obert.");
    }

    const errorsCamps: Record<string, string> = Object.fromEntries(
      Object.entries(errorsDadesSegonsConfiguracio(dades, config)).map(([k, v]) => [`dades.${k}`, v]),
    );
    const avui = isoAra(this.rellotge).slice(0, 10);
    if (dades.data_naixement && dades.data_naixement > avui) {
      errorsCamps["dades.data_naixement"] = "La data de naixement no pot ser posterior a avui.";
    }
    const errorPreferencies = validaPreferencies(preferencies);
    if (errorPreferencies) errorsCamps.preferencies = missatgeErrorPreferencies(errorPreferencies);
    if (Object.keys(errorsCamps).length) {
      throw errors.peticioInvalida("Hi ha dades no vàlides. Reviseu els camps marcats.", errorsCamps);
    }

    const actives = new Set((await this.repos.activitats.llistarPerCicle(casal.id, cicle.id, { estats: ["activa"] })).map((a) => a.id));
    if (preferencies.some((p) => !actives.has(p.activitat_id))) throw errorActivitat();

    const privacitatResum = await resumSha256(config.informacio_privacitat);
    for (let intent = 1; ; intent++) {
      const rebudaEl = isoAra(this.rellotge);
      let resultat;
      try {
        resultat = await this.repos.sollicituds.registrarPublica({
          sollicitud_id: nouId(), participant_id: nouId(), casal_id: casal.id, cicle_id: cicle.id,
          codi_confirmacio: codiConfirmacioAleatori(), clau_idempotencia: clau, resum_peticio: resum,
          privacitat_resum: privacitatResum, rebuda_el: rebudaEl, dades,
          clau_ordenacio: clauOrdenacioPersona({ nom: dades.nom!, cognom1: dades.cognom1!, cognom2: dades.cognom2 }),
          preferencies: preferencies.map((p) => ({ activitat_id: p.activitat_id, ordre: p.ordre! })),
          id_peticio: idPeticio,
        });
      } catch (e) {
        if (!/UNIQUE constraint failed/i.test((e as Error).message)) throw e;
        // Dos enviaments simultanis amb la mateixa clau: l'altre ja l'ha desat.
        const guanyadora = await this.repos.sollicituds.perClauIdempotencia(casal.id, cicle.id, clau);
        if (guanyadora) return this.respostaRepetida(guanyadora, resum, cicle);
        // Col·lisió del codi de confirmació o del número correlatiu: es torna a provar.
        if (intent >= INTENTS_MAXIMS) throw e;
        continue;
      }
      if (resultat.tipus === "cicle_no_accepta") {
        throw errors.conflicte("cicle_tancat", "El període d'inscripció d'aquest cicle no està obert.");
      }
      if (resultat.tipus === "activitat_no_disponible") throw errorActivitat();
      return resposta(resultat.sollicitud, cicle, false);
    }
  }

  private respostaRepetida(previa: SollicitudRegistrada, resum: string, cicle: Cicle) {
    if (previa.resum_peticio !== resum) {
      throw errors.conflicte("clau_idempotencia_reutilitzada",
        "Aquest enviament ja s'havia fet amb unes dades diferents. Recarregueu la pàgina per fer una sol·licitud nova.");
    }
    return resposta(previa, cicle, true);
  }
}

function errorActivitat() {
  return errors.peticioInvalida("Alguna de les activitats triades ja no està disponible. Recarregueu la pàgina.", {
    preferencies: "Alguna de les activitats triades ja no està disponible.",
  });
}

function resposta(s: SollicitudRegistrada, cicle: Cicle, repetida: boolean): RespostaSollicitudRegistrada {
  return {
    codi_confirmacio: s.codi_confirmacio,
    rebuda_el: s.rebuda_el,
    data_resolucio_prevista: cicle.data_resolucio_prevista,
    cicle: cicle.nom,
    preferencies: s.preferencies,
    repetida,
  };
}
