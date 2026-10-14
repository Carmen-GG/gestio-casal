import type { EstatAssistencia } from "../../../shared/domain/assistencia";
import type { Marca, RepositoriAssistencia, Sessio } from "../tipus";
import { comOperacio } from "./util";

const SELECT_SESSIO = `SELECT s.id, s.activitat_id, s.data, s.hora_inici, s.hora_fi, s.estat, s.motiu_cancellacio, s.versio,
  (SELECT COUNT(*) FROM registres_assistencia r WHERE r.sessio_id = s.id) AS marques
  FROM sessions_activitat s`;
const ORDRE_SESSIONS = "ORDER BY s.data, s.hora_inici";

export class D1RepositoriAssistencia implements RepositoriAssistencia {
  constructor(private readonly db: D1Database) {}

  async sessions(activitatId: string) {
    const { results } = await this.db.prepare(`${SELECT_SESSIO} WHERE s.activitat_id = ? ${ORDRE_SESSIONS}`).bind(activitatId).all<Sessio>();
    return results;
  }

  async sessionsCicle(cicleId: string) {
    const { results } = await this.db.prepare(
      `${SELECT_SESSIO} JOIN activitats a ON a.id = s.activitat_id WHERE a.cicle_id = ? ${ORDRE_SESSIONS}`,
    ).bind(cicleId).all<Sessio>();
    return results;
  }

  async sessio(casalId: string, id: string) {
    return this.db.prepare(
      `SELECT x.*, a.cicle_id FROM (${SELECT_SESSIO} WHERE s.id = ?) x JOIN activitats a ON a.id = x.activitat_id WHERE a.casal_id = ?`,
    ).bind(id, casalId).first<Sessio & { cicle_id: string }>();
  }

  operacioCrearSessions(sessions: { id: string; activitat_id: string; data: string; hora_inici: string | null; hora_fi: string | null }[], usuariId: string, ara: string) {
    // La UNIQUE (activitat_id, data, hora_inici) no detecta duplicats amb hora NULL: es comprova a mà.
    return comOperacio(this.db.prepare(
      `INSERT INTO sessions_activitat (id, activitat_id, data, hora_inici, hora_fi, estat, creat_el, actualitzat_el, creat_per)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
         json_extract(value, '$[4]'), 'prevista', ?, ?, ?
       FROM json_each(?) j
       WHERE NOT EXISTS (SELECT 1 FROM sessions_activitat x WHERE x.activitat_id = json_extract(j.value, '$[1]')
         AND x.data = json_extract(j.value, '$[2]') AND x.hora_inici IS json_extract(j.value, '$[3]'))`,
    ).bind(ara, ara, usuariId, JSON.stringify(sessions.map((s) => [s.id, s.activitat_id, s.data, s.hora_inici, s.hora_fi]))));
  }

  operacioCancellarSessio(id: string, versio: number, motiu: string, ara: string, operacio: string) {
    return comOperacio(this.db.prepare(
      `UPDATE sessions_activitat SET estat = 'cancellada', motiu_cancellacio = ?, versio = versio + 1, darrera_operacio = ?, actualitzat_el = ?
       WHERE id = ? AND versio = ? AND estat = 'prevista'
         AND NOT EXISTS (SELECT 1 FROM registres_assistencia r WHERE r.sessio_id = sessions_activitat.id)`,
    ).bind(motiu, operacio, ara, id, versio));
  }

  async marquesActivitat(activitatId: string) {
    const { results } = await this.db.prepare(
      `SELECT r.sessio_id, r.placa_id, r.estat, r.versio, r.registrat_el FROM registres_assistencia r
       JOIN sessions_activitat s ON s.id = r.sessio_id WHERE s.activitat_id = ?`,
    ).bind(activitatId).all<Marca>();
    return results;
  }

  async marquesCicle(cicleId: string) {
    const { results } = await this.db.prepare(
      `SELECT r.sessio_id, r.placa_id, r.estat, r.versio, r.registrat_el FROM registres_assistencia r
       JOIN sessions_activitat s ON s.id = r.sessio_id JOIN activitats a ON a.id = s.activitat_id WHERE a.cicle_id = ?`,
    ).bind(cicleId).all<Marca>();
    return results;
  }

  operacioNovaMarca(d: { sessio_id: string; placa_id: string; estat: EstatAssistencia; usuari_id: string; operacio: string }, ara: string) {
    // INSERT simple: si algú altre ja l'ha registrada, la clau primària fa fallar tot el lot.
    return comOperacio(this.db.prepare(
      `INSERT INTO registres_assistencia (sessio_id, placa_id, estat, registrat_per, registrat_el, versio, darrera_operacio)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).bind(d.sessio_id, d.placa_id, d.estat, d.usuari_id, ara, d.operacio));
  }

  operacioModificarMarca(d: { sessio_id: string; placa_id: string; estat: EstatAssistencia; versio: number; usuari_id: string; operacio: string }, ara: string) {
    return comOperacio(this.db.prepare(
      `UPDATE registres_assistencia SET estat = ?, registrat_per = ?, registrat_el = ?, versio = versio + 1, darrera_operacio = ?
       WHERE sessio_id = ? AND placa_id = ? AND versio = ?`,
    ).bind(d.estat, d.usuari_id, ara, d.operacio, d.sessio_id, d.placa_id, d.versio));
  }

  operacioHistorialMarca(d: { casal_id: string; sessio_id: string; placa_id: string; data: string; abans: EstatAssistencia; despres: EstatAssistencia; motiu: string; usuari_id: string; operacio: string }, ara: string) {
    // Si la modificació no s'ha aplicat, «accio» queda NULL i la restricció NOT NULL desfà tot el lot.
    return comOperacio(this.db.prepare(
      `INSERT INTO historial_canvis (casal_id, entitat, entitat_id, accio, canvis, usuari_id, motiu, creat_el)
       SELECT ?, 'placa', ?, CASE WHEN EXISTS (SELECT 1 FROM registres_assistencia WHERE sessio_id = ? AND placa_id = ? AND darrera_operacio = ?)
         THEN 'modificacio' END, ?, ?, ?, ?`,
    ).bind(d.casal_id, d.placa_id, d.sessio_id, d.placa_id, d.operacio,
      JSON.stringify({ assistencia: { sessio_id: d.sessio_id, data: d.data, abans: d.abans, despres: d.despres } }), d.usuari_id, d.motiu, ara));
  }

  operacioSessioRealitzada(sessioId: string, ara: string) {
    return comOperacio(this.db.prepare(
      `UPDATE sessions_activitat SET estat = 'realitzada', versio = versio + 1, actualitzat_el = ? WHERE id = ? AND estat = 'prevista'`,
    ).bind(ara, sessioId));
  }
}
