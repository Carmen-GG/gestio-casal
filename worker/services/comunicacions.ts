import type { z } from "zod";
import { avuiLocal } from "../../shared/domain/assistencia";
import { comparaPersones } from "../../shared/domain/ordenacio";
import type { registreComunicacio } from "../../shared/schemas/comunicacions";
import { errors } from "../http/errors";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { FilaPlaca, Repositoris } from "../repositories/tipus";
import { horariText } from "./assistencia";
import type { ContextOperacio } from "./traca";

const ESTATS_COMUNICABLES = ["admesa", "llista_espera", "oferta_pendent"];

/**
 * Comunicació de l'assignació (petició de 2026-10-15): un missatge per activitat i
 * persona, admesa o en llista d'espera, i el registre de qui no s'ha pogut contactar.
 *
 * Mentre el casal no tingui l'API de WhatsApp Business, l'enviament és semiautomàtic:
 * el panell obre WhatsApp amb el missatge escrit i aquí només es desa que s'ha enviat
 * (canal «whatsapp_manual»). Amb l'API, el mateix registre servirà amb canal «whatsapp_api».
 */
export class ServeiComunicacions {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  /** Persones a comunicar per activitat, amb nom, cognoms, telèfon i el que ja s'ha fet. Exigeix poder veure el contacte. */
  async assignacions(casalId: string, cicleId: string) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    const casal = (await this.repos.casals.perId(casalId))!;
    const [activitats, places, registres] = await Promise.all([
      this.repos.activitats.llistarPerCicle(casalId, cicleId),
      this.repos.adjudicacio.places(casalId, cicleId),
      this.repos.comunicacions.llistar(casalId, cicleId),
    ]);
    const perPlaca = new Map(registres.map((r) => [r.placa_id, r]));
    const persona = (p: FilaPlaca) => ({
      placa_id: p.id, sollicitud_id: p.sollicitud_id, participant_id: p.participant.id, numero: p.numero,
      situacio: p.estat === "admesa" ? "admesa" as const : "espera" as const,
      oferta_pendent: p.estat === "oferta_pendent",
      posicio: p.estat === "admesa" ? null : p.posicio_espera,
      nom: p.participant.nom ?? "", cognoms: [p.participant.cognom1, p.participant.cognom2].filter(Boolean).join(" "),
      telefon: p.participant.telefon,
      comunicacio: perPlaca.get(p.id) ?? null,
    });
    const perNom = (a: FilaPlaca, b: FilaPlaca) =>
      comparaPersones({ cognom1: a.participant.cognom1 ?? "", cognom2: a.participant.cognom2, nom: a.participant.nom ?? "" },
        { cognom1: b.participant.cognom1 ?? "", cognom2: b.participant.cognom2, nom: b.participant.nom ?? "" });
    const grups = activitats
      .map((a) => {
        const propies = places.filter((p) => p.activitat_id === a.id && ESTATS_COMUNICABLES.includes(p.estat));
        const admeses = propies.filter((p) => p.estat === "admesa").sort(perNom);
        const espera = propies.filter((p) => p.estat !== "admesa")
          .sort((x, y) => (x.posicio_espera ?? 1e9) - (y.posicio_espera ?? 1e9) || x.numero - y.numero);
        return {
          activitat_id: a.id, activitat: a.nom, horari: horariText(a), espai: a.espai, data_inici: a.data_inici ?? cicle.data_inici,
          persones: [...admeses, ...espera].map(persona),
        };
      })
      .filter((g) => g.persones.length > 0);
    return { casal: casal.nom, cicle: { id: cicle.id, nom: cicle.nom, estat: cicle.estat }, avui: avuiLocal(this.rellotge.ara()), activitats: grups };
  }

  /** Desa què s'ha comunicat a una plaça (enviat, no contactat o contactat per telèfon). */
  async registrar(casalId: string, placaId: string, d: z.infer<typeof registreComunicacio>, ctx: ContextOperacio) {
    const placa = await this.repos.adjudicacio.placa(casalId, placaId);
    if (!placa) throw errors.noTrobat("No s'ha trobat la plaça.");
    if (!ESTATS_COMUNICABLES.includes(placa.estat)) {
      throw errors.conflicte("placa_no_comunicable", "Aquesta plaça ja no està admesa ni en llista d'espera.");
    }
    const ara = isoAra(this.rellotge);
    const registre = {
      placa_id: placaId, tipus: d.tipus, canal: d.canal, estat: d.estat,
      motiu: d.estat === "no_contactat" ? d.motiu ?? null : null, nota: d.nota?.trim() || null, actualitzat_el: ara,
    };
    await this.repos.comunicacions.desar({ ...registre, casal_id: casalId, cicle_id: placa.cicle_id, usuari_id: ctx.usuariId ?? null });
    // A l'auditoria no hi va cap dada personal ni la nota.
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "comunicacions.registre", entitat: "placa", entitat_id: placaId,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { tipus: d.tipus, canal: d.canal, estat: d.estat, motiu: registre.motiu },
    }, ara);
    return { comunicacio: registre };
  }

  /** Desfà el registre (per exemple, si s'ha marcat com a enviat per error). */
  async esborrar(casalId: string, placaId: string, ctx: ContextOperacio) {
    const n = await this.repos.comunicacions.esborrar(casalId, placaId);
    if (n === 0) throw errors.noTrobat("Aquesta plaça no tenia cap comunicació registrada.");
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "comunicacions.desfer", entitat: "placa", entitat_id: placaId,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: {},
    }, isoAra(this.rellotge));
    return { ok: true };
  }
}
