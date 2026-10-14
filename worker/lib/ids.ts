/** Identificadors interns no deduïbles (UUID v4 criptogràfic). */
export function nouId(): string {
  return crypto.randomUUID();
}
