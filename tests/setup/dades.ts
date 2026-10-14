/**
 * Dades de prova fictícies. No contenen cap dada personal real.
 */
import { env } from "cloudflare:test";
import { repositorisD1 } from "../../worker/repositories/d1";
import type { Rellotge } from "../../worker/lib/rellotge";
import type { EstatCicle } from "../../shared/domain/cicles";

export const rellotgeFix = (iso: string): Rellotge => ({ ara: () => new Date(iso) });
export const ARA = "2026-11-01T10:00:00.000Z";

let comptador = 0;
const unic = () => `${Date.now().toString(36)}${(comptador++).toString(36)}`.toUpperCase();

export async function crearEscenari(opcions: { estatCicle?: EstatCicle } = {}) {
  const repos = repositorisD1(env.DB, rellotgeFix(ARA));
  const casal = await repos.casals.crear({ codi: `PROVA-${unic()}`, nom: "Casal de prova", municipi: "Municipi fictici" });
  const cicle = await repos.cicles.crear({
    casal_id: casal.id,
    nom: "Cicle fictici",
    any: 2027,
    data_inici: "2027-01-11",
    data_fi: "2027-03-26",
    obertura_inscripcions: "2026-10-01T07:00:00.000Z",
    tancament_inscripcions: "2026-12-31T22:59:59.000Z",
    data_resolucio_prevista: "2027-01-08",
  });
  if (opcions.estatCicle && opcions.estatCicle !== "esborrany") {
    await env.DB.prepare("UPDATE cicles SET estat = ? WHERE id = ?").bind(opcions.estatCicle, cicle.id).run();
  }
  const activa = await repos.activitats.crear({
    casal_id: casal.id, cicle_id: cicle.id, nom: "Taller fictici", capacitat: 10, estat: "activa",
    dies_setmana: [1, 3], hora_inici: "10:00", hora_fi: "11:30", codi_extern: "EXT-1",
    informacio_difusio: { nota_interna: "no s'ha d'exposar" },
  });
  const esborrany = await repos.activitats.crear({
    casal_id: casal.id, cicle_id: cicle.id, nom: "Activitat en esborrany", capacitat: 5,
  });
  return { repos, casal, cicle: (await repos.cicles.perId(casal.id, cicle.id))!, activa, esborrany };
}
