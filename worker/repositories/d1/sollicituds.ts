import { CAMPS_PERSONALS } from "../../../shared/domain/formulari";
import type { AutoritzacioTutorDesada, NovaSollicitudPublica, RepositoriSollicituds, ResultatRegistre, SollicitudRegistrada } from "../tipus";

/** Condició: el cicle accepta sol·licituds en l'instant de recepció (comparació de dates ISO en UTC). */
const CICLE_OBERT = `EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'inscripcions_obertes'
  AND obertura_inscripcions <= ? AND tancament_inscripcions >= ?)`;

/** Missatge de l'error provocat expressament quan una activitat no està disponible. */
const ERROR_ACTIVITAT = /NOT NULL constraint failed: preferencies\.ordre/i;

export class D1RepositoriSollicituds implements RepositoriSollicituds {
  constructor(private readonly db: D1Database) {}

  async perClauIdempotencia(casalId: string, cicleId: string, clau: string): Promise<SollicitudRegistrada | null> {
    const s = await this.db
      .prepare(`SELECT id, numero, codi_confirmacio, rebuda_el, resum_peticio FROM sollicituds
                WHERE casal_id = ? AND cicle_id = ? AND clau_idempotencia = ?`)
      .bind(casalId, cicleId, clau)
      .first<Omit<SollicitudRegistrada, "preferencies">>();
    return s ? { ...s, preferencies: await this.preferencies(s.id) } : null;
  }

  private async preferencies(sollicitudId: string) {
    const { results } = await this.db
      .prepare(`SELECT p.ordre, a.nom AS activitat FROM preferencies p JOIN activitats a ON a.id = p.activitat_id
                WHERE p.sollicitud_id = ? ORDER BY p.ordre`)
      .bind(sollicitudId)
      .all<{ ordre: number; activitat: string }>();
    return results;
  }

  async registrarPublica(n: NovaSollicitudPublica): Promise<ResultatRegistre> {
    const condicioCicle = [n.cicle_id, n.casal_id, n.rebuda_el, n.rebuda_el];
    const columnes = CAMPS_PERSONALS.join(", ");

    const participant = this.db
      .prepare(
        `INSERT INTO participants (id, casal_id, ${columnes}, clau_ordenacio, creat_el, actualitzat_el)
         SELECT ?, ?, ${CAMPS_PERSONALS.map(() => "?").join(", ")}, ?, ?, ? WHERE ${CICLE_OBERT}`,
      )
      .bind(n.participant_id, n.casal_id, ...CAMPS_PERSONALS.map((c) => n.dades[c]), n.clau_ordenacio,
        n.rebuda_el, n.rebuda_el, ...condicioCicle);

    // El número correlatiu es calcula dins de la transacció: D1 serialitza les escriptures.
    const sollicitud = this.db
      .prepare(
        `INSERT INTO sollicituds (id, casal_id, cicle_id, participant_id, numero, rebuda_el, estat, origen,
           clau_idempotencia, codi_confirmacio, actualitzat_el, resum_peticio, privacitat_acceptada_el, privacitat_resum)
         SELECT ?, ?, ?, ?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM sollicituds WHERE cicle_id = ?), ?, 'rebuda',
           'formulari_public', ?, ?, ?, ?, ?, ?
         WHERE ${CICLE_OBERT}`,
      )
      .bind(n.sollicitud_id, n.casal_id, n.cicle_id, n.participant_id, n.cicle_id, n.rebuda_el,
        n.clau_idempotencia, n.codi_confirmacio, n.rebuda_el, n.resum_peticio, n.rebuda_el, n.privacitat_resum,
        ...condicioCicle);

    // Si l'activitat no és activa o no és d'aquest cicle, l'ordre queda NULL i la
    // restricció NOT NULL fa fallar tota la transacció: no es desa res a mitges.
    const preferencies = n.preferencies.map((p) =>
      this.db
        .prepare(
          `INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre)
           SELECT ?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM activitats WHERE id = ? AND cicle_id = ? AND casal_id = ?
             AND estat = 'activa') THEN ? END
           WHERE EXISTS (SELECT 1 FROM sollicituds WHERE id = ?)`,
        )
        .bind(n.sollicitud_id, n.cicle_id, p.activitat_id, p.activitat_id, n.cicle_id, n.casal_id, p.ordre, n.sollicitud_id),
    );

    const tutor = n.tutor
      ? [this.db
        .prepare(
          `INSERT INTO autoritzacions_tutor (sollicitud_id, casal_id, nom, cognoms, document_identitat, autoritza, signatura, creat_el)
           SELECT ?, ?, ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM sollicituds WHERE id = ?)`,
        )
        .bind(n.sollicitud_id, n.casal_id, n.tutor.nom, n.tutor.cognoms, n.tutor.document_identitat, n.tutor.signatura,
          n.rebuda_el, n.sollicitud_id)]
      : [];

    // Auditoria sense dades personals: només identificadors interns i metadades.
    const auditoria = this.db
      .prepare(
        `INSERT INTO registres_auditoria (creat_el, casal_id, usuari_id, tipus_operacio, entitat, entitat_id, resultat, detalls, id_peticio)
         SELECT ?, ?, NULL, 'sollicitud.recepcio', 'sollicitud', ?, 'exit', ?, ?
         WHERE EXISTS (SELECT 1 FROM sollicituds WHERE id = ?)`,
      )
      .bind(n.rebuda_el, n.casal_id, n.sollicitud_id,
        JSON.stringify({ origen: "formulari_public", cicle_id: n.cicle_id, nombre_preferencies: n.preferencies.length, autoritzacio_tutor: !!n.tutor }),
        n.id_peticio, n.sollicitud_id);

    let resultats: D1Result[];
    try {
      resultats = await this.db.batch([participant, sollicitud, ...preferencies, ...tutor, auditoria]);
    } catch (e) {
      if (ERROR_ACTIVITAT.test((e as Error).message)) return { tipus: "activitat_no_disponible" };
      throw e;
    }
    if ((resultats[1]!.meta.changes ?? 0) === 0) return { tipus: "cicle_no_accepta" };
    const s = await this.db
      .prepare("SELECT id, numero, codi_confirmacio, rebuda_el, resum_peticio FROM sollicituds WHERE id = ?")
      .bind(n.sollicitud_id)
      .first<Omit<SollicitudRegistrada, "preferencies">>();
    return { tipus: "registrada", sollicitud: { ...s!, preferencies: await this.preferencies(n.sollicitud_id) } };
  }

  async autoritzacioTutor(casalId: string, sollicitudId: string) {
    return this.db
      .prepare(
        `SELECT nom, cognoms, document_identitat, signatura, creat_el FROM autoritzacions_tutor
         WHERE sollicitud_id = ? AND casal_id = ?`,
      )
      .bind(sollicitudId, casalId)
      .first<AutoritzacioTutorDesada>();
  }
}
