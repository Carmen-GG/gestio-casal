/** Àncora d'una secció a partir del títol («Sol·licituds rebudes» → «sollicituds-rebudes»). */
export function ancoraDe(titol: string): string {
  return titol.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/l·l/gi, "ll").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
