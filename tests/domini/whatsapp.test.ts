import { describe, expect, it } from "vitest";
import { analitzaTelefon, enllacWhatsapp, missatgeOferta } from "../../shared/domain/whatsapp";

describe("WhatsApp: telèfons i missatge d'oferta", () => {
  it("distingeix mòbils, fixos, estrangers i números no vàlids", () => {
    expect(analitzaTelefon("600 11 22 33")).toEqual({ tipus: "mobil", internacional: "34600112233" });
    expect(analitzaTelefon("+34 711-223-344")).toEqual({ tipus: "mobil", internacional: "34711223344" });
    expect(analitzaTelefon("0034600112233")).toEqual({ tipus: "mobil", internacional: "34600112233" });
    expect(analitzaTelefon("937 00 00 00")).toEqual({ tipus: "fix", internacional: null });
    expect(analitzaTelefon("+34 837000000")).toEqual({ tipus: "fix", internacional: null });
    expect(analitzaTelefon("+33 6 12 34 56 78")).toEqual({ tipus: "estranger", internacional: "33612345678" });
    expect(analitzaTelefon(null)).toEqual({ tipus: "sense", internacional: null });
    expect(analitzaTelefon("  ")).toEqual({ tipus: "sense", internacional: null });
    expect(analitzaTelefon("60011")).toEqual({ tipus: "invalid", internacional: null });
    expect(analitzaTelefon("500112233")).toEqual({ tipus: "invalid", internacional: null });
  });

  it("prepara el missatge amb l'activitat, l'horari i l'aula, i l'enllaç a wa.me", () => {
    const text = missatgeOferta({ nom: "Núria", casal: "Casal de prova", activitat: "Ioga", horari: "dl, dc · 10:00–11:30", espai: "2", data_inici: "2026-10-05" });
    expect(text).toContain("Hola, Núria!");
    expect(text).toContain("«Ioga» (dl, dc · 10:00–11:30, aula 2, a partir del 05/10/2026)");
    expect(text).toContain("llista d'espera");
    const url = enllacWhatsapp("34600112233", text);
    expect(url.startsWith("https://wa.me/34600112233?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1]!)).toBe(text);
  });
});
