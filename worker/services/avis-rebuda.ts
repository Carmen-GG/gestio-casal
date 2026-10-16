import { analitzaTelefon, netejaParametre } from "../../shared/domain/whatsapp";
import type { Env } from "../env";
import { clientCorreu, ErrorCorreu, type ClientCorreu } from "../lib/correu";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { clientWhatsapp, ErrorMeta, type ClientWhatsapp } from "../lib/whatsapp-meta";
import type { AvisRebuda, Casal, Cicle, MotiuAvisRebuda, Repositoris } from "../repositories/tipus";

type Secrets = Pick<Env, "WHATSAPP_TOKEN" | "RESEND_API_KEY" | "CORREU_REMITENT">;

export interface DadesAvisRebuda {
  sollicitud_id: string;
  codi_confirmacio: string;
  rebuda_el: string;
  nom: string;
  email: string | null;
  telefon: string | null;
  preferencies: { ordre: number; activitat: string }[];
}

/** Data i hora llegibles a la zona del casal (dd/mm/aaaa, hh:mm). */
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("ca-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Text del correu de rebuda (el que rebrà la persona). */
export function textCorreuRebuda(casal: string, cicle: Pick<Cicle, "nom" | "data_resolucio_prevista">, d: DadesAvisRebuda) {
  return {
    assumpte: `Hem rebut la vostra sol·licitud · ${casal}`,
    text: [
      `Hola, ${d.nom.trim()}:`,
      "",
      `El ${casal} ha rebut la vostra sol·licitud d'inscripció al cicle «${cicle.nom}».`,
      "",
      `Codi de confirmació: ${d.codi_confirmacio}`,
      `Data de recepció: ${dataHora(d.rebuda_el)}`,
      "",
      "Activitats demanades, per ordre de preferència:",
      ...d.preferencies.map((p) => `${p.ordre}. ${p.activitat}`),
      "",
      "Aquest missatge només confirma que hem rebut la sol·licitud: encara no és l'adjudicació de places."
        + (cicle.data_resolucio_prevista ? ` Està previst fer-la pública el ${data(cicle.data_resolucio_prevista)}.` : ""),
      "Guardeu el codi de confirmació: us el demanaran si heu de consultar la sol·licitud.",
      "",
      "Si no heu fet aquesta sol·licitud, podeu ignorar aquest missatge.",
    ].join("\n"),
  };
}

/**
 * Avís de rebuda de la sol·licitud (petició de 2026-10-16): per correu si la persona n'ha
 * donat un; si no, per WhatsApp des del número del casal. Un error en l'avís no fa fallar mai
 * la sol·licitud, que ja està desada. No es desa ni es registra cap adreça ni telèfon.
 */
export class ServeiAvisRebuda {
  private readonly correu: ClientCorreu | null;
  private readonly whatsapp: ClientWhatsapp | null;

  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge, secrets: Secrets, fetchFn?: typeof fetch) {
    this.correu = secrets.RESEND_API_KEY && secrets.CORREU_REMITENT ? clientCorreu(secrets.RESEND_API_KEY, secrets.CORREU_REMITENT, fetchFn) : null;
    this.whatsapp = secrets.WHATSAPP_TOKEN ? clientWhatsapp(secrets.WHATSAPP_TOKEN, fetchFn) : null;
  }

  async envia(casal: Casal, cicle: Cicle, d: DadesAvisRebuda): Promise<AvisRebuda> {
    const resultat = await this.intenta(casal, cicle, d);
    const avis: AvisRebuda = {
      sollicitud_id: d.sollicitud_id, casal_id: casal.id, extern_id: null, error_text: null, motiu: null,
      ...resultat, creat_el: isoAra(this.rellotge),
    };
    await this.repos.avisosRebuda.desar(avis);
    return avis;
  }

  private async intenta(casal: Casal, cicle: Cicle, d: DadesAvisRebuda): Promise<Pick<AvisRebuda, "canal" | "estat"> & Partial<AvisRebuda>> {
    const noEnviable = (canal: AvisRebuda["canal"], motiu: MotiuAvisRebuda) => ({ canal, estat: "no_enviable" as const, motiu });
    if (d.email) {
      if (!this.correu) return noEnviable("correu", "servei_no_configurat");
      try {
        const { id } = await this.correu.envia({ a: d.email, ...textCorreuRebuda(casal.nom, cicle, d) });
        return { canal: "correu", estat: "enviat", extern_id: id };
      } catch (e) {
        if (!(e instanceof ErrorCorreu)) throw e;
        return { canal: "correu", estat: "fallit", motiu: "error_servei", error_text: e.titol };
      }
    }
    const telefon = analitzaTelefon(d.telefon);
    if (telefon.tipus === "sense" || telefon.tipus === "invalid") return noEnviable("cap", "sense_contacte");
    if (telefon.tipus === "fix") return noEnviable("whatsapp", "telefon_fix");
    const config = await this.repos.whatsapp.config(casal.id);
    if (!this.whatsapp || !config?.actiu || !config.phone_number_id) return noEnviable("whatsapp", "servei_no_configurat");
    try {
      const { wamid } = await this.whatsapp.enviaPlantilla({
        phoneNumberId: config.phone_number_id, destinatari: telefon.internacional!, plantilla: "sollicitud_rebuda", idioma: config.idioma,
        parametres: [d.nom, casal.nom, cicle.nom, d.codi_confirmacio].map((v) => netejaParametre(v, 200)),
      });
      return { canal: "whatsapp", estat: "enviat", extern_id: wamid };
    } catch (e) {
      if (!(e instanceof ErrorMeta)) throw e;
      return { canal: "whatsapp", estat: "fallit", motiu: e.destinatariNoDisponible ? "sense_whatsapp" : "error_servei", error_text: e.titol };
    }
  }
}
