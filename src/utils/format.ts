const DIES = ["", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"];

/** Formata una data AAAA-MM-DD en català sense desplaçaments de zona horària. */
export function formataData(data: string | null | undefined): string {
  if (!data) return "";
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return data;
  return new Intl.DateTimeFormat("ca", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, d)));
}

/** Formata una data i hora ISO a l'hora local del casal (Europa/Madrid). */
export function formataDataHora(iso: string): string {
  return new Intl.DateTimeFormat("ca", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export function formataHorari(a: {
  dies_setmana: number[]; hora_inici: string | null; hora_fi: string | null; horari_text: string | null;
}): string {
  if (a.horari_text) return a.horari_text;
  const dies = a.dies_setmana.map((d) => DIES[d]).filter(Boolean);
  const llistaDies = dies.length > 1 ? `${dies.slice(0, -1).join(", ")} i ${dies.at(-1)}` : (dies[0] ?? "");
  const hores = a.hora_inici && a.hora_fi ? `de ${a.hora_inici} a ${a.hora_fi}` : (a.hora_inici ?? "");
  return [llistaDies, hores].filter(Boolean).join(", ") || "Horari pendent de publicar";
}
