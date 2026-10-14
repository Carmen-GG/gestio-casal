import { errors } from "../http/errors";
import type { AssignacioRol, Repositoris } from "../repositories/tipus";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { nouId } from "../lib/ids";
import type { ContextOperacio } from "./traca";

/**
 * Gestió de les persones autoritzades d'un casal. Les assignacions no s'esborren:
 * es revoquen, i cada canvi de permisos queda a l'auditoria.
 */
export class ServeiUsuaris {
  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    private readonly proveidor: "dev" | "entra_id",
  ) {}

  async assignarRol(
    casalId: string,
    dades: { email: string; nom_visible: string; rol_codi: string; motiu?: string | null },
    ctx: ContextOperacio & { usuariId: string },
  ): Promise<AssignacioRol> {
    const rol = await this.repos.usuaris.rolExisteix(dades.rol_codi);
    if (!rol || rol.abast !== "casal") throw errors.peticioInvalida("Rol no vàlid.");
    if (!(await this.repos.casals.perId(casalId))) throw errors.noTrobat("No s'ha trobat el casal.");

    const usuari =
      (await this.repos.usuaris.perEmail(dades.email)) ??
      (await this.repos.usuaris.crear({ email: dades.email, nom_visible: dades.nom_visible, proveidor_identitat: this.proveidor }));
    if (!usuari.actiu) throw errors.conflicte("usuari_inactiu", "Aquesta persona està desactivada.");

    const id = nouId();
    const ara = isoAra(this.rellotge);
    const motiu = dades.motiu?.trim() || null;
    try {
      await this.repos.unitat.executar([
        this.repos.usuaris.operacioAssignar({ id, usuari_id: usuari.id, rol_codi: dades.rol_codi, casal_id: casalId, atorgat_per: ctx.usuariId, motiu }, ara),
        this.repos.auditoria.operacioRegistrar({
          casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: "permisos.assignacio", entitat: "assignacio_rol",
          entitat_id: id, resultat: "exit", motiu, detalls: { usuari_afectat: usuari.id, rol: dades.rol_codi }, id_peticio: ctx.idPeticio ?? null,
        }, ara),
      ]);
    } catch (e) {
      if (String((e as Error).message).includes("UNIQUE")) {
        throw errors.conflicte("rol_ja_assignat", "Aquesta persona ja té aquest rol en aquest casal.");
      }
      throw e;
    }
    return (await this.repos.usuaris.assignacioPerId(id))!;
  }

  async revocar(casalId: string, assignacioId: string, opcions: ContextOperacio & { usuariId: string; motiu?: string | null }) {
    const assignacio = await this.repos.usuaris.assignacioPerId(assignacioId);
    // Només es poden revocar assignacions del mateix casal (no globals ni d'altres casals).
    if (!assignacio || assignacio.casal_id !== casalId) throw errors.noTrobat("No s'ha trobat l'assignació.");
    const ara = isoAra(this.rellotge);
    const motiu = opcions.motiu?.trim() || null;
    const [r] = await this.repos.unitat.executar([
      this.repos.usuaris.operacioRevocar(assignacioId, opcions.usuariId, motiu, ara),
      this.repos.auditoria.operacioRegistrar({
        casal_id: casalId, usuari_id: opcions.usuariId, tipus_operacio: "permisos.revocacio", entitat: "assignacio_rol",
        entitat_id: assignacioId, resultat: "exit", motiu, detalls: { usuari_afectat: assignacio.usuari_id, rol: assignacio.rol_codi },
        id_peticio: opcions.idPeticio ?? null,
      }, ara),
    ]);
    if (!r || r.canvis !== 1) throw errors.conflicte("conflicte_concurrencia", "L'assignació ja s'havia revocat.");
  }
}
