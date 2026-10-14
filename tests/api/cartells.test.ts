import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

// Fitxers mínims: només la signatura i uns quants bytes. Cap contingut real.
const PDF = new TextEncoder().encode("%PDF-1.7\n% plantilla de prova\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const camp = (nom: string, rol: string | null, tipus: "text" | "imatge" = "text") => ({
  nom, tipus, x: 10, y: 10, amplada: 100, alcada: 20, mida_lletra: tipus === "text" ? 30 : null,
  negreta: false, alineacio: 0, color: [0, 0, 0], rol,
});

const plantilla = (fitxer_id: string) => ({
  fitxer_id, nom: "Cartell · tardor · títol d'1 línia", tipus: "cartell", estacio: "tardor", linies_titol: 1, amb_qr: false,
  pagina_amplada: 841.89, pagina_alcada: 1190.55, format_sortida: "A4",
  camps: [camp("Titular linia 1", "titol_1"), camp("Imatge_af_image", "fotografia", "imatge"), camp("Dates", "dates")],
});

async function escenari() {
  const e = await crearEscenari();
  const altre = await crearEscenari();
  const admin = await clientAutenticat("admin_central", null);
  const difusio = await clientAutenticat("difusio_casal", e.casal.id);
  const gestor = await clientAutenticat("gestor_casal", e.casal.id);
  const base = `/api/gestio/casals/${e.casal.id}/cartells`;
  const puja = (c: typeof admin, ruta: string, us: string, cos: Uint8Array, tipus = "application/pdf", nom = "base_tardor_DSI_1L_CAR.pdf") =>
    c.json(`${ruta}?us=${us}&nom=${encodeURIComponent(nom)}`, { method: "POST", headers: { "Content-Type": tipus }, body: cos });
  return { ...e, altre, admin, difusio, gestor, base, puja };
}

describe("PG-Cartells: fitxers", () => {
  it("desa el fitxer a R2, comprova la signatura i no duplica el mateix contingut", async () => {
    const { admin, base, puja } = await escenari();
    const r = await puja(admin, `${base}/fitxers`, "plantilla", PDF);
    expect(r.status).toBe(201);
    expect(r.cos.fitxer).toMatchObject({ us: "plantilla", tipus_mime: "application/pdf", mida: PDF.byteLength });
    expect(r.cos.fitxer.clau).toBeUndefined();
    const fila = await env.DB.prepare("SELECT clau, sha256 FROM cartells_fitxers WHERE id = ?").bind(r.cos.fitxer.id).first<{ clau: string; sha256: string }>();
    const objecte = await env.FITXERS.get(fila!.clau);
    expect(new Uint8Array(await objecte!.arrayBuffer())).toEqual(PDF);

    const repetit = await puja(admin, `${base}/fitxers`, "plantilla", PDF);
    expect(repetit.status).toBe(200);
    expect(repetit.cos).toMatchObject({ existent: true, fitxer: { id: r.cos.fitxer.id } });

    // El tipus declarat ha de coincidir amb el contingut i amb l'ús.
    expect((await puja(admin, `${base}/fitxers`, "plantilla", PNG)).status).toBe(415);
    expect((await puja(admin, `${base}/fitxers`, "plantilla", PNG, "image/png")).status).toBe(415);
    expect((await puja(admin, `${base}/fitxers`, "fotografia", PDF, "image/png")).status).toBe(415);
    expect((await puja(admin, `${base}/fitxers`, "fotografia", PNG, "image/png", "foto.png")).status).toBe(201);
    expect((await puja(admin, `${base}/fitxers`, "desconegut", PDF)).status).toBe(400);

    // Els fitxers són immutables.
    await expect(env.DB.prepare("DELETE FROM cartells_fitxers WHERE id = ?").bind(r.cos.fitxer.id).run()).rejects.toThrow(/fitxer_immutable/);
  });

  it("aplica el límit de mida de cada ús encara que la petició no indiqui la mida", async () => {
    const { admin, base } = await escenari();
    const gran = new Uint8Array(2 * 1024 * 1024 + 10);
    gran.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await admin.json(`${base}/fitxers?us=logotip&nom=logo.png`, {
      method: "POST", headers: { "Content-Type": "image/png" },
      body: new ReadableStream({ start(c) { c.enqueue(gran); c.close(); } }), duplex: "half",
    } as RequestInit);
    expect(r.status).toBe(413);
    expect(r.cos.error.codi).toBe("fitxer_massa_gran");
    // Fins a 256 KB per a les peticions JSON; els fitxers tenen el seu propi límit.
    const plantilla = new Uint8Array(400 * 1024);
    plantilla.set(PDF);
    expect((await admin.json(`${base}/fitxers?us=plantilla&nom=gran.pdf`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: plantilla })).status).toBe(201);
  });

  it("comprova els permisos al servidor i no deixa veure fitxers d'un altre casal", async () => {
    const { admin, difusio, gestor, base, puja, altre } = await escenari();
    // El rol de difusió pot pujar fotografies però no plantilles; el de gestió només consulta.
    expect((await puja(difusio, `${base}/fitxers`, "plantilla", PDF)).status).toBe(403);
    expect((await puja(gestor, `${base}/fitxers`, "fotografia", PNG, "image/png")).status).toBe(403);
    const foto = await puja(difusio, `${base}/fitxers`, "fotografia", PNG, "image/png", "foto.png");
    expect(foto.status).toBe(201);
    // Recursos comuns: només l'administració central.
    expect((await puja(difusio, "/api/gestio/cartells/fitxers", "plantilla", PDF)).status).toBe(403);
    const comu = await puja(admin, "/api/gestio/cartells/fitxers", "plantilla", PDF);
    expect(comu.status).toBe(201);

    const baixa = await difusio.peticio(`${base}/fitxers/${foto.cos.fitxer.id}`);
    expect(baixa.status).toBe(200);
    expect(baixa.headers.get("Content-Type")).toBe("image/png");
    expect(baixa.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await baixa.arrayBuffer())).toEqual(PNG);
    const plantillaComuna = await difusio.peticio(`${base}/fitxers/${comu.cos.fitxer.id}`);
    expect(plantillaComuna.status).toBe(200);
    expect(plantillaComuna.headers.get("Cache-Control")).toContain("private");

    // Des d'un altre casal, el fitxer del casal no existeix; el comú sí.
    const altreAdmin = `/api/gestio/casals/${altre.casal.id}/cartells`;
    expect((await admin.peticio(`${altreAdmin}/fitxers/${foto.cos.fitxer.id}`)).status).toBe(404);
    expect((await admin.peticio(`${altreAdmin}/fitxers/${comu.cos.fitxer.id}`)).status).toBe(200);
    const aliena = await clientAutenticat("difusio_casal", altre.casal.id);
    expect((await aliena.peticio(`${base}/fitxers/${foto.cos.fitxer.id}`)).status).toBe(403);
  });
});

describe("PG-Cartells: plantilles", () => {
  it("crea una plantilla en esborrany, l'activa i només llavors la veuen els rols de consulta", async () => {
    const { admin, gestor, base, puja, altre } = await escenari();
    const f = await puja(admin, "/api/gestio/cartells/fitxers", "plantilla", PDF);
    const r = await admin.json("/api/gestio/cartells/plantilles", { method: "POST", json: plantilla(f.cos.fitxer.id) });
    expect(r.status).toBe(201);
    expect(r.cos.plantilla).toMatchObject({ casal_id: null, estat: "esborrany", tipus: "cartell", amb_qr: false, versio: 1 });
    expect(r.cos.plantilla.camps).toHaveLength(3);
    // El mateix fitxer no es pot carregar dues vegades.
    expect((await admin.json("/api/gestio/cartells/plantilles", { method: "POST", json: plantilla(f.cos.fitxer.id) })).status).toBe(409);

    expect((await gestor.json(`${base}/plantilles`)).cos.plantilles).toHaveLength(0);
    expect((await gestor.json(`${base}/plantilles/${r.cos.plantilla.id}`)).status).toBe(404);
    expect((await admin.json(`${base}/plantilles`)).cos.plantilles).toHaveLength(1);

    const activa = await admin.json(`${base}/plantilles/${r.cos.plantilla.id}`, { method: "PATCH", json: { versio: 1, estat: "activa" } });
    expect(activa.status).toBe(200);
    expect(activa.cos.plantilla).toMatchObject({ estat: "activa", versio: 2 });
    // Comuna: visible des de tots els casals.
    expect((await gestor.json(`${base}/plantilles?tipus=cartell`)).cos.plantilles).toHaveLength(1);
    expect((await gestor.json(`${base}/plantilles?tipus=instagram`)).cos.plantilles).toHaveLength(0);
    expect((await admin.json(`/api/gestio/casals/${altre.casal.id}/cartells/plantilles`)).cos.plantilles).toHaveLength(1);

    // Versió antiga: conflicte. Transició no permesa: conflicte. No es pot esborrar.
    expect((await admin.json(`${base}/plantilles/${r.cos.plantilla.id}`, { method: "PATCH", json: { versio: 1, nom: "Un altre nom" } })).status).toBe(409);
    await expect(env.DB.prepare("DELETE FROM cartells_plantilles WHERE id = ?").bind(r.cos.plantilla.id).run()).rejects.toThrow(/plantilla_no_esborrable/);

    const auditoria = await env.DB.prepare("SELECT tipus_operacio FROM registres_auditoria WHERE entitat_id = ? ORDER BY id")
      .bind(r.cos.plantilla.id).all<{ tipus_operacio: string }>();
    expect(auditoria.results.map((x) => x.tipus_operacio)).toEqual(["cartells.plantilla_creada", "cartells.plantilla_modificada"]);
  });

  it("valida els camps i no activa una plantilla sense títol ni fotografia", async () => {
    const { admin, base, puja } = await escenari();
    const f = await puja(admin, `${base}/fitxers`, "plantilla", PDF);
    const dades = plantilla(f.cos.fitxer.id);
    const repetit = { ...dades, camps: [camp("A", "titol_1"), camp("B", "titol_1")] };
    expect((await admin.json(`${base}/plantilles`, { method: "POST", json: repetit })).status).toBe(400);
    const fora = { ...dades, camps: [{ ...camp("A", "titol_1"), x: 900 }] };
    expect((await admin.json(`${base}/plantilles`, { method: "POST", json: fora })).status).toBe(400);
    expect((await admin.json(`${base}/plantilles`, { method: "POST", json: { ...dades, extra: 1 } })).status).toBe(400);

    const sensefoto = { ...dades, camps: [camp("Titular linia 1", "titol_1"), camp("Imatge_af_image", null, "imatge")] };
    const r = await admin.json(`${base}/plantilles`, { method: "POST", json: sensefoto });
    expect(r.status).toBe(201);
    expect(r.cos.plantilla.casal_id).not.toBeNull();
    const activar = await admin.json(`${base}/plantilles/${r.cos.plantilla.id}`, { method: "PATCH", json: { versio: 1, estat: "activa" } });
    expect(activar.status).toBe(409);
    expect(activar.cos.error.codi).toBe("plantilla_incompleta");
    const corregida = await admin.json(`${base}/plantilles/${r.cos.plantilla.id}`, {
      method: "PATCH", json: { versio: 1, estat: "activa", camps: [camp("Titular linia 1", "titol_1"), camp("Imatge_af_image", "fotografia", "imatge")] },
    });
    expect(corregida.status).toBe(200);
  });

  it("no deixa fer servir un fitxer d'un altre àmbit ni modificar plantilles comunes des d'un casal", async () => {
    const { admin, base, puja, casal } = await escenari();
    const delCasal = await puja(admin, `${base}/fitxers`, "plantilla", PDF);
    // Un fitxer del casal no pot ser una plantilla comuna.
    expect((await admin.json("/api/gestio/cartells/plantilles", { method: "POST", json: plantilla(delCasal.cos.fitxer.id) })).status).toBe(400);
    const comu = await puja(admin, "/api/gestio/cartells/fitxers", "plantilla", new TextEncoder().encode("%PDF-1.7\n% comuna\n"));
    const p = await admin.json("/api/gestio/cartells/plantilles", { method: "POST", json: plantilla(comu.cos.fitxer.id) });

    // Algú amb permís de plantilles només al casal no pot tocar la plantilla comuna.
    const usuari = await clientAutenticat("difusio_casal", casal.id);
    await env.DB.prepare(`INSERT INTO rols (codi, nom, descripcio, abast) VALUES ('plantilles_casal', 'Plantilles', 'Prova', 'casal')`).run();
    await env.DB.prepare(`INSERT INTO rols_permisos VALUES ('plantilles_casal', 'cartells.plantilles'), ('plantilles_casal', 'cartells.consultar')`).run();
    await env.DB.prepare("INSERT INTO assignacions_rols (id, usuari_id, rol_codi, casal_id, atorgat_el) VALUES (?, ?, 'plantilles_casal', ?, ?)")
      .bind(crypto.randomUUID(), usuari.usuari.id, casal.id, "2026-10-01T00:00:00.000Z").run();
    expect((await usuari.json(`${base}/plantilles/${p.cos.plantilla.id}`, { method: "PATCH", json: { versio: 1, nom: "Canvi" } })).status).toBe(403);
    expect((await usuari.json("/api/gestio/cartells/plantilles", { method: "POST", json: plantilla(comu.cos.fitxer.id) })).status).toBe(403);
    // Però sí que pot crear plantilles pròpies del casal.
    const propi = await puja(usuari, `${base}/fitxers`, "plantilla", new TextEncoder().encode("%PDF-1.7\n% una altra\n"));
    expect(propi.status).toBe(201);
    expect((await usuari.json(`${base}/plantilles`, { method: "POST", json: plantilla(propi.cos.fitxer.id) })).status).toBe(201);
  });
});
