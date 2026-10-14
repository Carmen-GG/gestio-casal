import { errors } from "../http/errors";
import type { PermisosUsuari, Usuari } from "../repositories/tipus";

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
    return this.esGlobal(permis) || (this.permisos.perCasal[casalId]?.includes(permis) ?? false);
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
    return [...new Set([...this.permisos.globals, ...(this.permisos.perCasal[casalId] ?? [])])].sort();
  }
}
