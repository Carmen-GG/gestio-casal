import { CAMPS_PERSONALS } from "../../../shared/domain/formulari";
import type {
  CanvisParticipant, DetallSollicitud, EstatSollicitud, FilaSollicitud, FiltreSollicituds,
  GrupActivitat, NovaActivitat, Participant, PreferenciaDetall, RepositoriGestioSollicituds,
} from "../tipus";
import { assignacionsUpdate, comOperacio, marcadors } from "./util";

const COLUMNES_PARTICIPANT = [...CAMPS_PERSONALS, "codi_participant_intern"] as const;

/** Columnes comunes de les files de sol·licitud (amb el participant i l'estat d'adjudicació). */
const SELECT_FILA = `
  SELECT s.id, s.numero, s.rebuda_el, s.estat, s.origen, s.versio, s.cicle_id,
    (SELECT COUNT(*) FROM preferencies pr WHERE pr.sollicitud_id = s.id) AS nombre_preferencies,
    CASE
      WHEN ex.id IS NULL THEN 'pendent'
      WHEN EXISTS (SELECT 1 FROM resultats_adjudicacio r WHERE r.execucio_id = ex.id AND r.sollicitud_id = s.id AND r.resultat = 'admesa') THEN 'admesa'
      WHEN EXISTS (SELECT 1 FROM resultats_adjudicacio r WHERE r.execucio_id = ex.id AND r.sollicitud_id = s.id AND r.resultat = 'llista_espera') THEN 'llista_espera'
      ELSE 'sense_placa'
    END AS estat_adjudicacio,
    p.id AS p_id, p.versio AS p_versio, p.clau_ordenacio AS p_clau_ordenacio, ${COLUMNES_PARTICIPANT.map((c) => `p.${c} AS p_${c}`).join(", ")}
  FROM sollicituds s
  JOIN participants p ON p.id = s.participant_id
  LEFT JOIN execucions_adjudicacio ex ON ex.cicle_id = s.cicle_id AND ex.estat = 'confirmada'`;

type FilaBd = Omit<FilaSollicitud, "participant"> & { cicle_id: string; p_id: string; p_versio: number } & Record<string, unknown>;

function mapaFila(f: FilaBd): FilaSollicitud {
  const participant = { id: f.p_id, versio: f.p_versio } as Participant;
  for (const c of COLUMNES_PARTICIPANT) (participant as Record<string, unknown>)[c] = f[`p_${c}`] ?? null;
  return {
    id: f.id, numero: f.numero, rebuda_el: f.rebuda_el, estat: f.estat, origen: f.origen, versio: f.versio,
    nombre_preferencies: f.nombre_preferencies, estat_adjudicacio: f.estat_adjudicacio, participant,
  };
}

/** Condicions WHERE comunes a partir del filtre. Els textos ja arriben normalitzats. */
function condicions(filtre: FiltreSollicituds) {
  const sql: string[] = [];
  const params: unknown[] = [];
  if (filtre.numero !== undefined) {
    sql.push("s.numero = ?");
    params.push(filtre.numero);
  }
  for (const paraula of filtre.paraules ?? []) {
    sql.push("p.clau_ordenacio LIKE ?");
    params.push(`%${paraula}%`);
  }
  if (filtre.activitatId) {
    sql.push("EXISTS (SELECT 1 FROM preferencies pf WHERE pf.sollicitud_id = s.id AND pf.activitat_id = ?)");
    params.push(filtre.activitatId);
  }
  if (filtre.estat) {
    sql.push("s.estat = ?");
    params.push(filtre.estat);
  }
  return { sql: sql.length ? ` AND ${sql.join(" AND ")}` : "", params };
}

const ORDRES: Record<NonNullable<FiltreSollicituds["ordre"]>, string> = {
  // L'ordre d'inscripció depèn només de dades immutables (data de recepció i número).
  inscripcio: "s.rebuda_el %DIR%, s.numero %DIR%",
  alfabetic: "p.clau_ordenacio %DIR%, s.numero",
  preferencies: "nombre_preferencies %DIR%, s.numero",
  estat: "s.estat %DIR%, s.numero",
};

export class D1RepositoriGestioSollicituds implements RepositoriGestioSollicituds {
  constructor(private readonly db: D1Database) {}

  async llistar(casalId: string, cicleId: string, filtre: FiltreSollicituds) {
    const { sql, params } = condicions(filtre);
    const where = `WHERE s.casal_id = ? AND s.cicle_id = ?${sql}`;
    const mida = Math.min(Math.max(filtre.mida ?? 50, 1), 200);
    const pagina = Math.max(filtre.pagina ?? 1, 1);
    const ordre = ORDRES[filtre.ordre ?? "inscripcio"].replaceAll("%DIR%", filtre.descendent ? "DESC" : "ASC");
    const [files, total] = await this.db.batch([
      this.db.prepare(`${SELECT_FILA} ${where} ORDER BY ${ordre} LIMIT ? OFFSET ?`)
        .bind(casalId, cicleId, ...params, mida, (pagina - 1) * mida),
      this.db.prepare(`SELECT COUNT(*) AS n FROM sollicituds s JOIN participants p ON p.id = s.participant_id ${where}`)
        .bind(casalId, cicleId, ...params),
    ]);
    return {
      files: (files!.results as FilaBd[]).map(mapaFila),
      total: (total!.results[0] as { n: number }).n,
    };
  }

  async perActivitat(casalId: string, cicleId: string, filtre: FiltreSollicituds): Promise<GrupActivitat[]> {
    const { sql, params } = condicions({ ...filtre, activitatId: undefined });
    const [activitats, files] = await this.db.batch([
      this.db.prepare(`SELECT id, nom, capacitat FROM activitats WHERE casal_id = ? AND cicle_id = ? AND estat <> 'arxivada'
                       ORDER BY nom COLLATE NOCASE`).bind(casalId, cicleId),
      this.db.prepare(`SELECT f.*, pa.activitat_id, pa.ordre FROM (${SELECT_FILA}
                         WHERE s.casal_id = ? AND s.cicle_id = ?${sql}) f
                       JOIN preferencies pa ON pa.sollicitud_id = f.id
                       ORDER BY f.p_clau_ordenacio, f.numero`)
        .bind(casalId, cicleId, ...params),
    ]);
    const grups = new Map<string, GrupActivitat>();
    for (const a of activitats!.results as { id: string; nom: string; capacitat: number }[]) {
      if (filtre.activitatId && a.id !== filtre.activitatId) continue;
      grups.set(a.id, { activitat_id: a.id, activitat: a.nom, capacitat: a.capacitat, files: [] });
    }
    for (const f of files!.results as (FilaBd & { activitat_id: string; ordre: number })[]) {
      grups.get(f.activitat_id)?.files.push({ ...mapaFila(f), ordre: f.ordre });
    }
    return [...grups.values()];
  }

  private async preferencies(ids: string[]): Promise<Map<string, PreferenciaDetall[]>> {
    const mapa = new Map<string, PreferenciaDetall[]>();
    // Consultes per blocs per respectar el límit de paràmetres de D1.
    for (let i = 0; i < ids.length; i += 90) {
      const bloc = ids.slice(i, i + 90);
      const { results } = await this.db
        .prepare(`SELECT p.sollicitud_id, p.activitat_id, a.nom AS activitat, a.estat AS estat_activitat, p.ordre
                  FROM preferencies p JOIN activitats a ON a.id = p.activitat_id
                  WHERE p.sollicitud_id IN (${marcadors(bloc.length)}) ORDER BY p.ordre`)
        .bind(...bloc)
        .all<PreferenciaDetall & { sollicitud_id: string }>();
      for (const { sollicitud_id, ...p } of results) mapa.set(sollicitud_id, [...(mapa.get(sollicitud_id) ?? []), p]);
    }
    return mapa;
  }

  async detall(casalId: string, id: string): Promise<DetallSollicitud | null> {
    const f = await this.db
      .prepare(`SELECT * FROM (${SELECT_FILA} WHERE s.casal_id = ? AND s.id = ?) f
                JOIN (SELECT id AS sid, codi_confirmacio, privacitat_acceptada_el, importacio_id FROM sollicituds) x ON x.sid = f.id`)
      .bind(casalId, id)
      .first<FilaBd & { codi_confirmacio: string; privacitat_acceptada_el: string | null; importacio_id: string | null }>();
    if (!f) return null;
    return {
      ...mapaFila(f), cicle_id: f.cicle_id, codi_confirmacio: f.codi_confirmacio,
      privacitat_acceptada_el: f.privacitat_acceptada_el, importacio_id: f.importacio_id,
      preferencies: (await this.preferencies([id])).get(id) ?? [],
    };
  }

  async totes(casalId: string, cicleId: string) {
    const { results } = await this.db
      .prepare(`${SELECT_FILA} WHERE s.casal_id = ? AND s.cicle_id = ? ORDER BY s.rebuda_el, s.numero`)
      .bind(casalId, cicleId)
      .all<FilaBd>();
    const files = results.map(mapaFila);
    const prefs = await this.preferencies(files.map((f) => f.id));
    return files.map((f) => ({ ...f, preferencies: prefs.get(f.id) ?? [] }));
  }

  async participantPerCodiIntern(casalId: string, codi: string) {
    const f = await this.db
      .prepare(`SELECT id, versio, ${COLUMNES_PARTICIPANT.join(", ")} FROM participants WHERE casal_id = ? AND codi_participant_intern = ?`)
      .bind(casalId, codi)
      .first<Participant>();
    return f ?? null;
  }

  async revisionsDuplicats(casalId: string, cicleId: string) {
    const { results } = await this.db
      .prepare(`SELECT sollicitud_a AS a, sollicitud_b AS b, decisio, motiu, revisat_el FROM revisions_duplicats
                WHERE casal_id = ? AND cicle_id = ?`)
      .bind(casalId, cicleId)
      .all<{ a: string; b: string; decisio: "no_duplicat" | "duplicat"; motiu: string | null; revisat_el: string }>();
    return results;
  }

  async maxNumero(cicleId: string) {
    const f = await this.db.prepare("SELECT COALESCE(MAX(numero), 0) AS n FROM sollicituds WHERE cicle_id = ?").bind(cicleId).first<{ n: number }>();
    return f!.n;
  }

  operacioActualitzarParticipant(casalId: string, id: string, versioActual: number, canvis: CanvisParticipant, ara: string, operacio: string) {
    const { sql, valors } = assignacionsUpdate(canvis, [...COLUMNES_PARTICIPANT, "clau_ordenacio"]);
    return comOperacio(
      this.db
        .prepare(`UPDATE participants SET ${sql}, actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
                  WHERE id = ? AND casal_id = ? AND versio = ?`)
        .bind(...valors, ara, operacio, id, casalId, versioActual),
    );
  }

  operacioActualitzarSollicitud(casalId: string, id: string, versioActual: number, canvis: { estat?: EstatSollicitud }, ara: string, operacio: string) {
    return comOperacio(
      this.db
        .prepare(`UPDATE sollicituds SET estat = COALESCE(?, estat), actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
                  WHERE id = ? AND casal_id = ? AND versio = ?`)
        .bind(canvis.estat ?? null, ara, operacio, id, casalId, versioActual),
    );
  }

  operacionsSubstituirPreferencies(sollicitudId: string, cicleId: string, casalId: string, preferencies: { activitat_id: string; ordre: number }[], operacio: string) {
    const condicio = "EXISTS (SELECT 1 FROM sollicituds WHERE id = ? AND casal_id = ? AND darrera_operacio = ?)";
    return [
      comOperacio(this.db.prepare(`DELETE FROM preferencies WHERE sollicitud_id = ? AND ${condicio}`)
        .bind(sollicitudId, sollicitudId, casalId, operacio)),
      comOperacio(this.db
        .prepare(`INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre)
                  SELECT ?, ?, json_extract(value, '$.activitat_id'), json_extract(value, '$.ordre') FROM json_each(?)
                  WHERE ${condicio}`)
        .bind(sollicitudId, cicleId, JSON.stringify(preferencies), sollicitudId, casalId, operacio)),
    ];
  }

  operacioRevisioDuplicat(d: { id: string; casal_id: string; cicle_id: string; a: string; b: string; decisio: "no_duplicat" | "duplicat"; motiu: string | null; usuari_id: string }, ara: string) {
    // Una revisió nova substitueix l'anterior de la mateixa parella (la traça queda a l'auditoria).
    return comOperacio(
      this.db
        .prepare(`INSERT INTO revisions_duplicats (id, casal_id, cicle_id, sollicitud_a, sollicitud_b, decisio, motiu, revisat_per, revisat_el)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (sollicitud_a, sollicitud_b) DO UPDATE SET decisio = excluded.decisio, motiu = excluded.motiu,
                    revisat_per = excluded.revisat_per, revisat_el = excluded.revisat_el`)
        .bind(d.id, d.casal_id, d.cicle_id, d.a, d.b, d.decisio, d.motiu, d.usuari_id, ara),
    );
  }

  private operacioImportacio(d: { importacio_id: string; casal_id: string; cicle_id: string; clau: string; nom_fitxer: string | null; usuari_id: string; resum: Record<string, unknown> }, tipus: "sollicituds" | "activitats", ara: string) {
    return comOperacio(
      this.db
        .prepare(`INSERT INTO importacions (id, casal_id, cicle_id, tipus, clau, nom_fitxer, resum, creat_per, creat_el)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(d.importacio_id, d.casal_id, d.cicle_id, tipus, d.clau, d.nom_fitxer, JSON.stringify(d.resum), d.usuari_id, ara),
    );
  }

  /**
   * Importació massiva en poques sentències: les files viatgen com un sol paràmetre
   * JSON i SQLite les desplega amb json_each. Tot dins del mateix lot atòmic.
   */
  operacionsImportarSollicituds(d: Parameters<RepositoriGestioSollicituds["operacionsImportarSollicituds"]>[0], ara: string) {
    const nous = d.files.filter((f) => !f.participant_existent).map((f) => ({
      id: f.participant_id, ...f.dades, codi_participant_intern: f.codi_participant_intern, clau_ordenacio: f.clau_ordenacio,
    }));
    const sollicituds = d.files.map((f) => ({
      id: f.sollicitud_id, participant_id: f.participant_id, numero: f.numero, rebuda_el: f.rebuda_el,
      codi_confirmacio: f.codi_confirmacio, clau_idempotencia: f.clau_idempotencia,
    }));
    const preferencies = d.files.flatMap((f) => f.preferencies.map((p) => ({ sollicitud_id: f.sollicitud_id, ...p })));
    const camp = (c: string) => `json_extract(value, '$.${c}')`;
    const columnesP = [...COLUMNES_PARTICIPANT, "clau_ordenacio"];
    return [
      this.operacioImportacio(d, "sollicituds", ara),
      comOperacio(this.db
        .prepare(`INSERT INTO participants (id, casal_id, ${columnesP.join(", ")}, creat_el, actualitzat_el)
                  SELECT ${camp("id")}, ?, ${columnesP.map(camp).join(", ")}, ?, ? FROM json_each(?)`)
        .bind(d.casal_id, ara, ara, JSON.stringify(nous))),
      comOperacio(this.db
        .prepare(`INSERT INTO sollicituds (id, casal_id, cicle_id, participant_id, numero, rebuda_el, estat, origen,
                    clau_idempotencia, codi_confirmacio, actualitzat_el, importacio_id)
                  SELECT ${camp("id")}, ?, ?, ${camp("participant_id")}, ${camp("numero")}, ${camp("rebuda_el")}, 'rebuda', 'importacio',
                    ${camp("clau_idempotencia")}, ${camp("codi_confirmacio")}, ?, ? FROM json_each(?)`)
        .bind(d.casal_id, d.cicle_id, ara, d.importacio_id, JSON.stringify(sollicituds))),
      comOperacio(this.db
        .prepare(`INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre)
                  SELECT ${camp("sollicitud_id")}, ?, ${camp("activitat_id")}, ${camp("ordre")} FROM json_each(?)`)
        .bind(d.cicle_id, JSON.stringify(preferencies))),
      comOperacio(this.db
        .prepare(`INSERT INTO historial_canvis (casal_id, entitat, entitat_id, accio, canvis, usuari_id, motiu, creat_el)
                  SELECT ?, 'sollicitud', value, 'importacio', ?, ?, NULL, ? FROM json_each(?)`)
        .bind(d.casal_id, JSON.stringify({ importacio_id: d.importacio_id }), d.usuari_id, ara,
          JSON.stringify(d.files.map((f) => f.sollicitud_id)))),
    ];
  }

  operacionsImportarActivitats(d: Parameters<RepositoriGestioSollicituds["operacionsImportarActivitats"]>[0], ara: string) {
    const files = d.activitats.map((a: NovaActivitat & { id: string }) => ({
      id: a.id, nom: a.nom, descripcio: a.descripcio ?? null, categoria: a.categoria ?? null,
      dies_setmana: JSON.stringify(a.dies_setmana ?? []), hora_inici: a.hora_inici ?? null, hora_fi: a.hora_fi ?? null,
      horari_text: a.horari_text ?? null, data_inici: a.data_inici ?? null, data_fi: a.data_fi ?? null, espai: a.espai ?? null,
      capacitat: a.capacitat, nombre_sessions: a.nombre_sessions ?? null, codi_extern: a.codi_extern ?? null,
    }));
    const columnes = ["id", "nom", "descripcio", "categoria", "dies_setmana", "hora_inici", "hora_fi", "horari_text",
      "data_inici", "data_fi", "espai", "capacitat", "nombre_sessions", "codi_extern"];
    return [
      this.operacioImportacio(d, "activitats", ara),
      comOperacio(this.db
        .prepare(`INSERT INTO activitats (casal_id, cicle_id, ${columnes.join(", ")}, estat, importacio_id, creat_el, actualitzat_el)
                  SELECT ?, ?, ${columnes.map((c) => `json_extract(value, '$.${c}')`).join(", ")}, 'esborrany', ?, ?, ? FROM json_each(?)`)
        .bind(d.casal_id, d.cicle_id, d.importacio_id, ara, ara, JSON.stringify(files))),
      comOperacio(this.db
        .prepare(`INSERT INTO historial_canvis (casal_id, entitat, entitat_id, accio, canvis, usuari_id, motiu, creat_el)
                  SELECT ?, 'activitat', value, 'importacio', ?, ?, NULL, ? FROM json_each(?)`)
        .bind(d.casal_id, JSON.stringify({ importacio_id: d.importacio_id }), d.usuari_id, ara,
          JSON.stringify(files.map((f) => f.id)))),
    ];
  }
}
