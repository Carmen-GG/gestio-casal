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

/**
 * Construeix la llista "col = ?" d'un UPDATE només amb columnes d'una llista blanca.
 * Els objectes i llistes es desen com a JSON; els booleans com 0/1.
 */
export function assignacionsUpdate(
  canvis: Record<string, unknown>,
  permeses: readonly string[],
): { sql: string; valors: unknown[] } {
  const parts: string[] = [];
  const valors: unknown[] = [];
  for (const [col, valor] of Object.entries(canvis)) {
    if (valor === undefined) continue;
    if (!permeses.includes(col)) throw new Error(`columna no permesa: ${col}`);
    parts.push(`${col} = ?`);
    valors.push(
      typeof valor === "boolean" ? (valor ? 1 : 0)
      : valor !== null && typeof valor === "object" ? JSON.stringify(valor)
      : valor,
    );
  }
  return { sql: parts.join(", "), valors };
}
