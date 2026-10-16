import type { AvisRebuda, RepositoriAvisosRebuda } from "../tipus";

export class D1RepositoriAvisosRebuda implements RepositoriAvisosRebuda {
  constructor(private readonly db: D1Database) {}

  async desar(a: AvisRebuda): Promise<void> {
    await this.db.prepare(
      `INSERT INTO avisos_rebuda (sollicitud_id, casal_id, canal, estat, motiu, extern_id, error_text, creat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (sollicitud_id) DO NOTHING`,
    ).bind(a.sollicitud_id, a.casal_id, a.canal, a.estat, a.motiu, a.extern_id, a.error_text, a.creat_el).run();
  }

  async perSollicitud(sollicitudId: string): Promise<AvisRebuda | null> {
    return this.db.prepare("SELECT * FROM avisos_rebuda WHERE sollicitud_id = ?").bind(sollicitudId).first<AvisRebuda>();
  }
}
