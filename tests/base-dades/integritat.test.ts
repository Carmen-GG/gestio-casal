import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";

const ARA = "2026-11-01T10:00:00.000Z";

async function falla(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error("s'esperava un error");
}

describe("migracions i restriccions d'integritat", () => {
  it("les claus foranes estan actives", async () => {
    const fk = await env.DB.prepare("PRAGMA foreign_keys").first<{ foreign_keys: number }>();
    expect(fk?.foreign_keys).toBe(1);
  });

  it("no permet una activitat d'un casal dins d'un cicle d'un altre casal", async () => {
    const a = await crearEscenari();
    const b = await crearEscenari();
    const msg = await falla(
      env.DB.prepare(
        `INSERT INTO activitats (id, casal_id, cicle_id, nom, capacitat, creat_el, actualitzat_el)
         VALUES (?, ?, ?, 'Intrusa', 5, ?, ?)`,
      ).bind(crypto.randomUUID(), b.casal.id, a.cicle.id, ARA, ARA).run(),
    );
    expect(msg).toMatch(/FOREIGN KEY/i);
  });

  it("rebutja preferències duplicades i activitats d'un altre cicle", async () => {
    const { casal, cicle, activa, esborrany } = await crearEscenari();
    const altre = await crearEscenari();
    const participant = crypto.randomUUID();
    const sollicitud = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO participants (id, casal_id, nom, cognom1, clau_ordenacio, creat_el, actualitzat_el)
         VALUES (?, ?, 'Nom', 'Fictici', 'fictici', ?, ?)`,
      ).bind(participant, casal.id, ARA, ARA),
      env.DB.prepare(
        `INSERT INTO sollicituds (id, casal_id, cicle_id, participant_id, numero, rebuda_el, origen,
           codi_confirmacio, actualitzat_el)
         VALUES (?, ?, ?, ?, 1, ?, 'formulari_public', ?, ?)`,
      ).bind(sollicitud, casal.id, cicle.id, participant, ARA, crypto.randomUUID(), ARA),
      env.DB.prepare("INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre) VALUES (?, ?, ?, 1)")
        .bind(sollicitud, cicle.id, activa.id),
    ]);

    const duplicada = await falla(
      env.DB.prepare("INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre) VALUES (?, ?, ?, 1)")
        .bind(sollicitud, cicle.id, esborrany.id).run(),
    );
    expect(duplicada).toMatch(/UNIQUE/i);

    const altreCicle = await falla(
      env.DB.prepare("INSERT INTO preferencies (sollicitud_id, cicle_id, activitat_id, ordre) VALUES (?, ?, ?, 2)")
        .bind(sollicitud, cicle.id, altre.activa.id).run(),
    );
    expect(altreCicle).toMatch(/FOREIGN KEY/i);

    // El número i la data de recepció són immutables i la sol·licitud no es pot esborrar.
    expect(await falla(env.DB.prepare("UPDATE sollicituds SET rebuda_el = ? WHERE id = ?").bind(ARA, sollicitud).run()))
      .toMatch(/camp_immutable/);
    expect(await falla(env.DB.prepare("DELETE FROM sollicituds WHERE id = ?").bind(sollicitud).run()))
      .toMatch(/sollicitud_no_esborrable/);
  });

  it("el registre d'auditoria i l'historial no es poden modificar ni esborrar", async () => {
    const { repos, casal } = await crearEscenari();
    await repos.auditoria.registrar(
      { casal_id: casal.id, usuari_id: null, tipus_operacio: "prova", entitat: "casal", entitat_id: casal.id, resultat: "exit" },
      ARA,
    );
    expect(await falla(env.DB.prepare("UPDATE registres_auditoria SET resultat = 'error'").run())).toMatch(/auditoria_inalterable/);
    expect(await falla(env.DB.prepare("DELETE FROM registres_auditoria").run())).toMatch(/auditoria_inalterable/);
  });

  it("només permet una adjudicació confirmada per cicle", async () => {
    const { cicle, casal } = await crearEscenari();
    const config = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO configuracions_adjudicacio (id, cicle_id, versio, parametres, creat_el) VALUES (?, ?, 1, '{}', ?)",
    ).bind(config, cicle.id, ARA).run();
    const insereix = (versio: number) =>
      env.DB.prepare(
        `INSERT INTO execucions_adjudicacio (id, casal_id, cicle_id, configuracio_id, versio, estat, executada_el)
         VALUES (?, ?, ?, ?, ?, 'confirmada', ?)`,
      ).bind(crypto.randomUUID(), casal.id, cicle.id, config, versio, ARA).run();
    await insereix(1);
    expect(await falla(insereix(2))).toMatch(/UNIQUE/i);
  });

  it("les assignacions de rol respecten l'abast", async () => {
    const { casal } = await crearEscenari();
    const usuari = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO usuaris (id, email, nom_visible, proveidor_identitat, creat_el, actualitzat_el)
       VALUES (?, ?, 'Usuari de prova', 'dev', ?, ?)`,
    ).bind(usuari, `${usuari}@exemple.invalid`, ARA, ARA).run();
    const assigna = (rol: string, casalId: string | null) =>
      env.DB.prepare(
        "INSERT INTO assignacions_rols (id, usuari_id, rol_codi, casal_id, atorgat_el) VALUES (?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), usuari, rol, casalId, ARA).run();
    expect(await falla(assigna("gestor_casal", null))).toMatch(/assignacio_abast_incoherent/);
    expect(await falla(assigna("admin_central", casal.id))).toMatch(/assignacio_abast_incoherent/);
    await assigna("gestor_casal", casal.id);
    expect(await falla(assigna("gestor_casal", casal.id))).toMatch(/UNIQUE/i);
  });
});
