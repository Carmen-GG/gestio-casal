import type { DadesIndicadors, RepositoriIndicadors } from "../tipus";

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
           (SELECT COUNT(*) FROM places p WHERE p.activitat_id = a.id AND p.estat = 'llista_espera') AS espera
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
}
