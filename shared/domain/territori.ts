/**
 * Territori, referents i incidències (petició de 2026-10-16): el quadre de comandament de la
 * superadministració filtra per casal, comarca, demarcació o referent.
 */
export const DEMARCACIONS = ["Barcelona", "Catalunya Central", "Girona", "Lleida", "Tarragona", "Terres de l'Ebre"] as const;

export const CATEGORIES_INCIDENCIA = ["instal·lacions", "convivencia", "salut", "tallerista", "activitat", "plataforma", "altres"] as const;
export type CategoriaIncidencia = (typeof CATEGORIES_INCIDENCIA)[number];

export const ETIQUETES_CATEGORIA_INCIDENCIA: Record<CategoriaIncidencia, string> = {
  "instal·lacions": "Instal·lacions i equipaments",
  convivencia: "Convivència",
  salut: "Salut o accident",
  tallerista: "Tallerista",
  activitat: "Activitat",
  plataforma: "Plataforma (aplicació)",
  altres: "Altres",
};
