/**
 * Camps personals configurables del formulari d'inscripció.
 * Per defecte només es demanen nom i primer cognom (minimització de dades);
 * la resta s'han d'activar expressament per a cada cicle amb autorització.
 */
export const CAMPS_PERSONALS = [
  "nom", "cognom1", "cognom2", "data_naixement", "document_identitat", "telefon", "email",
  "adreca", "codi_postal", "municipi", "lloc_naixement", "barri",
] as const;

export type CampPersonal = (typeof CAMPS_PERSONALS)[number];

export const ETIQUETES_CAMPS: Record<CampPersonal, string> = {
  nom: "Nom",
  cognom1: "Primer cognom",
  cognom2: "Segon cognom",
  data_naixement: "Data de naixement",
  document_identitat: "DNI/NIE",
  telefon: "Telèfon",
  email: "Correu electrònic",
  adreca: "Adreça",
  codi_postal: "Codi postal",
  municipi: "Municipi",
  lloc_naixement: "Lloc de naixement",
  barri: "Barri o districte",
};

/** Camps que no es poden desactivar perquè identifiquen la sol·licitud. */
export const CAMPS_SEMPRE_OBLIGATORIS: CampPersonal[] = ["nom", "cognom1"];

export interface ConfigCamp {
  actiu: boolean;
  obligatori: boolean;
}

export type ConfiguracioFormulari = { camps: Record<CampPersonal, ConfigCamp> };

export function configuracioFormulariEfectiva(desada: unknown): ConfiguracioFormulari {
  const camps = {} as Record<CampPersonal, ConfigCamp>;
  const origen = (desada && typeof desada === "object" ? (desada as { camps?: Record<string, Partial<ConfigCamp>> }).camps : undefined) ?? {};
  for (const camp of CAMPS_PERSONALS) {
    if (CAMPS_SEMPRE_OBLIGATORIS.includes(camp)) {
      camps[camp] = { actiu: true, obligatori: true };
      continue;
    }
    const actiu = origen[camp]?.actiu === true;
    camps[camp] = { actiu, obligatori: actiu && origen[camp]?.obligatori === true };
  }
  return { camps };
}
