/**
 * Generació de materials al navegador: carrega la lletra, prepara les imatges triades
 * i fa el PDF (cartell) o la imatge PNG (Instagram) a partir de la plantilla.
 */
import urlRegular from "@fontsource/roboto-condensed/files/roboto-condensed-latin-400-normal.woff?url";
import urlNegreta from "@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff?url";
import { composaMaterial, type EntradaComposicio, type ImatgeMaterial } from "./composicio";
import { imatgePrimeraPagina } from "./pdf";

export type { AvisMaterial, ImatgeMaterial } from "./composicio";

/** Amplada en píxels de les imatges per a Instagram. */
export const AMPLADA_INSTAGRAM = 1080;
/** Costat màxim de les fotografies dins del material (prou per imprimir un A4 a bona qualitat). */
const COSTAT_MAXIM_FOTO = 3000;

let lletres: Promise<EntradaComposicio["lletres"]> | null = null;
function carregaLletres() {
  lletres ??= Promise.all([urlRegular, urlNegreta].map(async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("No s'ha pogut carregar la lletra dels materials.");
    return new Uint8Array(await r.arrayBuffer());
  })).then(([regular, negreta]) => ({ regular: regular!, negreta: negreta! }));
  lletres.catch(() => { lletres = null; });
  return lletres;
}

/**
 * Prepara una imatge triada per la persona: aplica l'orientació de la càmera, la redueix si és
 * molt gran i la converteix a JPEG (fotografies) o PNG (logotips, per conservar la transparència).
 */
export async function preparaImatge(fitxer: Blob, tipus: "fotografia" | "logotip"): Promise<ImatgeMaterial> {
  let mapa: ImageBitmap;
  try {
    mapa = await createImageBitmap(fitxer, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No s'ha pogut llegir la imatge. Feu servir una fotografia JPEG o PNG.");
  }
  try {
    const escala = Math.min(1, COSTAT_MAXIM_FOTO / Math.max(mapa.width, mapa.height));
    const llenc = document.createElement("canvas");
    llenc.width = Math.max(1, Math.round(mapa.width * escala));
    llenc.height = Math.max(1, Math.round(mapa.height * escala));
    llenc.getContext("2d")!.drawImage(mapa, 0, 0, llenc.width, llenc.height);
    const mime = tipus === "fotografia" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob>((resolt, rebutja) =>
      llenc.toBlob((b) => (b ? resolt(b) : rebutja(new Error("No s'ha pogut preparar la imatge."))), mime, 0.9));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), tipus: tipus === "fotografia" ? "jpeg" : "png" };
  } finally {
    mapa.close();
  }
}

export async function generaMaterial(e: Omit<EntradaComposicio, "lletres">) {
  return composaMaterial({ ...e, lletres: await carregaLletres() });
}

/** Imatge PNG de la primera pàgina (per a Instagram o per a la previsualització). */
export function imatgeMaterial(pdf: Uint8Array, ampladaPx: number): Promise<Blob> {
  return imatgePrimeraPagina(pdf, ampladaPx);
}
