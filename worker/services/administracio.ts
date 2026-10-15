import { errors } from "../http/errors";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { IndicadorsCicleGlobal, Repositoris } from "../repositories/tipus";
import type { ContextOperacio } from "./traca";
import { ROL_RESPONSABLE, ServeiUsuaris } from "./usuaris";

type Recomptes = Omit<IndicadorsCicleGlobal, "casal_id" | "cicle_id" | "cicle" | "any" | "estat" | "data_inici" | "data_fi">;
const CAMPS_RECOMPTE: (keyof Recomptes)[] = [
  "activitats", "places_ofertes", "sollicituds", "persones", "admeses", "espera", "renuncies", "baixes", "baixes_voluntaries",
  "sessions_realitzades", "presencies", "absencies", "absencies_justificades",
];
const zero = (): Recomptes => Object.fromEntries(CAMPS_RECOMPTE.map((k) => [k, 0])) as Recomptes;
const suma = (a: Recomptes, b: Recomptes) => { for (const k of CAMPS_RECOMPTE) a[k] += Number(b[k]) || 0; return a; };
/** % d'assistència: presències sobre marques (les faltes justificades compten com a faltes, com al quadre del cicle). */
const percentatge = (r: Recomptes) => {
  const marques = r.presencies + r.absencies + r.absencies_justificades;
  return marques ? Math.round((r.presencies / marques) * 1000) / 10 : null;
};

/**
 * Superadministració (petició de 2026-10-15): responsables de cada casal i quadre de
 * comandament de tots els casals. Les rutes exigeixen permisos globals.
 */
export class ServeiAdministracio {
  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    private readonly proveidor: "dev" | "entra_id",
  ) {}

  /** Tots els casals amb les seves persones responsables i l'estat del seu accés. */
  async responsables() {
    const [casals, responsables] = await Promise.all([this.repos.casals.llistar(), this.repos.usuaris.responsables()]);
    return {
      casals: casals.map((k) => ({
        id: k.id, codi: k.codi, nom: k.nom, municipi: k.municipi, actiu: k.actiu,
        responsables: responsables.filter((r) => r.casal_id === k.id).map(({ casal_id: _c, ...r }) => r),
      })),
    };
  }

  async assignarResponsable(casalId: string, dades: { email: string; nom_visible: string }, ctx: ContextOperacio & { usuariId: string }) {
    const usuaris = new ServeiUsuaris(this.repos, this.rellotge, this.proveidor);
    const assignacio = await usuaris.assignarRol(casalId, { ...dades, rol_codi: ROL_RESPONSABLE, motiu: null }, ctx);
    const acces = await usuaris.accesAlta(assignacio.usuari_id, casalId, ctx, true);
    return { assignacio, acces };
  }

  async revocarResponsable(casalId: string, assignacioId: string, ctx: ContextOperacio & { usuariId: string; motiu?: string | null }) {
    const a = await this.repos.usuaris.assignacioPerId(assignacioId);
    if (!a || a.casal_id !== casalId || a.rol_codi !== ROL_RESPONSABLE) throw errors.noTrobat("No s'ha trobat la persona responsable.");
    await new ServeiUsuaris(this.repos, this.rellotge, this.proveidor).revocar(casalId, assignacioId, ctx, true);
  }

  async nouCodiResponsable(casalId: string, assignacioId: string, ctx: ContextOperacio & { usuariId: string }) {
    const a = await this.repos.usuaris.assignacioPerId(assignacioId);
    if (!a || a.casal_id !== casalId || a.rol_codi !== ROL_RESPONSABLE) throw errors.noTrobat("No s'ha trobat la persona responsable.");
    return new ServeiUsuaris(this.repos, this.rellotge, this.proveidor).nouCodi(casalId, assignacioId, ctx, true);
  }

  /** Quadre de comandament global: per cicle, per casal i total. Només recomptes, cap dada personal. */
  async quadre(any: number | null, ctx: ContextOperacio) {
    const [{ cicles, casals: perCasal, anys }, casals] = await Promise.all([this.repos.indicadors.global(any), this.repos.casals.llistar()]);
    const nomCasal = new Map(casals.map((k) => [k.id, k]));
    const filesCicles = cicles.map((c) => {
      const r = suma(zero(), c);
      return { ...c, casal: nomCasal.get(c.casal_id)?.nom ?? "", percentatge_assistencia: percentatge(r) };
    }).sort((a, b) => a.casal.localeCompare(b.casal, "ca") || a.data_inici.localeCompare(b.data_inici));
    const filesCasals = casals.map((k) => {
      const propis = cicles.filter((c) => c.casal_id === k.id);
      const r = propis.reduce(suma, zero());
      const extra = perCasal.find((p) => p.casal_id === k.id);
      return {
        casal_id: k.id, casal: k.nom, municipi: k.municipi, actiu: k.actiu, cicles: propis.length, ...r,
        persones_diferents: Number(extra?.persones_diferents ?? 0), persones_plataforma: Number(extra?.persones_plataforma ?? 0),
        equip: Number(extra?.equip ?? 0), responsables: Number(extra?.responsables ?? 0), percentatge_assistencia: percentatge(r),
      };
    });
    const total = filesCasals.reduce(suma, zero());
    const totals = {
      ...total, percentatge_assistencia: percentatge(total),
      casals: casals.length,
      casals_amb_responsable: filesCasals.filter((k) => k.responsables > 0).length,
      casals_amb_cicles: filesCasals.filter((k) => k.cicles > 0).length,
      cicles: cicles.length,
      persones_diferents: filesCasals.reduce((n, k) => n + k.persones_diferents, 0),
      persones_plataforma: filesCasals.reduce((n, k) => n + k.persones_plataforma, 0),
      equip: filesCasals.reduce((n, k) => n + k.equip, 0),
    };
    await this.repos.auditoria.registrar({
      casal_id: null, usuari_id: ctx.usuariId ?? null, tipus_operacio: "administracio.quadre", entitat: "quadre_global", entitat_id: null,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { any },
    }, isoAra(this.rellotge));
    return { any, anys, totals, casals: filesCasals, cicles: filesCicles };
  }
}
