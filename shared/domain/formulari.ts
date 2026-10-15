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

/**
 * Camps que no es poden desactivar: nom i primer cognom identifiquen la sol·licitud,
 * i la data de naixement determina si cal l'autorització d'un tutor (decisió de 2026-10-15).
 */
export const CAMPS_SEMPRE_OBLIGATORIS: CampPersonal[] = ["nom", "cognom1", "data_naixement"];

/** Edat a partir de la qual no cal l'autorització del pare, mare o tutor. */
export const MAJORIA_EDAT = 18;

/** Edat en anys complerts en una data (AAAA-MM-DD). */
export function edatEnData(naixement: string, data: string): number {
  const [an, mn, dn] = naixement.split("-").map(Number) as [number, number, number];
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return a - an - (m < mn || (m === mn && d < dn) ? 1 : 0);
}

export const esMenorEnData = (naixement: string, data: string) => edatEnData(naixement, data) < MAJORIA_EDAT;

/**
 * Text provisional de protecció de dades (petició de 2026-10-15): es mostra mentre
 * el cicle no tingui el text definitiu, que ha de redactar o validar el responsable del tractament.
 */
export const TEXT_PRIVACITAT_PROVA = [
  "TEXT DE PROVA. Aquest text s'ha de substituir per la informació definitiva sobre protecció de dades.",
  "Les dades que ens faciliteu s'utilitzaran només per gestionar la inscripció a les activitats del casal.",
].join("\n\n");

/** Text de protecció de dades que veu la persona: el del cicle o, si no n'hi ha, el de prova. */
export const textPrivacitatPublic = (config: ConfiguracioFormulari) => config.informacio_privacitat || TEXT_PRIVACITAT_PROVA;

export interface ConfigCamp {
  actiu: boolean;
  obligatori: boolean;
}

export type ConfiguracioFormulari = {
  camps: Record<CampPersonal, ConfigCamp>;
  /**
   * Informació de protecció de dades que es mostra a la persona sol·licitant i
   * que ha d'acceptar. La redacta i valida el responsable del tractament; mentre
   * sigui buida, el formulari públic no accepta sol·licituds.
   */
  informacio_privacitat: string;
};

export const MIDA_MAXIMA_PRIVACITAT = 8000;

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
  const text = desada && typeof desada === "object" ? (desada as { informacio_privacitat?: unknown }).informacio_privacitat : undefined;
  return { camps, informacio_privacitat: typeof text === "string" ? text.trim() : "" };
}

export type DadesPersonals = Partial<Record<CampPersonal, string | null>>;

/**
 * Comprova les dades personals contra la configuració del cicle: els camps
 * obligatoris han de tenir valor i els camps no actius no es poden enviar
 * (minimització: no es desa res que el cicle no demani).
 * Retorna un mapa camp → missatge; buit si tot és correcte.
 */
export function errorsDadesSegonsConfiguracio(dades: DadesPersonals, config: ConfiguracioFormulari): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const camp of CAMPS_PERSONALS) {
    const valor = dades[camp];
    const teValor = typeof valor === "string" && valor.trim() !== "";
    const { actiu, obligatori } = config.camps[camp];
    if (!actiu && teValor) errors[camp] = "Aquest camp no es demana en aquest cicle.";
    else if (obligatori && !teValor) errors[camp] = "Aquest camp és obligatori.";
  }
  return errors;
}
