import type { AssignacioRol, PermisosUsuari, RepositoriSessions, RepositoriUsuaris, Usuari } from "../tipus";
import { comOperacio } from "./util";
import { nouId } from "../../lib/ids";
import { isoAra, type Rellotge } from "../../lib/rellotge";

type FilaUsuari = Omit<Usuari, "actiu"> & { actiu: number };
const mapaUsuari = (f: FilaUsuari): Usuari => ({
  id: f.id, email: f.email, nom_visible: f.nom_visible, proveidor_identitat: f.proveidor_identitat, actiu: f.actiu === 1,
});

export class D1RepositoriUsuaris implements RepositoriUsuaris {
  constructor(private readonly db: D1Database, private readonly rellotge: Rellotge) {}

  async perId(id: string) {
    const f = await this.db.prepare("SELECT * FROM usuaris WHERE id = ?").bind(id).first<FilaUsuari>();
    return f ? mapaUsuari(f) : null;
  }

  async perEmail(email: string) {
    const f = await this.db.prepare("SELECT * FROM usuaris WHERE email = ?").bind(email).first<FilaUsuari>();
    return f ? mapaUsuari(f) : null;
  }

  async crear(d: { email: string; nom_visible: string; proveidor_identitat: Usuari["proveidor_identitat"] }) {
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.db
      .prepare(
        `INSERT INTO usuaris (id, email, nom_visible, proveidor_identitat, actiu, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, d.email, d.nom_visible, d.proveidor_identitat, ara, ara)
      .run();
    return (await this.perId(id))!;
  }

  async resumContrasenya(usuariId: string) {
    const f = await this.db.prepare("SELECT contrasenya_resum FROM usuaris WHERE id = ?").bind(usuariId)
      .first<{ contrasenya_resum: string | null }>();
    return f?.contrasenya_resum ?? null;
  }

  async fixarContrasenya(usuariId: string, resum: string, ara: string) {
    await this.db.prepare("UPDATE usuaris SET contrasenya_resum = ?, contrasenya_canviada_el = ?, actualitzat_el = ? WHERE id = ?")
      .bind(resum, ara, ara, usuariId).run();
  }

  async permisos(usuariId: string): Promise<PermisosUsuari> {
    // Només assignacions vigents, d'usuaris actius i (si són de casal) de casals actius.
    const { results } = await this.db
      .prepare(
        `SELECT a.casal_id, rp.permis_codi
         FROM assignacions_rols a
         JOIN usuaris u ON u.id = a.usuari_id AND u.actiu = 1
         JOIN rols_permisos rp ON rp.rol_codi = a.rol_codi
         LEFT JOIN casals c ON c.id = a.casal_id
         WHERE a.usuari_id = ? AND a.revocat_el IS NULL AND (a.casal_id IS NULL OR c.actiu = 1)`,
      )
      .bind(usuariId)
      .all<{ casal_id: string | null; permis_codi: string }>();
    const globals = new Set<string>();
    const perCasal: Record<string, Set<string>> = {};
    for (const f of results) {
      if (f.casal_id === null) globals.add(f.permis_codi);
      else (perCasal[f.casal_id] ??= new Set()).add(f.permis_codi);
    }
    return {
      globals: [...globals].sort(),
      perCasal: Object.fromEntries(Object.entries(perCasal).map(([k, v]) => [k, [...v].sort()])),
    };
  }

  private static readonly SELECT_ASSIGNACIO = `SELECT a.id, a.usuari_id, u.email, u.nom_visible, a.rol_codi, a.casal_id, a.atorgat_el
    FROM assignacions_rols a JOIN usuaris u ON u.id = a.usuari_id`;

  async assignacionsCasal(casalId: string) {
    const { results } = await this.db
      .prepare(`${D1RepositoriUsuaris.SELECT_ASSIGNACIO} WHERE a.casal_id = ? AND a.revocat_el IS NULL ORDER BY u.nom_visible, a.rol_codi`)
      .bind(casalId)
      .all<AssignacioRol>();
    return results;
  }

  async assignacioPerId(id: string) {
    return this.db
      .prepare(`${D1RepositoriUsuaris.SELECT_ASSIGNACIO} WHERE a.id = ? AND a.revocat_el IS NULL`)
      .bind(id)
      .first<AssignacioRol>();
  }

  async rolExisteix(codi: string) {
    return this.db.prepare("SELECT abast FROM rols WHERE codi = ?").bind(codi).first<{ abast: "casal" | "global" }>();
  }

  operacioAssignar(
    d: { id: string; usuari_id: string; rol_codi: string; casal_id: string | null; atorgat_per: string; motiu: string | null },
    ara: string,
  ) {
    return comOperacio(
      this.db
        .prepare(
          `INSERT INTO assignacions_rols (id, usuari_id, rol_codi, casal_id, atorgat_per, atorgat_el, motiu)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(d.id, d.usuari_id, d.rol_codi, d.casal_id, d.atorgat_per, ara, d.motiu),
    );
  }

  operacioRevocar(id: string, revocatPer: string, motiu: string | null, ara: string) {
    return comOperacio(
      this.db
        .prepare(
          `UPDATE assignacions_rols SET revocat_el = ?, revocat_per = ?, motiu = coalesce(?, motiu)
           WHERE id = ? AND revocat_el IS NULL`,
        )
        .bind(ara, revocatPer, motiu, id),
    );
  }
}

export class D1RepositoriSessions implements RepositoriSessions {
  constructor(private readonly db: D1Database) {}

  async crearTestimoni(resum: string, usuariId: string, ara: string, caducaEl: string) {
    await this.db
      .prepare("INSERT INTO testimonis_acces (resum, usuari_id, creat_el, caduca_el) VALUES (?, ?, ?, ?)")
      .bind(resum, usuariId, ara, caducaEl)
      .run();
  }

  async consumirTestimoni(resum: string, ara: string) {
    // L'UPDATE condicionat garanteix l'ús únic encara que arribin dues peticions alhora.
    const f = await this.db
      .prepare(
        `UPDATE testimonis_acces SET usat_el = ?
         WHERE resum = ? AND usat_el IS NULL AND caduca_el > ?
         RETURNING usuari_id`,
      )
      .bind(ara, resum, ara)
      .first<{ usuari_id: string }>();
    return f?.usuari_id ?? null;
  }

  async crearSessio(resum: string, usuariId: string, ara: string, caducaEl: string) {
    await this.db
      .prepare(
        `INSERT INTO sessions_usuari (resum, usuari_id, creada_el, caduca_el, darrer_us_el) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(resum, usuariId, ara, caducaEl, ara)
      .run();
  }

  async sessioVigent(resum: string, ara: string) {
    return this.db
      .prepare(
        `SELECT s.usuari_id, s.darrer_us_el FROM sessions_usuari s JOIN usuaris u ON u.id = s.usuari_id
         WHERE s.resum = ? AND s.revocada_el IS NULL AND s.caduca_el > ? AND u.actiu = 1`,
      )
      .bind(resum, ara)
      .first<{ usuari_id: string; darrer_us_el: string }>();
  }

  async tocarSessio(resum: string, ara: string) {
    await this.db.prepare("UPDATE sessions_usuari SET darrer_us_el = ? WHERE resum = ?").bind(ara, resum).run();
  }

  async revocarSessio(resum: string, ara: string) {
    await this.db
      .prepare("UPDATE sessions_usuari SET revocada_el = ? WHERE resum = ? AND revocada_el IS NULL")
      .bind(ara, resum)
      .run();
  }
}
