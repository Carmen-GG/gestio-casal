/**
 * Lectura i previsualització de les plantilles PDF al navegador.
 * - pdf-lib llegeix els camps del formulari (AcroForm) de la plantilla original.
 * - pdf.js dibuixa la pàgina en una imatge per previsualitzar-la.
 * Les dues biblioteques es carreguen només quan cal (no pesen a la resta del panell).
 */
import type { CampPdf } from "../../shared/domain/cartells";

export interface AnalisiPlantilla {
  pagina_amplada: number;
  pagina_alcada: number;
  camps: CampPdf[];
}

function colorDeDa(da: string): [number, number, number] {
  const rgb = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const gris = /([\d.]+)\s+g(\s|$)/.exec(da);
  if (gris) return [Number(gris[1]), Number(gris[1]), Number(gris[1])];
  return [0, 0, 0];
}

const arrodoneix = (n: number) => Math.round(n * 100) / 100;

/** Llegeix la mida de la pàgina i els camps (nom, posició, lletra) d'una plantilla original. */
export async function analitzaPlantilla(bytes: ArrayBuffer): Promise<AnalisiPlantilla> {
  const { PDFDocument, PDFTextField, PDFButton } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getPageCount() !== 1) throw new Error("La plantilla ha de tenir una sola pàgina.");
  const { width, height } = doc.getPage(0).getSize();
  const camps: CampPdf[] = [];
  for (const camp of doc.getForm().getFields()) {
    const esText = camp instanceof PDFTextField;
    if (!esText && !(camp instanceof PDFButton)) continue;
    const giny = camp.acroField.getWidgets()[0];
    if (!giny) continue;
    const r = giny.getRectangle();
    const da = (esText ? camp.acroField.getDefaultAppearance() : undefined) ?? "";
    const mida = /\/[^\s]+\s+([\d.]+)\s+Tf/.exec(da)?.[1];
    camps.push({
      nom: camp.getName(),
      tipus: esText ? "text" : "imatge",
      x: arrodoneix(r.x), y: arrodoneix(r.y), amplada: arrodoneix(r.width), alcada: arrodoneix(r.height),
      mida_lletra: esText && mida ? Number(mida) : null,
      negreta: /Bold/i.test(da),
      alineacio: esText ? (camp.getAlignment() as 0 | 1 | 2) : 0,
      color: colorDeDa(da),
    });
  }
  return { pagina_amplada: arrodoneix(width), pagina_alcada: arrodoneix(height), camps };
}

/**
 * Còpia de la plantilla sense els camps del formulari. Les plantilles originals porten textos,
 * fotos i logotips d'exemple dins dels camps; així es veu només el disseny base.
 */
export async function plantillaSenseCamps(bytes: ArrayBuffer): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  for (const camp of form.getFields()) form.removeField(camp);
  return doc.save();
}

/** Dibuixa la primera pàgina d'un PDF i en retorna una imatge PNG de l'amplada indicada (en píxels). */
export async function imatgePrimeraPagina(bytes: Uint8Array | ArrayBuffer, ampladaPx: number): Promise<Blob> {
  // Versió «legacy»: inclou les adaptacions per a navegadors que no són els més recents.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: urlTreballador } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = urlTreballador;
  const dades = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  const tasca = pdfjs.getDocument({ data: dades });
  try {
    const doc = await tasca.promise;
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: ampladaPx / base.width });
    const llenc = document.createElement("canvas");
    llenc.width = Math.round(vista.width);
    llenc.height = Math.round(vista.height);
    await pagina.render({ canvas: llenc, viewport: vista }).promise;
    return await new Promise<Blob>((resolt, rebutja) =>
      llenc.toBlob((b) => (b ? resolt(b) : rebutja(new Error("No s'ha pogut crear la imatge."))), "image/png"));
  } finally {
    await tasca.destroy();
  }
}
