import { describe, expect, it } from "vitest";
import {
  campCoincideix, clauPersona, interpretaCerca, netejaFilaPersona, proposaMapatgePersones, textCerca,
} from "../../shared/domain/persones-plataforma";

// Capçaleres dels llistats de la PGEc (només els noms de les columnes; cap dada real).
const USUARIS = ["DOCUMENT", "TIPUS DOCUMENT", "NOM", "COGNOM1", "COGNOM2", "EQUIPAMENT CÍVIC ASSIGNAT", "EQUIPAMENT CÍVIC ACTIVITAT",
  "GENERE", "DATA NAIXEMENT", "TELÈFON FIX", "TELÈFON MÒBIL", "TELÈFON OPCIONAL", "EMAIL", "DATA ALTA", "NOM SENTIT",
  "LOCALITAT DE NAIXEMENT", "REPRESENTANT LEGAL", "TIPUS DE LA VIA", "NOM DE LA VIA", "NÚMERO", "BLOC", "ESCALA", "PIS", "PORTA",
  "CODI POSTAL", "MUNICIPI", "TELÈFON URGÈNCIA", "PERSONA URGÈNCIA", "AUT. REGISTRAR IMATGES", "AUT. INFORMAR ACTIVITATS",
  "NOM TUTOR LEGAL", "COGNOM1 TUTOR LEGAL", "COGNOM2 TUTOR LEGAL", "DOCUMENT TUTOR LEGAL", "TELÈFON TUTOR LEGAL", "EMAIL TUTOR LEGAL",
  "TELÈFON URGÈNCIA TUTOR LEGAL", "PERSONA URGÈNCIA TUTOR LEGAL", "TIPUS DE LA VIA TUTOR", "NOM DE LA VIA TUTOR", "NÚMERO TUTOR",
  "BLOC TUTOR", "ESCALA TUTOR", "PIS TUTOR", "PORTA TUTOR", "CODI POSTAL TUTOR", "MUNICIPI TUTOR",
  "AUT. REGISTRAR IMATGES TUTOR LEGAL", "AUT. INFORMAR ACTIVITATS TUTOR LEGAL"];
const CARNETS = ["Tipus de carnet", "Tipus de document", "Document", "Equipament cívic", "Número de soci", "Nom", "Primer cognom",
  "Segon cognom", "Data de naixement", "Telèfon fix", "Telèfon mòbil", "Telèfon opcional", "Correu electrònic", "Data d'alta",
  "Data de caducitat", "Tipus de via", "Nom de la via", "Número", "Bloc", "Escala", "Pis", "Porta", "Codi postal", "Municipi"];

describe("persones de la PGEc", () => {
  it("reconeix totes les columnes del llistat d'usuaris", () => {
    const m = proposaMapatgePersones(USUARIS);
    expect(m.filter((x) => !x)).toEqual([]);
    expect(new Set(m).size).toBe(USUARIS.length);
    expect(m[USUARIS.indexOf("DATA ALTA")]).toBe("data_alta");
    expect(m[USUARIS.indexOf("LOCALITAT DE NAIXEMENT")]).toBe("localitat_naixement");
    expect(m[USUARIS.indexOf("NÚMERO TUTOR")]).toBe("tutor_numero");
  });

  it("reconeix totes les columnes del llistat de carnets i hi distingeix la data d'alta del carnet", () => {
    const m = proposaMapatgePersones(CARNETS);
    expect(m.filter((x) => !x)).toEqual([]);
    expect(m[CARNETS.indexOf("Data d'alta")]).toBe("data_alta_carnet");
    expect(m[CARNETS.indexOf("Equipament cívic")]).toBe("equipament_carnet");
    expect(m[CARNETS.indexOf("Número de soci")]).toBe("numero_soci");
    expect(m[CARNETS.indexOf("Número")]).toBe("numero");
  });

  it("neteja les files, converteix les dates i identifica la persona", () => {
    const d = netejaFilaPersona({ nom: "  Pere ", cognom1: "Prova", data_naixement: "02/03/1950", desconegut: "x", email: "" });
    expect(d).toEqual({ nom: "Pere", cognom1: "Prova", data_naixement: "1950-03-02" });
    expect(clauPersona(d)?.clau).toMatch(/^N:/);
    expect(clauPersona({ ...d, document: "00000000-t" })).toEqual({ clau: "D:00000000T", per_document: true });
    expect(clauPersona({ nom: "Pere" })).toBeNull();
  });

  it("interpreta la cerca: dates, documents, telèfons i paraules", () => {
    expect(interpretaCerca("02/03/1950")).toEqual({ paraules: [], data_naixement: "1950-03-02" });
    expect(interpretaCerca("00000000-T")).toEqual({ paraules: ["00000000t"], data_naixement: null });
    expect(interpretaCerca("600 00 00 01")).toEqual({ paraules: ["600000001"], data_naixement: null });
    expect(interpretaCerca("Núria  Fictícia 01/01/1940")).toEqual({ paraules: ["nuria", "ficticia"], data_naixement: "1940-01-01" });
    expect(interpretaCerca("  ")).toBeNull();
  });

  it("separa el text de cerca per nivell i troba coincidències per camp", () => {
    const d = { nom: "Laia", cognom1: "Ficticia", localitat_naixement: "Úbeda", telefon_mobil: "600 00 00 01", document: "00000000T" };
    expect(textCerca(d, "basic")).toContain("ubeda");
    expect(textCerca(d, "basic")).toContain("00000000t");
    expect(textCerca(d, "basic")).not.toContain("600000001");
    expect(textCerca(d, "contacte")).toContain("600000001");
    expect(campCoincideix(d, "localitat_naixement", { paraules: ["ubeda"], data_naixement: null })).toBe(true);
    expect(campCoincideix(d, "nom", { paraules: ["ubeda"], data_naixement: null })).toBe(false);
  });
});
