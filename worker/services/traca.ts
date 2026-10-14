import { errors } from "../http/errors";
import type { CondicioOperacio, EntradaAuditoria, EntradaHistorial, Operacio, Repositoris } from "../repositories/tipus";

export interface ContextOperacio {
  usuariId: string | null;
  idPeticio?: string | null;
}

/**
 * Executa una escriptura juntament amb el seu historial i el registre d'auditoria
 * en un sol lot atòmic. L'historial i l'auditoria només s'insereixen si
 * l'escriptura principal ha tingut efecte (condició pel testimoni d'operació).
 */
export async function escriuAmbTraca(
  repos: Repositoris,
  ara: string,
  args: {
    principal: Operacio;
    condicio: CondicioOperacio;
    historial?: Omit<EntradaHistorial, "usuari_id">;
    auditoria: Omit<EntradaAuditoria, "usuari_id" | "id_peticio" | "resultat">;
    ctx: ContextOperacio;
    missatgeConflicte?: string;
  },
): Promise<void> {
  const operacions: Operacio[] = [args.principal];
  if (args.historial) {
    operacions.push(repos.historial.operacioAfegir({ ...args.historial, usuari_id: args.ctx.usuariId }, ara, args.condicio));
  }
  operacions.push(
    repos.auditoria.operacioRegistrar(
      { ...args.auditoria, usuari_id: args.ctx.usuariId, id_peticio: args.ctx.idPeticio ?? null, resultat: "exit" },
      ara,
      args.condicio,
    ),
  );
  const [principal] = await repos.unitat.executar(operacions);
  if (!principal || principal.canvis !== 1) {
    throw errors.conflicte(
      "conflicte_concurrencia",
      args.missatgeConflicte ?? "Les dades s'han modificat mentrestant. Recarregueu-les i torneu-ho a provar.",
    );
  }
}

/** Diferències entre dos objectes per als camps indicats (per a l'historial). */
export function diferencies<T extends object>(
  abans: T,
  despres: Partial<T>,
): Record<string, { abans: unknown; despres: unknown }> {
  const canvis: Record<string, { abans: unknown; despres: unknown }> = {};
  for (const [camp, valor] of Object.entries(despres)) {
    if (valor === undefined) continue;
    const anterior = (abans as Record<string, unknown>)[camp];
    if (JSON.stringify(anterior ?? null) !== JSON.stringify(valor ?? null)) {
      canvis[camp] = { abans: anterior ?? null, despres: valor ?? null };
    }
  }
  return canvis;
}
