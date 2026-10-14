import type { Activitat, EstatActivitat, NovaActivitat, RepositoriActivitats } from "../tipus";
import { jsonLlistaNumeros, jsonObjecte, marcadors } from "./util";
import { nouId } from "../../lib/ids";
import { isoAra, type Rellotge } from "../../lib/rellotge";

type Fila = Omit<Activitat, "dies_setmana" | "informacio_difusio" | "configuracio_continuitat"> & {
  dies_setmana: string;
  informacio_difusio: string;
  configuracio_continuitat: string;
};

const mapa = (f: Fila): Activitat => ({
  ...f,
  dies_setmana: jsonLlistaNumeros(f.dies_setmana),
  informacio_difusio: jsonObjecte(f.informacio_difusio),
  configuracio_continuitat: jsonObjecte(f.configuracio_continuitat),
});

export class D1RepositoriActivitats implements RepositoriActivitats {
  constructor(private readonly db: D1Database, private readonly rellotge: Rellotge) {}

  async perId(casalId: string, id: string) {
    const f = await this.db
      .prepare("SELECT * FROM activitats WHERE id = ? AND casal_id = ?")
      .bind(id, casalId)
      .first<Fila>();
    return f ? mapa(f) : null;
  }

  async llistarPerCicle(casalId: string, cicleId: string, opcions: { estats?: EstatActivitat[] } = {}) {
    const estats = opcions.estats ?? [];
    const filtre = estats.length ? ` AND estat IN (${marcadors(estats.length)})` : "";
    const { results } = await this.db
      .prepare(`SELECT * FROM activitats WHERE casal_id = ? AND cicle_id = ?${filtre} ORDER BY nom COLLATE NOCASE`)
      .bind(casalId, cicleId, ...estats)
      .all<Fila>();
    return results.map(mapa);
  }

  async crear(d: NovaActivitat) {
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.db
      .prepare(
        `INSERT INTO activitats (id, casal_id, cicle_id, nom, descripcio, categoria, dies_setmana, hora_inici,
           hora_fi, horari_text, data_inici, data_fi, espai, capacitat, nombre_sessions, estat,
           informacio_difusio, configuracio_continuitat, codi_extern, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, d.casal_id, d.cicle_id, d.nom, d.descripcio ?? null, d.categoria ?? null,
        JSON.stringify(d.dies_setmana ?? []), d.hora_inici ?? null, d.hora_fi ?? null, d.horari_text ?? null,
        d.data_inici ?? null, d.data_fi ?? null, d.espai ?? null, d.capacitat, d.nombre_sessions ?? null,
        d.estat ?? "esborrany", JSON.stringify(d.informacio_difusio ?? {}),
        JSON.stringify(d.configuracio_continuitat ?? {}), d.codi_extern ?? null, ara, ara)
      .run();
    return (await this.perId(d.casal_id, id))!;
  }
}
