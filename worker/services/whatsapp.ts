import {
  analitzaTelefon, detallsPlantilla, netejaParametre, NOMS_PLANTILLES, PLANTILLES_WHATSAPP, textPlantilla,
  type IdiomaWhatsapp, type PlantillaWhatsapp,
} from "../../shared/domain/whatsapp";
import { avuiLocal } from "../../shared/domain/assistencia";
import type { Env } from "../env";
import { errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { clientWhatsapp, ErrorMeta, esErrorGlobal, type ClientWhatsapp } from "../lib/whatsapp-meta";
import type {
  Activitat, ConfigWhatsapp, EnviamentWhatsapp, FilaPlaca, MissatgeWhatsapp, MotiuMissatgeWhatsapp, Repositoris,
} from "../repositories/tipus";
import { horariText } from "./assistencia";
import { ServeiComunicats } from "./comunicats";
import type { ContextOperacio } from "./traca";

/** Missatges per petició: queda lluny del límit de subpeticions d'un Worker. */
export const MIDA_LOT = 25;
const COMUNICABLES = ["admesa", "llista_espera", "oferta_pendent"];

type Secrets = Pick<Env, "WHATSAPP_TOKEN" | "WHATSAPP_APP_SECRET" | "WHATSAPP_VERIFY_TOKEN" | "RESEND_API_KEY" | "CORREU_REMITENT">;

const plantillaPerEstat = (estat: string): PlantillaWhatsapp =>
  estat === "admesa" ? "placa_admesa" : estat === "oferta_pendent" ? "oferta_placa" : "llista_espera";

/**
 * WhatsApp Business (petició de 2026-10-16): enviament des del número del casal amb
 * l'API de Meta. Sense API configurada, el panell continua amb l'enviament semiautomàtic.
 * - Cap telèfon ni text de resposta es desa ni es registra: el telèfon es llegeix de la
 *   plaça en el moment d'enviar.
 * - Una resposta «No» a una oferta no fa perdre la plaça: només queda anotada perquè
 *   l'equip la tramiti (no s'apliquen pèrdues de plaça automàtiques).
 */
export class ServeiWhatsapp {
  private readonly client: ClientWhatsapp | null;

  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    private readonly secrets: Secrets,
    private readonly fetchFn?: typeof fetch,
  ) {
    this.client = secrets.WHATSAPP_TOKEN ? clientWhatsapp(secrets.WHATSAPP_TOKEN, fetchFn) : null;
  }

  /** Estat de la connexió per al panell: només si cada secret hi és, mai el valor. */
  async estat(casalId: string) {
    const config = await this.repos.whatsapp.config(casalId);
    const casal = (await this.repos.casals.perId(casalId))!;
    const idioma = config?.idioma ?? "ca";
    return {
      secrets: {
        testimoni: !!this.secrets.WHATSAPP_TOKEN,
        secret_app: !!this.secrets.WHATSAPP_APP_SECRET,
        verificacio: !!this.secrets.WHATSAPP_VERIFY_TOKEN,
      },
      config,
      disponible: this.disponible(config),
      plantilles: NOMS_PLANTILLES.map((nom) => {
        const p = PLANTILLES_WHATSAPP[nom];
        return {
          nom, titol: p.titol, categoria: "UTILITY", idioma, text: p.text[idioma],
          parametres: p.parametres, botons: p.botons?.[idioma] ?? null,
          exemple: textPlantilla(nom, idioma, p.parametres.map((k) => EXEMPLES[k] ?? k).map((v) => v.replace("{casal}", casal.nom))),
        };
      }),
    };
  }

  private disponible(config: ConfigWhatsapp | null): config is ConfigWhatsapp {
    return !!this.client && !!config?.actiu && !!config.phone_number_id;
  }

  private async configActiva(casalId: string) {
    const config = await this.repos.whatsapp.config(casalId);
    if (!this.client) throw errors.conflicte("whatsapp_sense_secrets", "Falta configurar l'accés a Meta (WHATSAPP_TOKEN) al servidor.");
    if (!this.disponible(config)) throw errors.conflicte("whatsapp_inactiu", "El WhatsApp Business d'aquest casal no està configurat o no està activat.");
    return config;
  }

  async configurar(casalId: string, d: Omit<ConfigWhatsapp, "casal_id" | "actualitzat_el">, ctx: ContextOperacio) {
    const ara = isoAra(this.rellotge);
    await this.repos.whatsapp.desarConfig({ ...d, casal_id: casalId }, ctx.usuariId ?? null, ara);
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "whatsapp.configuracio", entitat: "casal", entitat_id: casalId,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { actiu: d.actiu, idioma: d.idioma, ofertes_automatiques: d.ofertes_automatiques },
    }, ara);
    return { config: await this.repos.whatsapp.config(casalId) };
  }

  /** Comprova a Meta que el número existeix i que el testimoni hi té accés. */
  async comprovar(casalId: string) {
    const config = await this.repos.whatsapp.config(casalId);
    if (!this.client) throw errors.conflicte("whatsapp_sense_secrets", "Falta configurar l'accés a Meta (WHATSAPP_TOKEN) al servidor.");
    if (!config) throw errors.conflicte("whatsapp_sense_config", "Primer deseu l'identificador del número.");
    try {
      return { numero: await this.client.comprovaNumero(config.phone_number_id) };
    } catch (e) {
      if (e instanceof ErrorMeta) throw errors.conflicte("whatsapp_meta", e.titol);
      throw e;
    }
  }

  /** Prepara l'enviament de l'assignació (admesa, llista d'espera, oferta) a les places triades. */
  async crearEnviamentActivitat(casalId: string, cicleId: string, d: { activitat_ids?: string[]; placa_ids?: string[]; nomes_pendents: boolean }, ctx: ContextOperacio) {
    await this.configActiva(casalId);
    const places = await this.placesComunicables(casalId, cicleId);
    const [registres, darrers] = await Promise.all([this.repos.comunicacions.llistar(casalId, cicleId), this.repos.whatsapp.darrersPerPlaca(casalId, cicleId)]);
    const fets = new Set([
      ...registres.filter((r) => r.estat !== "no_contactat").map((r) => r.placa_id),
      ...darrers.filter((m) => m.plantilla !== "avis_general" && ["enviat", "entregat", "llegit"].includes(m.estat)).map((m) => m.placa_id),
    ]);
    const triades = places.filter((p) =>
      (!d.activitat_ids?.length || d.activitat_ids.includes(p.activitat_id))
      && (!d.placa_ids?.length || d.placa_ids.includes(p.id))
      && (!d.nomes_pendents || !fets.has(p.id)));
    if (triades.length === 0) throw errors.conflicte("whatsapp_res_a_enviar", "No hi ha cap persona pendent de comunicar en aquesta selecció.");
    return this.crearEnviament(casalId, cicleId, "activitat", null, { activitat_ids: d.activitat_ids ?? [], places: triades.length },
      triades.map((p) => ({ placa_id: p.id, plantilla: plantillaPerEstat(p.estat) })), ctx);
  }

  /** Comunicació general: un missatge per persona (no per plaça) a les persones de les activitats triades. */
  async crearEnviamentGeneral(casalId: string, cicleId: string, d: { text: string; activitat_ids?: string[]; situacions: ("admesa" | "espera")[] }, ctx: ContextOperacio) {
    await this.configActiva(casalId);
    const places = (await this.placesComunicables(casalId, cicleId)).filter((p) =>
      (!d.activitat_ids?.length || d.activitat_ids.includes(p.activitat_id))
      && d.situacions.includes(p.estat === "admesa" ? "admesa" : "espera"));
    const unics = destinatarisUnics(places);
    if (unics.length === 0) throw errors.conflicte("whatsapp_res_a_enviar", "No hi ha cap persona en aquesta selecció.");
    return this.crearEnviament(casalId, cicleId, "general", d.text.trim(), { activitat_ids: d.activitat_ids ?? [], situacions: d.situacions },
      unics.map((p) => ({ placa_id: p.id, plantilla: "avis_general" as const })), ctx);
  }

  private async crearEnviament(casalId: string, cicleId: string, tipus: EnviamentWhatsapp["tipus"], text: string | null, abast: object,
    missatges: { placa_id: string; plantilla: PlantillaWhatsapp }[], ctx: ContextOperacio) {
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.repos.whatsapp.crearEnviament(
      { id, casal_id: casalId, cicle_id: cicleId, tipus, text, abast: JSON.stringify(abast), usuari_id: ctx.usuariId ?? null, creat_el: ara },
      missatges.map((m) => ({ ...m, id: nouId() })), ara,
    );
    await this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "whatsapp.enviament", entitat: "whatsapp_enviament", entitat_id: id,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { tipus, missatges: missatges.length },
    }, ara);
    return { enviament_id: id, total: missatges.length };
  }

  /**
   * Envia el lot següent de missatges pendents. El panell crida fins que no en queden.
   * Si Meta rebutja per un motiu que afecta tots els missatges (testimoni, plantilla,
   * límits), s'atura i els missatges queden pendents per reprendre-ho.
   */
  async continuar(casalId: string, enviamentId: string, ctx: ContextOperacio) {
    const config = await this.configActiva(casalId);
    const enviament = await this.repos.whatsapp.enviament(casalId, enviamentId);
    if (!enviament) throw errors.noTrobat("No s'ha trobat l'enviament.");
    const lot = await this.repos.whatsapp.pendents(enviamentId, MIDA_LOT);
    let aturat: string | null = null;
    if (lot.length > 0) {
      const context = await this.contextEnviament(casalId, enviament.cicle_id);
      for (const m of lot) {
        const r = await this.enviaUn(m, enviament, config, context, ctx);
        if (r) { aturat = r; break; }
      }
    }
    const recompte = await this.repos.whatsapp.recompte(enviamentId);
    return { recompte, queden: recompte.pendent ?? 0, aturat };
  }

  /** Oferta automàtica de plaça (baixa voluntària): s'envia sola si el casal ho té activat. */
  async ofertaAutomatica(casalId: string, cicleId: string, placaId: string, ctx: ContextOperacio) {
    const config = await this.repos.whatsapp.config(casalId);
    if (!this.disponible(config) || !config.ofertes_automatiques) return null;
    const { enviament_id } = await this.crearEnviament(casalId, cicleId, "oferta", null, { placa_id: placaId },
      [{ placa_id: placaId, plantilla: "oferta_placa" }], ctx);
    const r = await this.continuar(casalId, enviament_id, ctx);
    const [m] = await this.repos.whatsapp.missatges(enviament_id);
    return { enviat: m?.estat === "enviat", estat: m?.estat ?? "pendent", motiu: m?.motiu ?? null, error: r.aturat ?? m?.error_text ?? null };
  }

  /** Enviaments del cicle amb recomptes, i el darrer missatge per plaça (per mostrar l'estat a cada persona). */
  async resum(casalId: string, cicleId: string) {
    const [config, enviaments, darrers] = await Promise.all([
      this.repos.whatsapp.config(casalId), this.repos.whatsapp.enviaments(casalId, cicleId), this.repos.whatsapp.darrersPerPlaca(casalId, cicleId),
    ]);
    return {
      disponible: this.disponible(config),
      ofertes_automatiques: !!config?.ofertes_automatiques,
      idioma: config?.idioma ?? "ca",
      enviaments: enviaments.map(({ abast, ...e }) => ({ ...e, abast: JSON.parse(abast) as unknown })),
      missatges: darrers.map(({ placa_id, plantilla, estat, motiu, error_text, resposta, resposta_el, actualitzat_el }) =>
        ({ placa_id, plantilla, estat, motiu, error_text, resposta, resposta_el, actualitzat_el })),
    };
  }

  /**
   * Avisos de Meta (webhook): estat d'entrega dels missatges i respostes. De les respostes
   * només es desa si n'hi ha hagut i quin botó s'ha premut, no el text ni el número.
   */
  async processaAvis(cos: unknown) {
    const ara = isoAra(this.rellotge);
    const valors = ((cos as AvisMeta)?.entry ?? []).flatMap((e) => e.changes ?? []).map((c) => c.value ?? {});
    let estats = 0, respostes = 0;
    for (const v of valors) {
      for (const st of v.statuses ?? []) {
        const estat = ({ sent: "enviat", delivered: "entregat", read: "llegit", failed: "fallit" } as const)[st.status ?? ""];
        if (!st.id || !estat) continue;
        const error = st.errors?.[0] ? { codi: Number(st.errors[0].code ?? 0), text: String(st.errors[0].title ?? "Error de Meta") } : null;
        const m = await this.repos.whatsapp.canviEstatPerWamid(st.id, estat, error, ara);
        if (!m) {
          // Missatges dels comunicats de la superadministració.
          const d = await this.repos.comunicats.canviEstatPerWamid(st.id, estat, error, ara);
          if (d) {
            estats++;
            // El número no té WhatsApp: es prova per correu.
            if (estat === "fallit" && error && [131026, 131021, 131030].includes(error.codi)) {
              await new ServeiComunicats(this.repos, this.rellotge, this.secrets, this.fetchFn).alternativaDespresDeFallada(d);
            }
          }
          continue;
        }
        estats++;
        if (estat === "fallit" && m.plantilla !== "avis_general" && error && [131026, 131021, 131030].includes(error.codi)) {
          const placa = await this.repos.adjudicacio.placa(m.casal_id, m.placa_id);
          if (placa && COMUNICABLES.includes(placa.estat)) {
            await this.repos.comunicacions.desar({
              placa_id: m.placa_id, casal_id: m.casal_id, cicle_id: m.cicle_id, tipus: placa.estat === "admesa" ? "admesa" : "espera",
              canal: "whatsapp_api", estat: "no_contactat", motiu: "sense_whatsapp", nota: null, usuari_id: null, actualitzat_el: ara,
            });
          }
        }
      }
      for (const msg of v.messages ?? []) {
        const ref = msg.context?.id;
        if (!ref) continue;
        const original = await this.repos.whatsapp.perWamid(ref);
        if (!original) continue;
        let resposta: "si" | "no" | "text" = "text";
        if (original.plantilla === "oferta_placa") {
          const boto = (msg.button?.text ?? msg.button?.payload ?? msg.interactive?.button_reply?.title ?? "").trim().toLowerCase();
          const config = await this.repos.whatsapp.config(original.casal_id);
          const botons = PLANTILLES_WHATSAPP.oferta_placa.botons[config?.idioma ?? "ca"].map((b) => b.toLowerCase());
          if (boto && boto === botons[0]) resposta = "si";
          else if (boto && boto === botons[1]) resposta = "no";
        }
        if (await this.repos.whatsapp.resposta(ref, resposta, ara)) respostes++;
      }
    }
    return { estats, respostes };
  }

  private async placesComunicables(casalId: string, cicleId: string) {
    const cicle = await this.repos.cicles.perId(casalId, cicleId);
    if (!cicle) throw errors.noTrobat("No s'ha trobat el cicle.");
    return (await this.repos.adjudicacio.places(casalId, cicleId)).filter((p) => COMUNICABLES.includes(p.estat));
  }

  private async contextEnviament(casalId: string, cicleId: string) {
    const [casal, cicle, activitats, places] = await Promise.all([
      this.repos.casals.perId(casalId), this.repos.cicles.perId(casalId, cicleId),
      this.repos.activitats.llistarPerCicle(casalId, cicleId), this.repos.adjudicacio.places(casalId, cicleId),
    ]);
    return {
      casal: casal!.nom, inici: cicle!.data_inici, avui: avuiLocal(this.rellotge.ara()),
      activitats: new Map(activitats.map((a) => [a.id, a])), places: new Map(places.map((p) => [p.id, p])),
    };
  }

  /** Envia un missatge. Retorna un text si cal aturar tot l'enviament. */
  private async enviaUn(m: MissatgeWhatsapp, enviament: EnviamentWhatsapp, config: ConfigWhatsapp,
    context: Awaited<ReturnType<ServeiWhatsapp["contextEnviament"]>>, ctx: ContextOperacio): Promise<string | null> {
    const ara = isoAra(this.rellotge);
    const placa = context.places.get(m.placa_id);
    const activitat = placa ? context.activitats.get(placa.activitat_id) : undefined;
    const esAssignacio = m.plantilla !== "avis_general";
    if (!placa || !activitat || !COMUNICABLES.includes(placa.estat)) {
      await this.repos.whatsapp.actualitzar(m.id, { estat: "no_enviable", motiu: null, error_text: "La plaça ja no està admesa ni en llista d'espera." }, ara);
      return null;
    }
    const telefon = analitzaTelefon(placa.participant.telefon);
    if (telefon.tipus !== "mobil" && telefon.tipus !== "estranger") {
      const motiu: MotiuMissatgeWhatsapp = telefon.tipus === "fix" ? "telefon_fix" : telefon.tipus === "sense" ? "sense_telefon" : "telefon_invalid";
      await this.repos.whatsapp.actualitzar(m.id, { estat: "no_enviable", motiu }, ara);
      if (esAssignacio) await this.registraComunicacio(m, placa, "no_contactat", motiu, ctx, ara);
      return null;
    }
    try {
      const { wamid } = await this.client!.enviaPlantilla({
        phoneNumberId: config.phone_number_id, destinatari: telefon.internacional!, plantilla: m.plantilla, idioma: config.idioma,
        parametres: parametres(m.plantilla, config.idioma, placa, activitat, context, enviament.text),
      });
      await this.repos.whatsapp.actualitzar(m.id, { estat: "enviat", wamid, motiu: null, error_codi: null, error_text: null }, ara);
      if (esAssignacio) await this.registraComunicacio(m, placa, "enviat", null, ctx, ara);
      return null;
    } catch (e) {
      if (!(e instanceof ErrorMeta)) throw e;
      if (esErrorGlobal(e)) {
        await this.repos.whatsapp.actualitzar(m.id, { error_codi: e.codi, error_text: e.titol }, ara);
        return e.titol;
      }
      const motiu: MotiuMissatgeWhatsapp = e.destinatariNoDisponible ? "sense_whatsapp" : "error_meta";
      await this.repos.whatsapp.actualitzar(m.id, { estat: "fallit", motiu, error_codi: e.codi, error_text: e.titol }, ara);
      if (esAssignacio && motiu === "sense_whatsapp") await this.registraComunicacio(m, placa, "no_contactat", "sense_whatsapp", ctx, ara);
      return null;
    }
  }

  private async registraComunicacio(m: MissatgeWhatsapp, placa: FilaPlaca, estat: "enviat" | "no_contactat", motiu: MotiuMissatgeWhatsapp | null, ctx: ContextOperacio, ara: string) {
    await this.repos.comunicacions.desar({
      placa_id: placa.id, casal_id: m.casal_id, cicle_id: m.cicle_id,
      tipus: placa.estat === "admesa" ? "admesa" : "espera", canal: "whatsapp_api", estat,
      motiu: estat === "no_contactat" ? (motiu === "error_meta" ? "altres" : motiu) : null, nota: null,
      usuari_id: ctx.usuariId ?? null, actualitzat_el: ara,
    });
  }
}

const EXEMPLES: Record<string, string> = {
  nom: "Maria", casal: "{casal}", activitat: "Ioga", detalls: "dilluns i dimecres, 10:00–11:30, aula 2, a partir del 05/10/2026",
  posicio: "3", cicle: "Tardor 2026", codi: "7K2QX-M4P9A", text: "Dimecres que ve el casal estarà tancat per festa local.",
};

function parametres(plantilla: PlantillaWhatsapp, idioma: IdiomaWhatsapp, placa: FilaPlaca, activitat: Activitat,
  context: { casal: string; inici: string; avui: string }, text: string | null): string[] {
  const inici = activitat.data_inici ?? context.inici;
  const valors: Record<string, string | number | null> = {
    nom: placa.participant.nom ?? "", casal: context.casal, activitat: activitat.nom,
    detalls: detallsPlantilla({ horari: horariText(activitat), espai: activitat.espai, data_inici: inici > context.avui ? inici : null }, idioma),
    posicio: placa.posicio_espera, text,
  };
  return PLANTILLES_WHATSAPP[plantilla].parametres.map((k) => netejaParametre(valors[k], k === "text" ? 900 : 200));
}

/** Una persona rep una sola comunicació general encara que tingui plaça a diverses activitats (mateix telèfon). */
export function destinatarisUnics<T extends { id: string; participant: { id: string; telefon: string | null } }>(places: T[]): T[] {
  const vistos = new Set<string>();
  return places.filter((p) => {
    const clau = analitzaTelefon(p.participant.telefon).internacional ?? `p:${p.participant.id}`;
    if (vistos.has(clau)) return false;
    vistos.add(clau);
    return true;
  });
}

interface AvisMeta {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id?: string; status?: string; errors?: { code?: number; title?: string }[] }[];
        messages?: {
          context?: { id?: string };
          button?: { text?: string; payload?: string };
          interactive?: { button_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}
