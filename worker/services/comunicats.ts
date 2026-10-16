import { analitzaTelefon, netejaParametre, type TelefonAnalitzat } from "../../shared/domain/whatsapp";
import type { Env } from "../env";
import { errors } from "../http/errors";
import { clientCorreu, ErrorCorreu, type ClientCorreu } from "../lib/correu";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { clientWhatsapp, ErrorMeta, esErrorGlobal, type ClientWhatsapp } from "../lib/whatsapp-meta";
import type {
  ConfigWhatsapp, ConfigWhatsappCentral, ContactePersona, DestinatariComunicat, MotiuComunicat, Repositoris,
} from "../repositories/tipus";
import type { ContextOperacio } from "./traca";

/** Destinataris per petició: queda lluny del límit de subpeticions d'un Worker. */
export const MIDA_LOT_COMUNICATS = 25;
const CONTACTATS = ["enviat", "entregat", "llegit"];

type Secrets = Pick<Env, "WHATSAPP_TOKEN" | "RESEND_API_KEY" | "CORREU_REMITENT">;
type NumeroWhatsapp = { phone_number_id: string; idioma: "ca" | "es"; origen: "casal" | "central" };

export interface DadesComunicat {
  assumpte: string;
  text: string;
  casal_ids: string[];
  correu_responsables: boolean;
  whatsapp_responsables: boolean;
  whatsapp_persones: boolean;
}

/**
 * Telèfon per escriure per WhatsApp a una persona usuària: el primer mòbil entre el mòbil,
 * l'opcional i el del tutor/a. Si no n'hi ha cap, el motiu del primer número que hi hagi.
 */
export function telefonPersona(p: Pick<ContactePersona, "telefon_mobil" | "telefon_opcional" | "telefon_fix" | "tutor_telefon">): TelefonAnalitzat {
  const candidats = [p.telefon_mobil, p.telefon_opcional, p.tutor_telefon, p.telefon_fix].map((t) => analitzaTelefon(t));
  return candidats.find((t) => t.tipus === "mobil" || t.tipus === "estranger")
    ?? candidats.find((t) => t.tipus === "fix") ?? candidats.find((t) => t.tipus === "invalid") ?? { tipus: "sense", internacional: null };
}

const motiuTelefon = (t: TelefonAnalitzat): MotiuComunicat | null =>
  t.tipus === "mobil" || t.tipus === "estranger" ? null : t.tipus === "fix" ? "telefon_fix" : t.tipus === "sense" ? "sense_telefon" : "telefon_invalid";

/**
 * Comunicats de la superadministració (petició de 2026-10-16): un avís als casals triats,
 * per correu i WhatsApp a les responsables i per WhatsApp a les persones usuàries de cada
 * casal (les importades de la PGEc). Cap telèfon ni correu es desa: es llegeixen en enviar.
 * Les persones reben el WhatsApp des del número del seu casal si el té actiu; si no, des del
 * número de la superadministració.
 */
export class ServeiComunicats {
  private readonly whatsapp: ClientWhatsapp | null;
  private readonly correu: ClientCorreu | null;

  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    secrets: Secrets,
    fetchFn?: typeof fetch,
  ) {
    this.whatsapp = secrets.WHATSAPP_TOKEN ? clientWhatsapp(secrets.WHATSAPP_TOKEN, fetchFn) : null;
    this.correu = secrets.RESEND_API_KEY && secrets.CORREU_REMITENT ? clientCorreu(secrets.RESEND_API_KEY, secrets.CORREU_REMITENT, fetchFn) : null;
  }

  private centralActiu(c: ConfigWhatsappCentral | null): c is ConfigWhatsappCentral {
    return !!this.whatsapp && !!c?.actiu;
  }

  private numeroCasal(propi: ConfigWhatsapp | null, central: ConfigWhatsappCentral | null): NumeroWhatsapp | null {
    if (this.whatsapp && propi?.actiu) return { phone_number_id: propi.phone_number_id, idioma: propi.idioma, origen: "casal" };
    if (this.centralActiu(central)) return { phone_number_id: central.phone_number_id, idioma: central.idioma, origen: "central" };
    return null;
  }

  /** Casals amb responsables i persones, configuració i historial. Només recomptes de les persones. */
  async estat() {
    const [casals, responsables, central, comunicats] = await Promise.all([
      this.repos.casals.llistar(), this.repos.usuaris.responsables(), this.repos.comunicats.configCentral(), this.repos.comunicats.llistar(20),
    ]);
    const files = await Promise.all(casals.map(async (k) => {
      const [propi, contactes] = await Promise.all([this.repos.whatsapp.config(k.id), this.repos.personesPlataforma.contactes(k.id)]);
      const numero = this.numeroCasal(propi, central);
      return {
        id: k.id, codi: k.codi, nom: k.nom, municipi: k.municipi, actiu: k.actiu,
        responsables: responsables.filter((r) => r.casal_id === k.id).map((r) => ({
          usuari_id: r.usuari_id, nom_visible: r.nom_visible, email: r.email, te_mobil: !motiuTelefon(analitzaTelefon(r.telefon)),
        })),
        whatsapp: numero?.origen ?? null,
        persones: contactes.length,
        persones_mobil: contactes.filter((p) => !motiuTelefon(telefonPersona(p))).length,
      };
    }));
    return {
      serveis: { whatsapp: !!this.whatsapp, correu: !!this.correu },
      config_central: central,
      casals: files,
      comunicats: comunicats.map(({ casal_ids, canals, ...c }) => ({ ...c, casal_ids: JSON.parse(casal_ids) as string[], canals: JSON.parse(canals) as object })),
    };
  }

  async configurarCentral(d: Omit<ConfigWhatsappCentral, "actualitzat_el">, ctx: ContextOperacio) {
    const ara = isoAra(this.rellotge);
    await this.repos.comunicats.desarConfigCentral(d, ctx.usuariId ?? null, ara);
    await this.repos.auditoria.registrar({
      casal_id: null, usuari_id: ctx.usuariId, tipus_operacio: "whatsapp.configuracio_central", entitat: "whatsapp_central", entitat_id: null,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { actiu: d.actiu, idioma: d.idioma },
    }, ara);
    return { config: await this.repos.comunicats.configCentral() };
  }

  async comprovarCentral() {
    const config = await this.repos.comunicats.configCentral();
    if (!this.whatsapp) throw errors.conflicte("whatsapp_sense_secrets", "Falta configurar l'accés a Meta (WHATSAPP_TOKEN) al servidor.");
    if (!config) throw errors.conflicte("whatsapp_sense_config", "Primer deseu l'identificador del número.");
    try {
      return { numero: await this.whatsapp.comprovaNumero(config.phone_number_id) };
    } catch (e) {
      if (e instanceof ErrorMeta) throw errors.conflicte("whatsapp_meta", e.titol);
      throw e;
    }
  }

  /**
   * Prepara el comunicat: una fila per destinatari i canal. Els que ja se sap que no es
   * podran contactar (telèfon fix, sense telèfon, casal sense número) queden anotats amb el
   * motiu. Una persona amb el mateix mòbil a diversos casals el rep una sola vegada.
   */
  async crear(d: DadesComunicat, ctx: ContextOperacio) {
    const casals = (await this.repos.casals.llistar()).filter((k) => d.casal_ids.includes(k.id));
    if (casals.length === 0) throw errors.peticioInvalida("Trieu almenys un casal.");
    const [responsables, central] = await Promise.all([this.repos.usuaris.responsables(), this.repos.comunicats.configCentral()]);
    type Fila = Omit<DestinatariComunicat, "comunicat_id" | "wamid" | "error_text" | "creat_el" | "actualitzat_el">;
    const files: Fila[] = [];
    const fila = (casal_id: string, tipus: Fila["tipus"], referencia_id: string, canal: Fila["canal"], motiu: MotiuComunicat | null): Fila =>
      ({ id: nouId(), casal_id, tipus, referencia_id, canal, estat: motiu ? "no_enviable" : "pendent", motiu });
    const correuManual: { nom: string; email: string; casal: string }[] = [];
    const vistosCorreu = new Set<string>(), vistosWaResp = new Set<string>(), vistosMobil = new Set<string>();

    for (const k of casals) {
      for (const r of responsables.filter((x) => x.casal_id === k.id)) {
        if (d.correu_responsables && !vistosCorreu.has(r.usuari_id)) {
          vistosCorreu.add(r.usuari_id);
          if (this.correu) files.push(fila(k.id, "responsable", r.usuari_id, "correu", null));
          else correuManual.push({ nom: r.nom_visible, email: r.email, casal: k.nom });
        }
        if (d.whatsapp_responsables && !vistosWaResp.has(r.usuari_id)) {
          vistosWaResp.add(r.usuari_id);
          const t = analitzaTelefon(r.telefon);
          if (t.internacional) vistosMobil.add(t.internacional);
          files.push(fila(k.id, "responsable", r.usuari_id, "whatsapp", motiuTelefon(t) ?? (this.centralActiu(central) ? null : "sense_numero")));
        }
      }
      if (d.whatsapp_persones) {
        const numero = this.numeroCasal(await this.repos.whatsapp.config(k.id), central);
        for (const p of await this.repos.personesPlataforma.contactes(k.id)) {
          const t = telefonPersona(p);
          if (t.internacional) {
            if (vistosMobil.has(t.internacional)) continue;
            vistosMobil.add(t.internacional);
          }
          files.push(fila(k.id, "persona", p.id, "whatsapp", motiuTelefon(t) ?? (numero ? null : "sense_numero")));
        }
      }
    }
    if (files.length === 0 && correuManual.length === 0) throw errors.conflicte("comunicat_sense_destinataris", "Els casals triats no tenen cap destinatari per als canals triats.");

    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.repos.comunicats.crear({
      id, assumpte: d.assumpte.trim(), text: d.text.trim(), casal_ids: JSON.stringify(casals.map((k) => k.id)),
      canals: JSON.stringify({ correu_responsables: d.correu_responsables, whatsapp_responsables: d.whatsapp_responsables, whatsapp_persones: d.whatsapp_persones }),
      usuari_id: ctx.usuariId ?? null, creat_el: ara,
    }, files, ara);
    await this.repos.auditoria.registrar({
      casal_id: null, usuari_id: ctx.usuariId, tipus_operacio: "comunicat.creacio", entitat: "comunicat", entitat_id: id,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null,
      detalls: { casals: casals.length, destinataris: files.length, pendents: files.filter((f) => f.estat === "pendent").length },
    }, ara);
    return {
      comunicat_id: id, total: files.length, pendents: files.filter((f) => f.estat === "pendent").length,
      correu_manual: correuManual.length ? correuManual : null,
    };
  }

  /**
   * Envia el lot següent. Si Meta o el servei de correu rebutgen per un motiu que afecta tots
   * els missatges (clau, plantilla, límits), s'atura i es pot reprendre.
   */
  async continuar(id: string) {
    const comunicat = await this.repos.comunicats.perId(id);
    if (!comunicat) throw errors.noTrobat("No s'ha trobat el comunicat.");
    const lot = await this.repos.comunicats.pendents(id, MIDA_LOT_COMUNICATS);
    const central = await this.repos.comunicats.configCentral();
    const casals = new Map((await this.repos.casals.llistar()).map((k) => [k.id, k.nom]));
    const numeros = new Map<string, NumeroWhatsapp | null>();
    let aturat: string | null = null;
    for (const d of lot) {
      if (!numeros.has(d.casal_id)) numeros.set(d.casal_id, this.numeroCasal(await this.repos.whatsapp.config(d.casal_id), central));
      aturat = await this.enviaUn(d, comunicat, d.tipus === "responsable"
        ? (this.centralActiu(central) ? { phone_number_id: central.phone_number_id, idioma: central.idioma, origen: "central" } : null)
        : numeros.get(d.casal_id)!, d.tipus === "responsable" ? (central?.remitent ?? "") : (casals.get(d.casal_id) ?? ""));
      if (aturat) break;
    }
    const recompte = await this.recompte(id);
    return { recompte, queden: recompte.pendent ?? 0, aturat };
  }

  private async recompte(id: string) {
    const r: Record<string, number> = {};
    for (const d of await this.repos.comunicats.destinataris(id)) r[d.estat] = (r[d.estat] ?? 0) + 1;
    return r;
  }

  private async enviaUn(d: DestinatariComunicat, c: { assumpte: string; text: string }, numero: NumeroWhatsapp | null, remitent: string): Promise<string | null> {
    const ara = isoAra(this.rellotge);
    const marca = (motiu: MotiuComunicat, error_text: string | null = null) =>
      this.repos.comunicats.actualitzar(d.id, { estat: "no_enviable", motiu, error_text }, ara);
    let nom: string, email: string | null = null, telefon: TelefonAnalitzat;
    if (d.tipus === "responsable") {
      const u = await this.repos.usuaris.perId(d.referencia_id);
      if (!u) { await marca("sense_correu", "La persona ja no existeix."); return null; }
      nom = u.nom_visible; email = u.email; telefon = analitzaTelefon(u.telefon);
    } else {
      const p = await this.repos.personesPlataforma.perId(d.casal_id, d.referencia_id);
      if (!p) { await marca("sense_telefon", "La persona ja no és a la llista del casal."); return null; }
      nom = p.dades.nom ?? p.nom ?? "";
      telefon = telefonPersona({
        telefon_mobil: p.dades.telefon_mobil ?? null, telefon_opcional: p.dades.telefon_opcional ?? null,
        telefon_fix: p.dades.telefon_fix ?? null, tutor_telefon: p.dades.tutor_telefon ?? null,
      });
    }

    if (d.canal === "correu") {
      if (!this.correu) return "El servei de correu no està configurat al servidor.";
      if (!email) { await marca("sense_correu"); return null; }
      try {
        await this.correu.envia({ a: email, assumpte: c.assumpte, text: `${c.text}\n\n--\nCasal · Gestió integral d'inscripcions i activitats` });
        await this.repos.comunicats.actualitzar(d.id, { estat: "enviat", motiu: null, error_text: null }, ara);
        return null;
      } catch (e) {
        if (!(e instanceof ErrorCorreu)) throw e;
        if (e.global) return e.titol;
        await this.repos.comunicats.actualitzar(d.id, { estat: "fallit", motiu: "error_correu", error_text: e.titol }, ara);
        return null;
      }
    }

    if (!numero || !this.whatsapp) { await marca("sense_numero"); return null; }
    const motiu = motiuTelefon(telefon);
    if (motiu) { await marca(motiu); return null; }
    try {
      const { wamid } = await this.whatsapp.enviaPlantilla({
        phoneNumberId: numero.phone_number_id, destinatari: telefon.internacional!, plantilla: "avis_general", idioma: numero.idioma,
        parametres: [netejaParametre(nom, 200), netejaParametre(remitent, 200), netejaParametre(c.text, 900)],
      });
      await this.repos.comunicats.actualitzar(d.id, { estat: "enviat", wamid, motiu: null, error_text: null }, ara);
      return null;
    } catch (e) {
      if (!(e instanceof ErrorMeta)) throw e;
      if (esErrorGlobal(e)) return e.titol;
      await this.repos.comunicats.actualitzar(d.id, {
        estat: "fallit", motiu: e.destinatariNoDisponible ? "sense_whatsapp" : "error_meta", error_text: e.titol,
      }, ara);
      return null;
    }
  }

  /**
   * Resultat per casal: quantes persones s'han contactat i quines no, amb el motiu. Els noms
   * i telèfons es llegeixen ara (no es desen amb el comunicat).
   */
  async resultat(id: string) {
    const comunicat = await this.repos.comunicats.perId(id);
    if (!comunicat) throw errors.noTrobat("No s'ha trobat el comunicat.");
    const destinataris = await this.repos.comunicats.destinataris(id);
    const casalIds = JSON.parse(comunicat.casal_ids) as string[];
    const casals = new Map((await this.repos.casals.llistar()).map((k) => [k.id, k]));
    const casalsResultat = await Promise.all(casalIds.map(async (casalId) => {
      const propis = destinataris.filter((d) => d.casal_id === casalId);
      const persones = propis.filter((d) => d.tipus === "persona");
      const contactes = new Map((persones.some((d) => d.estat !== "pendent" && !CONTACTATS.includes(d.estat))
        ? await this.repos.personesPlataforma.contactes(casalId) : []).map((p) => [p.id, p]));
      const responsables = await Promise.all([...new Set(propis.filter((d) => d.tipus === "responsable").map((d) => d.referencia_id))].map(async (uid) => {
        const u = await this.repos.usuaris.perId(uid);
        const canal = (c: "correu" | "whatsapp") => {
          const x = propis.find((d) => d.tipus === "responsable" && d.referencia_id === uid && d.canal === c);
          return x ? { estat: x.estat, motiu: x.motiu, error_text: x.error_text } : null;
        };
        return { nom: u?.nom_visible ?? "", correu: canal("correu"), whatsapp: canal("whatsapp") };
      }));
      return {
        casal_id: casalId, casal: casals.get(casalId)?.nom ?? "",
        responsables,
        persones: {
          total: persones.length,
          contactades: persones.filter((d) => CONTACTATS.includes(d.estat)).length,
          llegides: persones.filter((d) => d.estat === "llegit").length,
          pendents: persones.filter((d) => d.estat === "pendent").length,
          no_contactades: persones.filter((d) => d.estat === "no_enviable" || d.estat === "fallit").map((d) => {
            const p = contactes.get(d.referencia_id);
            const t = p ? telefonPersona(p) : null;
            return {
              nom: p ? [p.nom, p.cognoms].filter(Boolean).join(" ") : "(ja no és a la llista)",
              telefon: p ? (p.telefon_mobil ?? p.telefon_opcional ?? p.tutor_telefon ?? p.telefon_fix ?? null) : null,
              tipus_telefon: t?.tipus ?? null, motiu: d.motiu, error_text: d.error_text,
            };
          }).sort((a, b) => a.nom.localeCompare(b.nom, "ca")),
        },
      };
    }));
    return {
      comunicat: { id: comunicat.id, assumpte: comunicat.assumpte, text: comunicat.text, creat_el: comunicat.creat_el, canals: JSON.parse(comunicat.canals) as object },
      casals: casalsResultat,
    };
  }
}
