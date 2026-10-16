import type { DadesIndicadors, IndicadorsCasalGlobal, IndicadorsCicleGlobal, RecompteIncidencies, RepositoriIndicadors } from "../tipus";

/** Comptes per al quadre de comandament d'un cicle, calculats directament a la base de dades. */
export class D1RepositoriIndicadors implements RepositoriIndicadors {
  constructor(private readonly db: D1Database) {}

  async cicle(casalId: string, cicleId: string): Promise<DadesIndicadors> {
    const [estats, persones, activitats, execucio] = await this.db.batch([
      this.db.prepare(`SELECT estat, COUNT(*) AS n FROM sollicituds WHERE casal_id = ? AND cicle_id = ? GROUP BY estat`).bind(casalId, cicleId),
      this.db.prepare(`SELECT COUNT(DISTINCT participant_id) AS n FROM sollicituds WHERE casal_id = ? AND cicle_id = ? AND estat <> 'anullada'`)
        .bind(casalId, cicleId),
      this.db.prepare(
        `SELECT a.id, a.nom, a.estat, a.capacitat, a.minim_participants,
           (SELECT COUNT(*) FROM preferencies pr JOIN sollicituds s ON s.id = pr.sollicitud_id
             WHERE pr.activitat_id = a.id AND s.estat <> 'anullada') AS sollicituds,
           (SELECT COUNT(*) FROM preferencies pr JOIN sollicituds s ON s.id = pr.sollicitud_id
             WHERE pr.activitat_id = a.id AND s.estat <> 'anullada' AND pr.ordre = 1) AS primera_preferencia,
           (SELECT COUNT(*) FROM places p WHERE p.activitat_id = a.id AND p.estat = 'admesa') AS admeses,
           (SELECT COUNT(*) FROM places p WHERE p.activitat_id = a.id AND p.estat = 'oferta_pendent') AS ofertes,
           (SELECT COUNT(*) FROM places p WHERE p.activitat_id = a.id AND p.estat = 'llista_espera') AS espera,
           (SELECT COUNT(*) FROM baixes_voluntaries b WHERE b.activitat_id = a.id) AS baixes_voluntaries
         FROM activitats a WHERE a.casal_id = ? AND a.cicle_id = ? AND a.estat <> 'arxivada' ORDER BY a.nom`,
      ).bind(casalId, cicleId),
      this.db.prepare(
        `SELECT versio, estat, executada_el, confirmada_el FROM execucions_adjudicacio
         WHERE casal_id = ? AND cicle_id = ? AND estat IN ('proposta', 'confirmada') ORDER BY versio DESC LIMIT 1`,
      ).bind(casalId, cicleId),
    ]);
    return {
      sollicituds_per_estat: Object.fromEntries((estats!.results as { estat: string; n: number }[]).map((r) => [r.estat, r.n])),
      persones: (persones!.results[0] as { n: number } | undefined)?.n ?? 0,
      activitats: activitats!.results as DadesIndicadors["activitats"],
      darrera_execucio: (execucio!.results[0] as DadesIndicadors["darrera_execucio"]) ?? null,
    };
  }

  async global(any: number | null) {
    const [cicles, casals, anys, incidencies] = await this.db.batch([
      this.db.prepare(
        `SELECT c.casal_id, c.id AS cicle_id, c.nom AS cicle, c.any, c.estat, c.data_inici, c.data_fi,
           (SELECT COUNT(*) FROM activitats a WHERE a.cicle_id = c.id AND a.estat <> 'arxivada') AS activitats,
           (SELECT COALESCE(SUM(a.capacitat), 0) FROM activitats a WHERE a.cicle_id = c.id AND a.estat <> 'arxivada') AS places_ofertes,
           (SELECT COUNT(*) FROM sollicituds s WHERE s.cicle_id = c.id AND s.estat <> 'anullada') AS sollicituds,
           (SELECT COUNT(DISTINCT s.participant_id) FROM sollicituds s WHERE s.cicle_id = c.id AND s.estat <> 'anullada') AS persones,
           (SELECT COUNT(*) FROM places p JOIN activitats a ON a.id = p.activitat_id WHERE a.cicle_id = c.id AND p.estat = 'admesa') AS admeses,
           (SELECT COUNT(*) FROM places p JOIN activitats a ON a.id = p.activitat_id WHERE a.cicle_id = c.id AND p.estat IN ('llista_espera', 'oferta_pendent')) AS espera,
           (SELECT COUNT(*) FROM places p JOIN activitats a ON a.id = p.activitat_id WHERE a.cicle_id = c.id AND p.estat = 'renuncia') AS renuncies,
           (SELECT COUNT(*) FROM places p JOIN activitats a ON a.id = p.activitat_id WHERE a.cicle_id = c.id AND p.estat = 'baixa') AS baixes,
           (SELECT COUNT(*) FROM baixes_voluntaries b WHERE b.cicle_id = c.id) AS baixes_voluntaries,
           (SELECT COUNT(*) FROM sessions_activitat se JOIN activitats a ON a.id = se.activitat_id WHERE a.cicle_id = c.id AND se.estat = 'realitzada') AS sessions_realitzades,
           (SELECT COUNT(*) FROM registres_assistencia r JOIN sessions_activitat se ON se.id = r.sessio_id JOIN activitats a ON a.id = se.activitat_id
             WHERE a.cicle_id = c.id AND r.estat = 'present') AS presencies,
           (SELECT COUNT(*) FROM registres_assistencia r JOIN sessions_activitat se ON se.id = r.sessio_id JOIN activitats a ON a.id = se.activitat_id
             WHERE a.cicle_id = c.id AND r.estat = 'absent') AS absencies,
           (SELECT COUNT(*) FROM registres_assistencia r JOIN sessions_activitat se ON se.id = r.sessio_id JOIN activitats a ON a.id = se.activitat_id
             WHERE a.cicle_id = c.id AND r.estat = 'absencia_justificada') AS absencies_justificades,
           (SELECT COUNT(*) FROM activitats a WHERE a.cicle_id = c.id AND a.estat <> 'arxivada'
             AND (a.tallerista IS NULL OR trim(a.tallerista) = '')) AS activitats_sense_tallerista,
           (SELECT COUNT(*) FROM sessions_activitat se JOIN activitats a ON a.id = se.activitat_id
             WHERE a.cicle_id = c.id AND se.estat <> 'cancellada' AND se.tallerista_absent = 1) AS sessions_falta_tallerista
         FROM cicles c WHERE (?1 IS NULL OR c.any = ?1) ORDER BY c.casal_id, c.data_inici`,
      ).bind(any),
      // Persones diferents del casal en els cicles triats: mateix document o, si no n'hi ha, mateix nom i data de naixement.
      this.db.prepare(
        `SELECT k.id AS casal_id,
           (SELECT COUNT(DISTINCT CASE WHEN p.document_identitat IS NOT NULL AND trim(p.document_identitat) <> ''
                THEN 'D:' || upper(replace(replace(replace(p.document_identitat, ' ', ''), '-', ''), '.', ''))
                ELSE 'N:' || p.clau_ordenacio || '|' || COALESCE(p.data_naixement, '') END)
             FROM sollicituds s JOIN participants p ON p.id = s.participant_id JOIN cicles c ON c.id = s.cicle_id
             WHERE s.casal_id = k.id AND s.estat <> 'anullada' AND (?1 IS NULL OR c.any = ?1)) AS persones_diferents,
           (SELECT COUNT(*) FROM persones_plataforma pp WHERE pp.casal_id = k.id) AS persones_plataforma,
           (SELECT COUNT(DISTINCT a.usuari_id) FROM assignacions_rols a JOIN usuaris u ON u.id = a.usuari_id AND u.actiu = 1
             WHERE a.casal_id = k.id AND a.revocat_el IS NULL) AS equip,
           (SELECT COUNT(DISTINCT a.usuari_id) FROM assignacions_rols a JOIN usuaris u ON u.id = a.usuari_id AND u.actiu = 1
             WHERE a.casal_id = k.id AND a.revocat_el IS NULL AND a.rol_codi = 'responsable_casal') AS responsables
         FROM casals k`,
      ).bind(any),
      this.db.prepare("SELECT DISTINCT any FROM cicles ORDER BY any DESC"),
      this.db.prepare(
        `SELECT casal_id, categoria, estat, COUNT(*) AS n FROM incidencies
         WHERE (?1 IS NULL OR substr(data, 1, 4) = ?1) GROUP BY casal_id, categoria, estat`,
      ).bind(any === null ? null : String(any)),
    ]);
    return {
      cicles: cicles!.results as IndicadorsCicleGlobal[],
      casals: casals!.results as IndicadorsCasalGlobal[],
      anys: (anys!.results as { any: number }[]).map((f) => f.any),
      incidencies: incidencies!.results as RecompteIncidencies[],
    };
  }
}
