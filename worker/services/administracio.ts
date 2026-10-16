import { errors } from "../http/errors";
import { nouId } from "../lib/ids";
import { CATEGORIES_INCIDENCIA, type CategoriaIncidencia } from "../../shared/domain/territori";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { IndicadorsCicleGlobal, Repositoris } from "../repositories/tipus";
import type { ContextOperacio } from "./traca";
import { ROL_RESPONSABLE, ServeiUsuaris } from "./usuaris";

type Recomptes = Omit<IndicadorsCicleGlobal, "casal_id" | "cicle_id" | "cicle" | "any" | "estat" | "data_inici" | "data_fi">;
const CAMPS_RECOMPTE: (keyof Recomptes)[] = [
  "activitats", "places_ofertes", "sollicituds", "persones", "admeses", "espera", "renuncies", "baixes", "baixes_voluntaries",
  "sessions_realitzades", "presencies", "absencies", "absencies_justificades", "activitats_sense_tallerista", "sessions_falta_tallerista",
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

  /** Referents i territori de cada casal (comarca, demarcació, referent). */
  async territori() {
    const [casals, referents] = await Promise.all([this.repos.casals.llistar(), this.repos.territori.referents()]);
    return {
      referents,
      casals: casals.map((k) => ({
        id: k.id, codi: k.codi, nom: k.nom, municipi: k.municipi, actiu: k.actiu, comarca: k.comarca, demarcacio: k.demarcacio, referent_id: k.referent_id,
      })),
    };
  }

  async crearReferent(d: { nom: string; email?: string | null }, ctx: ContextOperacio) {
    const id = nouId();
    const ara = isoAra(this.rellotge);
    await this.repos.territori.crearReferent({ id, nom: d.nom, email: d.email ?? null }, ara);
    await this.auditaTerritori("territori.referent_alta", "referent", id, ctx, ara);
    return { id };
  }

  async actualitzarReferent(id: string, d: { nom: string; email?: string | null; actiu: boolean }, ctx: ContextOperacio) {
    const ara = isoAra(this.rellotge);
    if (!(await this.repos.territori.actualitzarReferent(id, { nom: d.nom, email: d.email ?? null, actiu: d.actiu }, ara))) {
      throw errors.noTrobat("No s'ha trobat la persona referent.");
    }
    await this.auditaTerritori("territori.referent_canvi", "referent", id, ctx, ara);
    return { ok: true };
  }

  async fixarTerritori(casalId: string, d: { comarca: string | null; demarcacio: string | null; referent_id: string | null }, ctx: ContextOperacio) {
    if (d.referent_id && !(await this.repos.territori.referent(d.referent_id))) throw errors.noTrobat("No s'ha trobat la persona referent.");
    const ara = isoAra(this.rellotge);
    if (!(await this.repos.territori.fixarTerritori(casalId, d, ara))) throw errors.noTrobat("No s'ha trobat el casal.");
    await this.auditaTerritori("territori.casal", "casal", casalId, ctx, ara, casalId);
    return { ok: true };
  }

  private auditaTerritori(tipus: string, entitat: string, id: string, ctx: ContextOperacio, ara: string, casalId: string | null = null) {
    return this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId ?? null, tipus_operacio: tipus, entitat, entitat_id: id,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null,
    }, ara);
  }

  /**
   * Quadre de comandament global: per cicle i per casal, amb el territori i la referent de cada
   * casal perquè la pantalla pugui filtrar i agrupar. Només recomptes, cap dada personal.
   */
  async quadre(any: number | null, ctx: ContextOperacio) {
    const [{ cicles, casals: perCasal, anys, incidencies }, casals, referents] = await Promise.all([
      this.repos.indicadors.global(any), this.repos.casals.llistar(), this.repos.territori.referents(),
    ]);
    const nomCasal = new Map(casals.map((k) => [k.id, k]));
    const nomReferent = new Map(referents.map((r) => [r.id, r.nom]));
    const filesCicles = cicles.map((c) => {
      const r = suma(zero(), c);
      return { ...c, casal: nomCasal.get(c.casal_id)?.nom ?? "", percentatge_assistencia: percentatge(r) };
    }).sort((a, b) => a.casal.localeCompare(b.casal, "ca") || a.data_inici.localeCompare(b.data_inici));
    const filesCasals = casals.map((k) => {
      const propis = cicles.filter((c) => c.casal_id === k.id);
      const r = propis.reduce(suma, zero());
      const extra = perCasal.find((p) => p.casal_id === k.id);
      const inc = incidencies.filter((i) => i.casal_id === k.id);
      const perCategoria = Object.fromEntries(CATEGORIES_INCIDENCIA.map((cat) => [cat, 0])) as Record<CategoriaIncidencia, number>;
      for (const i of inc) perCategoria[i.categoria] += Number(i.n);
      return {
        casal_id: k.id, casal: k.nom, municipi: k.municipi, actiu: k.actiu,
        comarca: k.comarca, demarcacio: k.demarcacio, referent_id: k.referent_id, referent: k.referent_id ? nomReferent.get(k.referent_id) ?? null : null,
        cicles: propis.length, ...r,
        persones_diferents: Number(extra?.persones_diferents ?? 0), persones_plataforma: Number(extra?.persones_plataforma ?? 0),
        equip: Number(extra?.equip ?? 0), responsables: Number(extra?.responsables ?? 0), percentatge_assistencia: percentatge(r),
        incidencies: inc.reduce((n, i) => n + Number(i.n), 0),
        incidencies_obertes: inc.filter((i) => i.estat === "oberta").reduce((n, i) => n + Number(i.n), 0),
        incidencies_per_categoria: perCategoria,
      };
    });
    await this.repos.auditoria.registrar({
      casal_id: null, usuari_id: ctx.usuariId ?? null, tipus_operacio: "administracio.quadre", entitat: "quadre_global", entitat_id: null,
      resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { any },
    }, isoAra(this.rellotge));
    return {
      any, anys, casals: filesCasals, cicles: filesCicles,
      referents: referents.map((r) => ({ id: r.id, nom: r.nom, actiu: r.actiu })),
    };
  }
}
