import type { Operacio } from "../tipus";

export function jsonObjecte(valor: unknown): Record<string, unknown> {
  if (typeof valor !== "string") return {};
  try {
    const v = JSON.parse(valor);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function jsonLlistaNumeros(valor: unknown): number[] {
  if (typeof valor !== "string") return [];
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export const comOperacio = (stmt: D1PreparedStatement) => stmt as unknown as Operacio;
export const comStatement = (op: Operacio) => op as unknown as D1PreparedStatement;

/** Genera "?, ?, ?" per a clàusules IN amb paràmetres preparats. */
export const marcadors = (n: number) => Array.from({ length: n }, () => "?").join(", ");
