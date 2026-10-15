import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

// Totes les dades són fictícies.
const USUARI = {
  document: "00000001R", tipus_document: "NIF/NIE", nom: "Laia", cognom1: "Fictícia", cognom2: "Prova",
  data_naixement: "02/03/1950", localitat_naixement: "Úbeda", genere: "Dona", telefon_mobil: "600 000 001",
  email: "laia@exemple.invalid", nom_via: "Carrer Inventat", municipi: "Municipi fictici", aut_imatges: "Sí",
};

async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const base = `/api/gestio/casals/${e.casal.id}/persones-plataforma`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const importa = (files: Record<string, string>[], origen = "usuaris", c = g) =>
    c.json(`${base}/importacio`, { method: "POST", json: { origen, primera_fila: 2, files } });
  const cerca = (q: string, camp = "tots", c = g) => c.json(`${base}?q=${encodeURIComponent(q)}&camp=${camp}`);
  return { ...e, base, g, importa, cerca };
}

describe("buscar usuari/a (persones de la PGEc)", () => {
  it("importa, completa amb el llistat de carnets i cerca per qualsevol camp", async () => {
    const { importa, cerca } = await escenari();
    const r = await importa([USUARI, { nom: "Sense", cognom1: "Identificar" }, { nom: "Pau", cognom1: "Inventat", data_naixement: "1960-01-01" }]);
    expect(r.status).toBe(200);
    expect(r.cos).toMatchObject({ creades: 2, actualitzades: 0, sense_canvis: 0 });
    expect(r.cos.omeses).toEqual([{ fila: 3, motiu: expect.any(String) }]);

    // Tornar a importar el mateix no canvia res.
    expect((await importa([USUARI])).cos).toMatchObject({ creades: 0, actualitzades: 0, sense_canvis: 1 });

    // El llistat de carnets completa la mateixa persona (mateix document escrit diferent) sense esborrar res.
    const c = await importa([{ document: "00000001-r", numero_soci: "001/00000001R", tipus_carnet: "Carnet fictici", telefon_mobil: "" }], "carnets");
    expect(c.cos).toMatchObject({ creades: 0, actualitzades: 1 });

    for (const q of ["ubeda", "laia ficticia", "02/03/1950", "00000001R", "600 000 001", "001/00000001R"]) {
      const res = await cerca(q);
      expect(res.status, q).toBe(200);
      expect(res.cos.persones.map((p: { nom: string }) => p.nom), q).toEqual(["Laia"]);
    }
    const laia = (await cerca("ubeda")).cos.persones[0];
    expect(laia.document).toBe("•••••001R");
    expect(laia.origens).toEqual(["carnets", "usuaris"]);
    expect(laia.coincidencies).toContain("Localitat de naixement");
    expect((await cerca("ubeda", "nom")).cos.persones).toEqual([]);
    expect((await cerca("ubeda", "localitat_naixement")).cos.total).toBe(1);
    expect((await cerca("inventat")).cos.persones.map((p: { nom: string }) => p.nom).sort()).toEqual(["Laia", "Pau"]);
  });

  it("sense permís de contacte: ni telèfon, ni adreça, ni cerca per telèfon, ni importació", async () => {
    const { importa, cerca, base, casal } = await escenari();
    await importa([USUARI]);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    const r = await cerca("laia", "tots", consulta);
    expect(r.status).toBe(200);
    expect(r.cos.persones[0].telefon).toBeNull();
    expect((await cerca("600000001", "tots", consulta)).cos.persones).toEqual([]);
    expect((await cerca("600000001", "telefon_mobil", consulta)).status).toBe(403);
    const fitxa = await consulta.json(`${base}/${r.cos.persones[0].id}`);
    const camps = fitxa.cos.grups.flatMap((g: { camps: { camp: string }[] }) => g.camps.map((x) => x.camp));
    expect(camps).toContain("localitat_naixement");
    expect(camps).not.toContain("telefon_mobil");
    expect(camps).not.toContain("nom_via");
    expect(fitxa.cos.dades_restringides).toBe(true);
    expect((await importa([USUARI], "usuaris", consulta)).status).toBe(403);
    // Un altre casal no hi té accés.
    const altre = await crearEscenari();
    const g2 = await clientAutenticat("gestor_casal", altre.casal.id);
    expect((await g2.json(`${base}?q=laia`)).status).toBe(403);
  });

  it("la fitxa mostra totes les dades amb el document emmascarat i les inscripcions a l'aplicació", async () => {
    const { importa, cerca, base, g, casal, cicle, activa } = await escenari();
    await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify({
      informacio_privacitat: "Text de prova fictici.", camps: { document_identitat: { actiu: true, obligatori: false } },
    }), cicle.id).run();
    const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
    const s = await publica.json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { nom: "Laia", cognom1: "Fictícia", data_naixement: "1950-03-02", document_identitat: "00000001 R" },
        preferencies: [{ activitat_id: activa.id, ordre: 1 }], acceptacio_privacitat: true },
    });
    expect(s.status).toBe(201);
    await importa([USUARI]);
    const id = (await cerca("laia")).cos.persones[0].id;
    const f = await g.json(`${base}/${id}`);
    expect(f.status).toBe(200);
    const valors = Object.fromEntries(f.cos.grups.flatMap((gr: { camps: { camp: string; valor: string }[] }) => gr.camps.map((x) => [x.camp, x.valor])));
    expect(valors).toMatchObject({ document: "•••••001R", data_naixement: "1950-03-02", telefon_mobil: "600 000 001", nom_via: "Carrer Inventat" });
    expect(f.cos.participacio).toHaveLength(1);
    expect(f.cos.participacio[0]).toMatchObject({ cicle: "Cicle fictici", activitats: [{ activitat: "Taller fictici", preferencia: 1, estat: null }] });
  });
});
