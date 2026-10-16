import type { CampPlantilla, EstatPlantilla, TipusPlantilla, UsFitxer } from "../../../shared/domain/cartells";
import type { FitxerCartells, FotoCartells, NovaPlantillaCartells, PlantillaCartells, RepositoriCartells } from "../tipus";
import { assignacionsUpdate, comOperacio, marcadors } from "./util";

type FilaPlantilla = Omit<PlantillaCartells, "amb_qr" | "camps"> & { amb_qr: number; camps: string };

function plantilla(f: FilaPlantilla): PlantillaCartells {
  let camps: CampPlantilla[] = [];
  try {
    const v = JSON.parse(f.camps);
    if (Array.isArray(v)) camps = v;
  } catch { /* camps buits */ }
  const { fitxer_us: _us, previsualitzacio_us: _pus, darrera_operacio: _op, ...resta } = f as FilaPlantilla & { fitxer_us?: string; previsualitzacio_us?: string; darrera_operacio?: string };
  return { ...resta, amb_qr: f.amb_qr === 1, camps };
}

const COLUMNES_ACTUALITZABLES = ["nom", "estat", "estacio", "tematica", "identitat_grafica", "camps", "format_sortida"] as const;

export class D1RepositoriCartells implements RepositoriCartells {
  constructor(private readonly db: D1Database) {}

  operacioCrearFitxer(f: FitxerCartells) {
    return comOperacio(this.db.prepare(
      `INSERT INTO cartells_fitxers (id, casal_id, us, clau, tipus_mime, mida, sha256, nom_original, pujat_per, pujat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(f.id, f.casal_id, f.us, f.clau, f.tipus_mime, f.mida, f.sha256, f.nom_original, f.pujat_per, f.pujat_el));
  }

  async fitxer(id: string) {
    return this.db.prepare("SELECT * FROM cartells_fitxers WHERE id = ?").bind(id).first<FitxerCartells>();
  }

  async fitxersPerContingut(sha256: string, us: UsFitxer, casalId: string | null) {
    const { results } = await this.db.prepare(
      "SELECT * FROM cartells_fitxers WHERE sha256 = ? AND us = ? AND casal_id IS ? ORDER BY pujat_el",
    ).bind(sha256, us, casalId).all<FitxerCartells>();
    return results;
  }

  operacioCrearPlantilla(id: string, p: NovaPlantillaCartells, ara: string, operacio: string) {
    return comOperacio(this.db.prepare(
      `INSERT INTO cartells_plantilles (id, casal_id, fitxer_id, previsualitzacio_id, nom, tipus, estacio, linies_titol, amb_qr, tematica,
         identitat_grafica, estat, pagina_amplada, pagina_alcada, format_sortida, camps, darrera_operacio, creat_per, creat_el, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'esborrany', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, p.casal_id, p.fitxer_id, p.previsualitzacio_id, p.nom, p.tipus, p.estacio, p.linies_titol, p.amb_qr ? 1 : 0, p.tematica,
      p.identitat_grafica, p.pagina_amplada, p.pagina_alcada, p.format_sortida, JSON.stringify(p.camps), operacio,
      p.creat_per, ara, ara));
  }

  operacioActualitzarPlantilla(id: string, versioActual: number, canvis: Parameters<RepositoriCartells["operacioActualitzarPlantilla"]>[2], ara: string, operacio: string) {
    const { sql, valors } = assignacionsUpdate(canvis, COLUMNES_ACTUALITZABLES);
    return comOperacio(this.db.prepare(
      `UPDATE cartells_plantilles SET ${sql}, actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
       WHERE id = ? AND versio = ?`,
    ).bind(...valors, ara, operacio, id, versioActual));
  }

  async plantilla(id: string) {
    const f = await this.db.prepare("SELECT * FROM cartells_plantilles WHERE id = ?").bind(id).first<FilaPlantilla>();
    return f ? plantilla(f) : null;
  }

  async plantillaPerFitxer(fitxerId: string) {
    const f = await this.db.prepare("SELECT * FROM cartells_plantilles WHERE fitxer_id = ?").bind(fitxerId).first<FilaPlantilla>();
    return f ? plantilla(f) : null;
  }

  async plantilles(filtre: { casalId: string | null; tipus?: TipusPlantilla; estats?: EstatPlantilla[] }) {
    const condicions = [filtre.casalId ? "(casal_id IS NULL OR casal_id = ?)" : "casal_id IS NULL"];
    const params: unknown[] = filtre.casalId ? [filtre.casalId] : [];
    if (filtre.tipus) { condicions.push("tipus = ?"); params.push(filtre.tipus); }
    if (filtre.estats?.length) { condicions.push(`estat IN (${marcadors(filtre.estats.length)})`); params.push(...filtre.estats); }
    const { results } = await this.db.prepare(
      `SELECT * FROM cartells_plantilles WHERE ${condicions.join(" AND ")}
       ORDER BY tipus, CASE estacio WHEN 'primavera' THEN 1 WHEN 'estiu' THEN 2 WHEN 'tardor' THEN 3 WHEN 'hivern' THEN 4 ELSE 5 END,
                linies_titol, amb_qr, nom`,
    ).bind(...params).all<FilaPlantilla>();
    return results.map(plantilla);
  }

  // ---------- Fototeca ----------

  async crearFoto(f: FotoCartells) {
    await this.db.prepare(
      `INSERT INTO cartells_fotos (id, casal_id, fitxer_id, miniatura_id, carpeta, nom, amplada, alcada, pujada_per, pujada_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(f.id, f.casal_id, f.fitxer_id, f.miniatura_id, f.carpeta, f.nom, f.amplada, f.alcada, f.pujada_per, f.pujada_el).run();
  }

  async foto(id: string) {
    return this.db.prepare(`SELECT ${COLUMNES_FOTO} FROM cartells_fotos WHERE id = ? AND retirada_el IS NULL`).bind(id).first<FotoCartells>();
  }

  async fotoPerFitxer(fitxerId: string, casalId: string | null) {
    return this.db.prepare(`SELECT ${COLUMNES_FOTO} FROM cartells_fotos WHERE fitxer_id = ? AND casal_id IS ? AND retirada_el IS NULL`)
      .bind(fitxerId, casalId).first<FotoCartells>();
  }

  async fotos(casalId: string | null) {
    const { results } = await this.db.prepare(
      `SELECT ${COLUMNES_FOTO} FROM cartells_fotos WHERE retirada_el IS NULL AND (casal_id IS NULL OR casal_id = ?)
       ORDER BY casal_id IS NULL, carpeta, nom`,
    ).bind(casalId).all<FotoCartells>();
    return results;
  }

  async retirarFoto(id: string, usuariId: string, ara: string) {
    await this.db.prepare("UPDATE cartells_fotos SET retirada_per = ?, retirada_el = ? WHERE id = ? AND retirada_el IS NULL")
      .bind(usuariId, ara, id).run();
  }
}

const COLUMNES_FOTO = "id, casal_id, fitxer_id, miniatura_id, carpeta, nom, amplada, alcada, pujada_per, pujada_el";
