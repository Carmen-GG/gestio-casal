/**
 * Preparació de les fotos de la fototeca al navegador: es redueixen abans de pujar-les
 * (n'hi ha prou per a un cartell A4) i se'n fa una miniatura per a la galeria.
 */
const COSTAT_FOTO = 3000;
const COSTAT_MINIATURA = 360;

export const TIPUS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function esFoto(f: File) {
  return f.type ? TIPUS_FOTO.includes(f.type) : /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
}

/** Carpeta d'una foto dins de la carpeta pujada («Fotos/Tardor/Ioga/1.jpg» → «Fotos/Tardor/Ioga»). */
export function carpetaDe(f: File): string {
  const cami = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  const parts = cami.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

async function aJpeg(mapa: ImageBitmap, costat: number, qualitat: number) {
  const escala = Math.min(1, costat / Math.max(mapa.width, mapa.height));
  const llenc = document.createElement("canvas");
  llenc.width = Math.max(1, Math.round(mapa.width * escala));
  llenc.height = Math.max(1, Math.round(mapa.height * escala));
  const ctx = llenc.getContext("2d")!;
  ctx.fillStyle = "#fff"; // les PNG transparents no queden negres
  ctx.fillRect(0, 0, llenc.width, llenc.height);
  ctx.drawImage(mapa, 0, 0, llenc.width, llenc.height);
  const blob = await new Promise<Blob>((resolt, rebutja) =>
    llenc.toBlob((b) => (b ? resolt(b) : rebutja(new Error("No s'ha pogut preparar la foto."))), "image/jpeg", qualitat));
  return { blob, amplada: llenc.width, alcada: llenc.height };
}

export async function preparaFoto(f: File) {
  let mapa: ImageBitmap;
  try {
    mapa = await createImageBitmap(f, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No s'ha pogut llegir la foto (format no compatible amb aquest navegador).");
  }
  try {
    const foto = await aJpeg(mapa, COSTAT_FOTO, 0.88);
    const miniatura = await aJpeg(mapa, COSTAT_MINIATURA, 0.8);
    return { foto: foto.blob, miniatura: miniatura.blob, amplada: foto.amplada, alcada: foto.alcada };
  } finally {
    mapa.close();
  }
}
