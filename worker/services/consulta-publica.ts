import { acceptaSollicituds, type EstatCicle } from "../../shared/domain/cicles";
import type {
  ActivitatPublica, CasalPublic, CiclePublic, RespostaActivitatsPubliques, RespostaCiclesPubliques,
} from "../../shared/api/public";
import { CAMPS_PERSONALS, configuracioFormulariEfectiva } from "../../shared/domain/formulari";
import { errors } from "../http/errors";
import type { Activitat, Casal, Cicle, Repositoris } from "../repositories/tipus";
import type { Rellotge } from "../lib/rellotge";

/** Estats en què un cicle és visible a l'àrea pública. */
export const ESTATS_CICLE_PUBLICS: EstatCicle[] = ["inscripcions_obertes", "inscripcions_tancades",
  "adjudicacio_en_proces", "adjudicat", "publicat"];

/** Proteccions de format abans de consultar la base de dades. */
const PATRO_CODI_CASAL = /^[A-Z0-9-]{2,40}$/;
const PATRO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const casalPublic = (c: Casal): CasalPublic => ({ codi: c.codi, nom: c.nom, municipi: c.municipi });

/**
 * Lectures per a l'àrea pública. Construeix les respostes camp a camp (llista
 * blanca) perquè cap camp intern nou s'exposi per error.
 */
export class ServeiConsultaPublica {
  constructor(private readonly repos: Repositoris, private readonly rellotge: Rellotge) {}

  private ciclePublic(c: Cicle): CiclePublic {
    return {
      id: c.id, nom: c.nom, any: c.any, data_inici: c.data_inici, data_fi: c.data_fi,
      obertura_inscripcions: c.obertura_inscripcions, tancament_inscripcions: c.tancament_inscripcions,
      data_resolucio_prevista: c.data_resolucio_prevista, estat: c.estat,
      accepta_sollicituds: acceptaSollicituds(c, this.rellotge.ara()),
    };
  }

  private static activitatPublica(a: Activitat): ActivitatPublica {
    return {
      id: a.id, nom: a.nom, descripcio: a.descripcio, categoria: a.categoria, dies_setmana: a.dies_setmana,
      hora_inici: a.hora_inici, hora_fi: a.hora_fi, horari_text: a.horari_text,
      data_inici: a.data_inici, data_fi: a.data_fi, espai: a.espai, destinataris: a.destinataris,
    };
  }

  async casalActiu(codi: string): Promise<Casal> {
    if (!PATRO_CODI_CASAL.test(codi)) throw errors.noTrobat("No s'ha trobat el casal.");
    const casal = await this.repos.casals.perCodi(codi);
    if (!casal || !casal.actiu) throw errors.noTrobat("No s'ha trobat el casal.");
    return casal;
  }

  async ciclesPublics(codiCasal: string): Promise<RespostaCiclesPubliques> {
    const casal = await this.casalActiu(codiCasal);
    const cicles = await this.repos.cicles.llistarPerCasal(casal.id, { estats: ESTATS_CICLE_PUBLICS });
    return { casal: casalPublic(casal), cicles: cicles.map((c) => this.ciclePublic(c)) };
  }

  /** Cicle visible a l'àrea pública; si no ho és, respon com si no existís. */
  async ciclePublicat(casal: Casal, cicleId: string): Promise<Cicle> {
    if (!PATRO_UUID.test(cicleId)) throw errors.noTrobat("No s'ha trobat el cicle.");
    const cicle = await this.repos.cicles.perId(casal.id, cicleId);
    if (!cicle || !ESTATS_CICLE_PUBLICS.includes(cicle.estat)) throw errors.noTrobat("No s'ha trobat el cicle.");
    return cicle;
  }

  async activitatsPubliques(codiCasal: string, cicleId: string): Promise<RespostaActivitatsPubliques> {
    const casal = await this.casalActiu(codiCasal);
    const cicle = await this.ciclePublicat(casal, cicleId);
    const config = configuracioFormulariEfectiva(cicle.configuracio_formulari);
    const activitats = await this.repos.activitats.llistarPerCicle(casal.id, cicle.id, { estats: ["activa"] });
    return {
      casal: casalPublic(casal),
      cicle: this.ciclePublic(cicle),
      activitats: activitats.map(ServeiConsultaPublica.activitatPublica),
      formulari: {
        camps: CAMPS_PERSONALS.filter((c) => config.camps[c].actiu).map((c) => ({ camp: c, obligatori: config.camps[c].obligatori })),
        informacio_privacitat: config.informacio_privacitat,
      },
    };
  }
}
