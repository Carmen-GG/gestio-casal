/** Font de temps injectable per poder provar la lògica dependent de dates. */
export interface Rellotge {
  ara(): Date;
}

export const rellotgeSistema: Rellotge = { ara: () => new Date() };

export function isoAra(r: Rellotge): string {
  return r.ara().toISOString();
}
