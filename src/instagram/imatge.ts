/** Instagram només accepta JPEG: es converteix la imatge generada (PNG) amb fons blanc. */
export async function imatgeJpeg(imatge: Blob, qualitat = 0.92): Promise<Blob> {
  const mapa = await createImageBitmap(imatge);
  try {
    const llenc = document.createElement("canvas");
    llenc.width = mapa.width;
    llenc.height = mapa.height;
    const ctx = llenc.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, llenc.width, llenc.height);
    ctx.drawImage(mapa, 0, 0);
    return await new Promise<Blob>((resolt, rebutja) =>
      llenc.toBlob((b) => (b ? resolt(b) : rebutja(new Error("No s'ha pogut preparar la imatge per a Instagram."))), "image/jpeg", qualitat));
  } finally {
    mapa.close();
  }
}
