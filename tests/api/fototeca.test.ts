import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

/** Capçalera JPEG mínima (n'hi ha prou per a la comprovació de signatura); el contingut canvia amb `n`. */
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, n, 0xff, 0xd9]);

async function escenari() {
  const e = await crearEscenari();
  const altre = await crearEscenari();
  const difusio = await clientAutenticat("difusio_casal", e.casal.id);
  const conserge = await clientAutenticat("conserge", e.casal.id);
  const base = `/api/gestio/casals/${e.casal.id}/cartells`;
  const puja = async (us: "fotografia" | "previsualitzacio", n: number, ruta = base, c = difusio) =>
    (await c.json(`${ruta}/fitxers?us=${us}&nom=foto-${n}.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg(n) })).cos.fitxer.id as string;
  const afegeix = async (n: number, carpeta: string, c = difusio, ruta = base) => {
    const foto = { fitxer_id: await puja("fotografia", n, ruta, c), miniatura_id: await puja("previsualitzacio", n + 100, ruta, c), carpeta, nom: `foto-${n}`, amplada: 3000, alcada: 2000 };
    return c.json(`${ruta}/fotos`, { method: "POST", json: foto });
  };
  return { ...e, altre, difusio, conserge, base, puja, afegeix };
}

describe("fototeca de PG-Cartells", () => {
  it("afegeix les fotos amb la carpeta, no les repeteix i les retira sense esborrar el fitxer", async () => {
    const { difusio, base, afegeix, casal } = await escenari();
    const a = await afegeix(1, "Tardor 2026/Ioga/");
    expect(a.status).toBe(201);
    expect(a.cos.foto).toMatchObject({ carpeta: "Tardor 2026/Ioga", nom: "foto-1", casal_id: casal.id });
    expect((await afegeix(2, "Tardor 2026\\Teatre")).cos.foto.carpeta).toBe("Tardor 2026/Teatre");
    // La mateixa foto pujada una altra vegada (una carpeta repetida) no es duplica.
    const repetida = await afegeix(1, "Una altra carpeta");
    expect(repetida.status).toBe(200);
    expect(repetida.cos.existent).toBe(true);

    const llista = await difusio.json(`${base}/fotos`);
    expect(llista.cos.fotos.map((f: any) => f.carpeta)).toEqual(["Tardor 2026/Ioga", "Tardor 2026/Teatre"]);

    const id = a.cos.foto.id;
    expect((await difusio.json(`${base}/fotos/${id}`, { method: "DELETE", json: {} })).status).toBe(200);
    expect((await difusio.json(`${base}/fotos`)).cos.fotos).toHaveLength(1);
    // El fitxer continua existint: els materials ja fets no canvien.
    expect((await difusio.peticio(`${base}/fitxers/${a.cos.foto.fitxer_id}`)).status).toBe(200);
    const auditoria = await env.DB.prepare("SELECT COUNT(*) AS n FROM registres_auditoria WHERE tipus_operacio = 'cartells.foto_retirada' AND entitat_id = ?").bind(id).first<{ n: number }>();
    expect(auditoria!.n).toBe(1);
  });

  it("comprova els permisos i que els fitxers siguin del mateix casal", async () => {
    const { conserge, difusio, base, altre, puja } = await escenari();
    // El conserge no té accés a PG-Cartells.
    expect((await conserge.json(`${base}/fotos`)).status).toBe(403);
    // Un fitxer d'un altre casal no es pot registrar a la fototeca d'aquest.
    const difusioAltre = await clientAutenticat("difusio_casal", altre.casal.id);
    const baseAltre = `/api/gestio/casals/${altre.casal.id}/cartells`;
    const fitxerAltre = await puja("fotografia", 7, baseAltre, difusioAltre);
    const miniatura = await puja("previsualitzacio", 8);
    const r = await (await clientAutenticat("difusio_casal", altre.casal.id)).json(`${base}/fotos`, {
      method: "POST", json: { fitxer_id: fitxerAltre, miniatura_id: miniatura, nom: "x" },
    });
    expect(r.status).toBe(403);
    const creuat = await difusio.json(`${base}/fotos`, { method: "POST", json: { fitxer_id: fitxerAltre, miniatura_id: miniatura, nom: "x" } });
    expect(creuat.status).toBe(400);
    // Les fotos d'un altre casal no es veuen.
    expect((await difusioAltre.json(`${baseAltre}/fotos`)).cos.fotos).toHaveLength(0);
  });
});
