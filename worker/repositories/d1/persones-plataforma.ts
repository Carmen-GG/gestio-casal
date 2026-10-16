import type { DadesPersona } from "../../../shared/domain/persones-plataforma";
import type { ContactePersona, ParticipacioPersona, PersonaPlataforma, RepositoriPersonesPlataforma } from "../tipus";
import { jsonObjecte, marcadors } from "./util";

type Fila = Omit<PersonaPlataforma, "dades" | "origens"> & { dades: string; origens: string };

const mapa = (f: Fila): PersonaPlataforma => {
  let origens: string[] = [];
  try { origens = JSON.parse(f.origens); } catch { /* fila antiga o malmesa: sense orígens */ }
  return { ...f, dades: jsonObjecte(f.dades) as DadesPersona, origens };
};

/** Paràmetres per sentència: D1 n'admet 100. */
const BLOC_CLAUS = 90;

/** Persones importades de la PGEc, una fila per persona i casal. */
export class D1RepositoriPersonesPlataforma implements RepositoriPersonesPlataforma {
  constructor(private readonly db: D1Database) {}

  async perClaus(casalId: string, claus: string[]) {
    const unics = [...new Set(claus)];
    const consultes = [];
    for (let i = 0; i < unics.length; i += BLOC_CLAUS) {
      const bloc = unics.slice(i, i + BLOC_CLAUS);
      consultes.push(this.db.prepare(`SELECT * FROM persones_plataforma WHERE casal_id = ? AND clau IN (${marcadors(bloc.length)})`).bind(casalId, ...bloc));
    }
    if (consultes.length === 0) return [];
    const resultats = await this.db.batch<Fila>(consultes);
    return resultats.flatMap((r) => r.results.map(mapa));
  }

  async desar(casalId: string, persones: PersonaPlataforma[]) {
    if (persones.length === 0) return;
    await this.db.batch(persones.map((p) => this.db.prepare(
      `INSERT INTO persones_plataforma (id, casal_id, clau, document_norm, nom, cognom1, cognom2, clau_ordenacio, data_naixement,
         dades, origens, text_basic, text_contacte, creat_el, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET clau = excluded.clau, document_norm = excluded.document_norm, nom = excluded.nom,
         cognom1 = excluded.cognom1, cognom2 = excluded.cognom2, clau_ordenacio = excluded.clau_ordenacio,
         data_naixement = excluded.data_naixement, dades = excluded.dades, origens = excluded.origens,
         text_basic = excluded.text_basic, text_contacte = excluded.text_contacte, actualitzat_el = excluded.actualitzat_el`,
    ).bind(p.id, casalId, p.clau, p.document_norm, p.nom, p.cognom1, p.cognom2, p.clau_ordenacio, p.data_naixement,
      JSON.stringify(p.dades), JSON.stringify(p.origens), p.text_basic, p.text_contacte, p.creat_el, p.actualitzat_el)));
  }

  async cercar(casalId: string, f: { paraules: string[]; data_naixement: string | null; contacte: boolean; limit: number }) {
    // Les paraules ja estan normalitzades (només [a-z0-9]): no poden contenir comodins de LIKE.
    const text = f.contacte ? "(text_basic || text_contacte)" : "text_basic";
    const condicions = ["casal_id = ?", ...f.paraules.map(() => `${text} LIKE ?`)];
    const valors: unknown[] = [casalId, ...f.paraules.map((p) => `%${p}%`)];
    if (f.data_naixement) {
      condicions.push("data_naixement = ?");
      valors.push(f.data_naixement);
    }
    const where = condicions.join(" AND ");
    const [files, total] = await this.db.batch([
      this.db.prepare(`SELECT * FROM persones_plataforma WHERE ${where} ORDER BY clau_ordenacio, id LIMIT ?`).bind(...valors, f.limit),
      this.db.prepare(`SELECT count(*) AS n FROM persones_plataforma WHERE ${where}`).bind(...valors),
    ]);
    return { persones: (files!.results as Fila[]).map(mapa), total: Number((total!.results[0] as { n: number }).n) };
  }

  async perId(casalId: string, id: string) {
    const f = await this.db.prepare("SELECT * FROM persones_plataforma WHERE casal_id = ? AND id = ?").bind(casalId, id).first<Fila>();
    return f ? mapa(f) : null;
  }

  async contactes(casalId: string) {
    const { results } = await this.db.prepare(
      `SELECT id, nom, trim(coalesce(cognom1, '') || ' ' || coalesce(cognom2, '')) AS cognoms,
         json_extract(dades, '$.telefon_mobil') AS telefon_mobil, json_extract(dades, '$.telefon_opcional') AS telefon_opcional,
         json_extract(dades, '$.telefon_fix') AS telefon_fix, json_extract(dades, '$.tutor_telefon') AS tutor_telefon,
         coalesce(json_extract(dades, '$.email'), json_extract(dades, '$.tutor_email')) AS email
       FROM persones_plataforma WHERE casal_id = ? ORDER BY clau_ordenacio`,
    ).bind(casalId).all<ContactePersona>();
    return results;
  }

  async resum(casalId: string) {
    const f = await this.db.prepare("SELECT count(*) AS total, max(actualitzat_el) AS darrera FROM persones_plataforma WHERE casal_id = ?")
      .bind(casalId).first<{ total: number; darrera: string | null }>();
    return { total: Number(f?.total ?? 0), darrera_importacio: f?.darrera ?? null };
  }

  async participacions(casalId: string, documentNorm: string | null, clauOrdenacio: string, dataNaixement: string | null) {
    // Mateix criteri de persona que l'adjudicació: el document; si no n'hi ha, nom, cognoms i data de naixement.
    const { results } = await this.db.prepare(
      `SELECT c.id AS cicle_id, c.nom AS cicle, c.data_inici AS cicle_data_inici, s.numero AS sollicitud_numero, s.estat AS sollicitud_estat,
         a.id AS activitat_id, a.nom AS activitat, pr.ordre AS preferencia, pl.estat AS placa_estat, pl.posicio_espera
       FROM participants p
       JOIN sollicituds s ON s.participant_id = p.id
       JOIN cicles c ON c.id = s.cicle_id
       JOIN preferencies pr ON pr.sollicitud_id = s.id
       JOIN activitats a ON a.id = pr.activitat_id
       LEFT JOIN places pl ON pl.sollicitud_id = s.id AND pl.activitat_id = a.id
       WHERE p.casal_id = ? AND (
         (? IS NOT NULL AND p.document_identitat IS NOT NULL
           AND upper(replace(replace(replace(p.document_identitat, ' ', ''), '-', ''), '.', '')) = ?
           AND (p.data_naixement IS NULL OR ? IS NULL OR p.data_naixement = ?))
         OR (? IS NOT NULL AND p.clau_ordenacio = ? AND p.data_naixement = ?))
       ORDER BY c.data_inici DESC, c.id, s.numero, pr.ordre`,
    ).bind(casalId, documentNorm, documentNorm, dataNaixement, dataNaixement, dataNaixement, clauOrdenacio, dataNaixement).all<ParticipacioPersona>();
    return results;
  }
}
