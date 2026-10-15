import { errors } from "../http/errors";
import type { PermisosUsuari, Usuari } from "../repositories/tipus";

/**
 * Permisos de només consulta. La superadministració els té a tots els casals; la resta de
 * permisos globals només s'apliquen als casals que no tenen persona responsable
 * (decisió de 2026-10-15: si el casal té responsable, el gestiona ella).
 */
export const PERMISOS_CONSULTA = new Set([
  "casal.consultar", "cicles.consultar", "activitats.consultar", "sollicituds.consultar", "sollicituds.dades_contacte",
  "estadistiques.consultar", "cartells.consultar", "auditoria.consultar", "dades.exportar",
]);

/**
 * Persona autenticada amb els seus permisos efectius. Els permisos es tornen a
 * carregar de la base de dades a cada petició: una revocació té efecte immediat.
 */
export class UsuariAutenticat {
  constructor(
    readonly usuari: Usuari,
    private readonly permisos: PermisosUsuari,
  ) {}

  get id() {
    return this.usuari.id;
  }

  /** Té permisos d'abast global (administració central)? */
  esGlobal(permis: string): boolean {
    return this.permisos.globals.includes(permis);
  }

  pot(permis: string, casalId: string): boolean {
    if (this.permisos.perCasal[casalId]?.includes(permis)) return true;
    return this.esGlobal(permis) && (PERMISOS_CONSULTA.has(permis) || !this.teResponsable(casalId));
  }

  /** El casal té persona responsable? (només se sap per a qui té permisos globals) */
  teResponsable(casalId: string): boolean {
    return this.permisos.casalsAmbResponsable.includes(casalId);
  }

  /** Superadministració que entra en un casal amb responsable: només hi pot consultar. */
  nomesConsulta(casalId: string): boolean {
    return this.permisos.globals.length > 0 && this.teResponsable(casalId) && !(this.permisos.perCasal[casalId]?.length);
  }

  /** Llança 403 si no té el permís en aquest casal. */
  exigeix(permis: string, casalId: string): void {
    if (!this.pot(permis, casalId)) throw errors.sensePermis();
  }

  /** Té algun permís en aquest casal? (accés mínim per veure'l) */
  teAccesCasal(casalId: string): boolean {
    return this.permisos.globals.length > 0 || (this.permisos.perCasal[casalId]?.length ?? 0) > 0;
  }

  /** null = tots els casals (abast global). */
  casalsAccessibles(): string[] | null {
    return this.permisos.globals.length > 0 ? null : Object.keys(this.permisos.perCasal);
  }

  permisosA(casalId: string): string[] {
    const globals = this.permisos.globals.filter((p) => this.pot(p, casalId));
    return [...new Set([...globals, ...(this.permisos.perCasal[casalId] ?? [])])].sort();
  }
}
