/**
 * Regles de les preferències d'una sol·licitud. S'apliquen igual al navegador
 * (ajuda immediata) i al servidor (validació definitiva).
 */
export interface Preferencia {
  activitat_id: string;
  ordre: number | null;
}

/** Màxim d'activitats que es poden triar al formulari públic (decisió de 2026-10-15). */
export const MAX_ACTIVITATS_FORMULARI = 7;

export type ErrorPreferencies =
  | { tipus: "cap_activitat" }
  | { tipus: "massa_activitats"; maxim: number }
  | { tipus: "sense_ordre"; activitats: string[] }
  | { tipus: "duplicades"; activitats: string[]; ordres: number[] }
  | { tipus: "fora_de_rang"; activitats: string[] }
  | { tipus: "no_consecutives" }
  | { tipus: "activitat_repetida"; activitats: string[] };

/** Activitats que comparteixen número de preferència amb una altra activitat. */
export function activitatsAmbPreferenciaDuplicada(preferencies: Preferencia[]): { activitats: string[]; ordres: number[] } {
  const perOrdre = new Map<number, string[]>();
  for (const p of preferencies) {
    if (p.ordre == null) continue;
    perOrdre.set(p.ordre, [...(perOrdre.get(p.ordre) ?? []), p.activitat_id]);
  }
  const ordres = [...perOrdre.entries()].filter(([, ids]) => ids.length > 1).map(([o]) => o).sort((a, b) => a - b);
  const activitats = ordres.flatMap((o) => perOrdre.get(o)!);
  return { activitats, ordres };
}

/**
 * Valida un conjunt de preferències: almenys una, cap número repetit, tots els
 * números entre 1 i el nombre d'activitats triades i sense salts (1, 2, 3...).
 * Retorna el primer error, en l'ordre en què s'ha de mostrar.
 */
export function validaPreferencies(preferencies: Preferencia[], maxim?: number): ErrorPreferencies | null {
  if (preferencies.length === 0) return { tipus: "cap_activitat" };
  if (maxim !== undefined && preferencies.length > maxim) return { tipus: "massa_activitats", maxim };
  const ids = preferencies.map((p) => p.activitat_id);
  const repetides = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetides.length) return { tipus: "activitat_repetida", activitats: [...new Set(repetides)] };
  const senseOrdre = preferencies.filter((p) => p.ordre == null).map((p) => p.activitat_id);
  if (senseOrdre.length) return { tipus: "sense_ordre", activitats: senseOrdre };
  const duplicades = activitatsAmbPreferenciaDuplicada(preferencies);
  if (duplicades.activitats.length) return { tipus: "duplicades", ...duplicades };
  const n = preferencies.length;
  const fora = preferencies.filter((p) => !Number.isInteger(p.ordre) || p.ordre! < 1 || p.ordre! > n).map((p) => p.activitat_id);
  if (fora.length) return { tipus: "fora_de_rang", activitats: fora };
  // Sense duplicats i dins de 1..n implica que són exactament 1..n; es comprova igualment.
  const ordenades = preferencies.map((p) => p.ordre!).sort((a, b) => a - b);
  if (ordenades.some((o, i) => o !== i + 1)) return { tipus: "no_consecutives" };
  return null;
}

export function missatgeErrorPreferencies(e: ErrorPreferencies): string {
  switch (e.tipus) {
    case "cap_activitat":
      return "Cal seleccionar almenys una activitat.";
    case "massa_activitats":
      return `Podeu triar com a màxim ${e.maxim} activitats. Desmarqueu-ne alguna.`;
    case "sense_ordre":
      return "Falta posar la prioritat a alguna activitat triada. Indiqueu-la a totes les activitats marcades.";
    case "duplicades":
      return `Hi ha preferències duplicades (número ${e.ordres.join(", ")}). Cada activitat ha de tenir un número de preferència diferent: 1 per a la primera, 2 per a la segona, etc. Corregiu les activitats marcades en vermell.`;
    case "fora_de_rang":
      return "Els números de preferència han d'anar de 1 fins al nombre d'activitats seleccionades.";
    case "no_consecutives":
      return "Els números de preferència han de ser consecutius: 1, 2, 3...";
    case "activitat_repetida":
      return "Una mateixa activitat apareix més d'una vegada.";
  }
}
