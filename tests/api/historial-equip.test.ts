import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

type Periode = { usuari_id: string; email: string; rol_codi: string; atorgat_el: string; revocat_el: string | null; motiu: string | null };

describe("historial de l'equip del casal", () => {
  it("guarda cada període d'una persona que es dona d'alta i de baixa diverses vegades", async () => {
    const { casal } = await crearEscenari();
    const g = await clientAutenticat("responsable_casal", casal.id);
    const base = `/api/gestio/casals/${casal.id}/usuaris`;
    const email = `conserge-${crypto.randomUUID()}@exemple.invalid`;

    for (const motiu of ["Fi del contracte", "Canvi de torn"]) {
      const alta = await g.json(base, { method: "POST", json: { email, nom_visible: "Conserge fictícia", rol_codi: "conserge" } });
      expect(alta.status).toBe(201);
      expect((await g.json(`${base}/${alta.cos.assignacio.id}/revocar`, { method: "POST", json: { motiu } })).status).toBe(200);
    }
    expect((await g.json(base, { method: "POST", json: { email, nom_visible: "Conserge fictícia", rol_codi: "conserge" } })).status).toBe(201);

    const h = await g.json(`${base}/historial`);
    expect(h.status).toBe(200);
    const propis = (h.cos.historial as Periode[]).filter((p) => p.email === email);
    expect(propis).toHaveLength(3);
    expect(propis.filter((p) => p.revocat_el === null)).toHaveLength(1);
    expect(propis.filter((p) => p.revocat_el).map((p) => p.motiu).sort()).toEqual(["Canvi de torn", "Fi del contracte"]);
    // L'equip actual només té el període vigent.
    const actual = (await g.json(base)).cos.assignacions as { email: string }[];
    expect(actual.filter((a) => a.email === email)).toHaveLength(1);

    // La conserge no pot veure l'historial.
    const conserge = await clientAutenticat("conserge", casal.id);
    expect((await conserge.json(`${base}/historial`)).status).toBe(403);
  });
});
