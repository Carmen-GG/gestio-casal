import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { CampPlantilla } from "../../shared/domain/cartells";
import { composaMaterial, cosAjustat } from "../../src/cartells/composicio";

const lletra = (pes: number) => readFile(`node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-${pes}-normal.woff`)
  .then((b) => new Uint8Array(b));

const camp = (nom: string, rol: CampPlantilla["rol"], [x, y, amplada, alcada]: number[], mida: number | null = 60): CampPlantilla => ({
  nom, rol, tipus: mida === null ? "imatge" : "text", x: x!, y: y!, amplada: amplada!, alcada: alcada!,
  mida_lletra: mida, negreta: rol === "titol_1", alineacio: 0, color: [0, 0, 0],
});

/** Plantilla sintètica A3 amb camps de formulari i un text d'exemple, com les originals. */
async function plantilla(camps: CampPlantilla[]) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([841.89, 1190.55]);
  pagina.drawRectangle({ x: 0, y: 0, width: 841.89, height: 300, color: rgb(0.9, 0.3, 0.2) });
  const form = doc.getForm();
  for (const c of camps) {
    const opcions = { x: c.x, y: c.y, width: c.amplada, height: c.alcada };
    if (c.tipus === "imatge") { form.createButton(c.nom).addToPage("", pagina, opcions); continue; }
    const f = form.createTextField(c.nom);
    f.setText("TEXT D'EXEMPLE");
    f.addToPage(pagina, opcions);
  }
  return doc.save();
}

async function textDelPdf(pdf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tasca = pdfjs.getDocument({ data: pdf.slice() });
  const contingut = await (await (await tasca.promise).getPage(1)).getTextContent();
  await tasca.destroy();
  return contingut.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

describe("composició dels materials", () => {
  const camps = [
    camp("Titular linia 1", "titol_1", [60, 900, 700, 120], 110),
    camp("Dates", "dates", [60, 820, 700, 50], 40),
    camp("Peu", "peu", [60, 40, 700, 80], 30),
    camp("Codi QR", "qr", [640, 620, 150, 150], null),
    camp("Imatge_af_image", "fotografia", [60, 320, 500, 480], null),
  ];

  it("dibuixa els textos com a text real, treu els camps i redueix a A4", async () => {
    const { pdf, avisos } = await composaMaterial({
      plantillaPdf: await plantilla(camps), camps, formatSortida: "A4",
      textos: { titol_1: "Ioga suau", dates: "Del 12 de gener al 23 de març de 2027", peu: "Casal Cívic i Comunitari\nC. Exemple, 1 · Terrassa" },
      urlQr: "https://casal.example/inscripcio/CAN-BOADA/abc",
      lletres: { regular: await lletra(400), negreta: await lletra(700) },
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(doc.getForm().getFields()).toHaveLength(0);
    const text = await textDelPdf(pdf);
    expect(text).toContain("Ioga suau");
    expect(text).toContain("Del 12 de gener al 23 de març de 2027");
    expect(text).toContain("C. Exemple, 1 · Terrassa");
    expect(text).not.toContain("TEXT D'EXEMPLE");
    // Sense fotografia s'avisa; el QR té adreça i no avisa.
    expect(avisos.map((a) => a.rol)).toEqual(["fotografia"]);
  });

  it("avisa quan un text s'ha de reduir massa o porta caràcters que la lletra no té", async () => {
    const { avisos } = await composaMaterial({
      plantillaPdf: await plantilla(camps), camps, formatSortida: "A3",
      textos: { titol_1: "Un títol llarguíssim que no cap de cap manera a la línia del cartell", dates: "Dates ✓" },
      lletres: { regular: await lletra(400), negreta: await lletra(700) },
    });
    expect(avisos.find((a) => a.rol === "titol_1")?.missatge).toMatch(/reduir/);
    expect(avisos.find((a) => a.rol === "dates")?.missatge).toMatch(/✓/);
    expect(avisos.find((a) => a.rol === "qr")).toBeDefined();
  });

  it("el cos de lletra no supera mai el de la plantilla i fa cabre totes les línies", () => {
    expect(cosAjustat({ amplades: [2], alcadaLletra: 0.7, amplada: 1000, alcada: 1000, cos: 40 })).toBe(40);
    expect(cosAjustat({ amplades: [10], alcadaLletra: 0.7, amplada: 204, alcada: 1000, cos: 40 })).toBe(20);
    const dues = cosAjustat({ amplades: [1, 1], alcadaLletra: 0.7, amplada: 1000, alcada: 64, cos: 100 });
    expect(dues).toBeCloseTo(60 / (0.7 + 1.15));
  });
});
