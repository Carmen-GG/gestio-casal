/**
 * Menú del panell d'un casal (estructura demanada per la coordinació, 2026-10-15).
 * - `seccio`: secció de la pàgina del cicle; es va al cicle en curs (o se'n tria un).
 * - `ruta`: pàgina del casal.
 * - `properament`: funció encara no disponible (pàgina informativa, sense accions).
 */
export type DestiMenu =
  | { seccio: string }
  | { ruta: string }
  | { properament: string };

export interface ElementMenu {
  text: string;
  desti?: DestiMenu;
  /** Permís necessari al casal per mostrar l'element. */
  permis?: string;
  fills?: ElementMenu[];
}

export const MENU: ElementMenu[] = [
  {
    text: "Crear cicle", desti: { ruta: "#nou-cicle" },
    fills: [
      { text: "Gestionar activitats", desti: { seccio: "activitats" } },
      { text: "Crear cartells", desti: { ruta: "cartells/nou" }, permis: "cartells.generar" },
      { text: "Gestionar inscripcions", desti: { seccio: "sollicituds-rebudes" } },
      { text: "Sorteig públic", desti: { seccio: "sorteig-per-activitat" } },
      { text: "Assignació d'activitats", desti: { seccio: "adjudicacio" } },
      { text: "Creació de graelles d'assistència", desti: { seccio: "assistencia" } },
      { text: "Informar assignacions", desti: { seccio: "places-i-llistes-d-espera" } },
    ],
  },
  { text: "Gestionar assistència", desti: { seccio: "assistencia" } },
  { text: "Buscar usuari/a", desti: { ruta: "persones" }, permis: "sollicituds.consultar" },
  { text: "Prescripció social", desti: { properament: "prescripcio-social" } },
  {
    text: "Comunicacions", desti: { properament: "comunicacions" },
    fills: [
      {
        text: "WhatsApp", desti: { properament: "whatsapp" },
        fills: [
          { text: "Comunicacions generals", desti: { properament: "whatsapp-generals" } },
          { text: "Comunicacions segons activitat", desti: { seccio: "comunicacions" }, permis: "sollicituds.dades_contacte" },
        ],
      },
      { text: "Instagram", desti: { properament: "instagram" } },
    ],
  },
  { text: "Equip del casal", desti: { ruta: "usuaris" }, permis: "usuaris.gestionar" },
];

/** Títols i descripció de les funcions que encara no estan disponibles. */
export const PROPERAMENT: Record<string, { titol: string; descripcio: string }> = {
  "prescripcio-social": { titol: "Prescripció social", descripcio: "Registrar les derivacions de persones des de serveis socials o de salut." },
  comunicacions: { titol: "Comunicacions", descripcio: "Preparar els missatges als participants per WhatsApp i les publicacions d'Instagram." },
  whatsapp: { titol: "WhatsApp", descripcio: "Preparar missatges de WhatsApp per als participants." },
  "whatsapp-generals": { titol: "WhatsApp: comunicacions generals", descripcio: "Missatges per a totes les persones inscrites al cicle." },
  "whatsapp-activitat": { titol: "WhatsApp: comunicacions segons activitat", descripcio: "Missatges per a les persones d'una activitat concreta." },
  instagram: { titol: "Instagram", descripcio: "Preparar les publicacions d'Instagram a partir dels materials de PG-Cartells. La publicació la fa sempre una persona: l'aplicació no publica automàticament." },
};
