/**
 * Utilitats de conversió per a les importacions. Els fitxers d'origen (CSV o
 * Excel exportats d'altres sistemes) no tenen un format fix: les columnes es
 * mapen a mà i aquí s'interpreten els valors més habituals.
 */
import { normalitzaText } from "./ordenacio";

/** Data en format AAAA-MM-DD, DD/MM/AAAA o DD-MM-AAAA. Retorna AAAA-MM-DD o null si no és vàlida. */
export function interpretaData(valor: string): string | null {
  const v = valor.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s.*)?$/.exec(v))) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hora HH:MM (accepta H:MM, HH.MM i HH:MM:SS). */
export function interpretaHora(valor: string): string | null {
  const r = /^(\d{1,2})[:.h](\d{2})(?::\d{2})?$/.exec(valor.trim());
  if (!r) return null;
  const h = Number(r[1]);
  const m = Number(r[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${r[2]}`;
}

/**
 * Data i hora en hora local del casal (DD/MM/AAAA HH:MM o ISO). Si no hi ha hora,
 * s'entén les 00:00. La conversió a UTC la fa qui crida, amb la zona del casal.
 */
export function interpretaDataHoraLocal(valor: string): { data: string; hora: string } | null {
  const v = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))) {
    // ISO amb zona: ja és un instant absolut; es retorna com a UTC.
    const iso = new Date(v).toISOString();
    return { data: iso.slice(0, 10), hora: `${iso.slice(11, 16)}Z` };
  }
  const data = interpretaData(v);
  if (!data) return null;
  const resta = /(?:[T ])(\d{1,2}[:.]\d{2}(?::\d{2})?)$/.exec(v);
  if (!resta) return { data, hora: "00:00" };
  const hora = interpretaHora(resta[1]!);
  return hora ? { data, hora } : null;
}

/** Desplaçament de la zona Europe/Madrid (minuts) en un instant. */
function desplacamentMadrid(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.round((Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - instant.getTime()) / 60000);
}

/** Converteix una data i hora local del casal a ISO UTC. */
export function localMadridAIso(data: string, hora: string): string {
  if (hora.endsWith("Z")) return new Date(`${data}T${hora.slice(0, 5)}:00Z`).toISOString();
  const comUtc = new Date(`${data}T${hora}:00Z`);
  const primer = new Date(comUtc.getTime() - desplacamentMadrid(comUtc) * 60000);
  return new Date(comUtc.getTime() - desplacamentMadrid(primer) * 60000).toISOString();
}

const DIES: Record<string, number> = {
  dl: 1, dilluns: 1, l: 1, lunes: 1, lu: 1,
  dt: 2, dimarts: 2, martes: 2, ma: 2,
  dc: 3, dimecres: 3, x: 3, miercoles: 3, mi: 3,
  dj: 4, dijous: 4, j: 4, jueves: 4, ju: 4,
  dv: 5, divendres: 5, v: 5, viernes: 5, vi: 5,
  ds: 6, dissabte: 6, s: 6, sabado: 6, sa: 6,
  dg: 7, diumenge: 7, d: 7, domingo: 7, do: 7,
};

/** Dies de la setmana en text ("dl i dc", "dilluns, dijous", "1,3"). null si hi ha cap valor no reconegut. */
export function interpretaDies(valor: string): number[] | null {
  // normalitzaText ja converteix comes, punts i barres en espais.
  const parts = normalitzaText(valor).split(" ").filter((p) => p && p !== "i" && p !== "y");
  if (parts.length === 0) return [];
  const dies = new Set<number>();
  for (const p of parts) {
    const n = /^[1-7]$/.test(p) ? Number(p) : DIES[p];
    if (!n) return null;
    dies.add(n);
  }
  return [...dies].sort((a, b) => a - b);
}

/** Enter no negatiu escrit com a text ("12", "12,0"). */
export function interpretaEnter(valor: string): number | null {
  const v = valor.trim().replace(/[.,]0+$/, "");
  return /^\d{1,6}$/.test(v) ? Number(v) : null;
}

/** Sinònims habituals de capçaleres per proposar el mapatge automàticament. */
const SINONIMS: Record<string, string[]> = {
  nom: ["nom", "nombre", "name"],
  cognom1: ["cognom1", "primer cognom", "cognom", "cognoms", "apellido", "primer apellido", "apellido1", "apellidos"],
  cognom2: ["cognom2", "segon cognom", "segundo apellido", "apellido2"],
  data_naixement: ["data naixement", "data de naixement", "fecha nacimiento", "fecha de nacimiento"],
  document_identitat: ["dni", "nie", "dni nie", "document", "document identitat"],
  telefon: ["telefon", "telefono", "mobil", "movil", "tel"],
  email: ["email", "correu", "correu electronic", "correo", "e mail", "mail"],
  adreca: ["adreca", "direccion", "domicili", "domicilio"],
  codi_postal: ["codi postal", "cp", "codigo postal"],
  municipi: ["municipi", "poblacio", "municipio", "poblacion", "localitat", "localidad"],
  lloc_naixement: ["lloc naixement", "lloc de naixement", "lugar nacimiento", "lugar de nacimiento"],
  barri: ["barri", "barrio", "districte", "distrito"],
  codi_participant_intern: ["codi participant", "codi intern", "id participant", "codigo participante"],
  data_registre: ["data registre", "data inscripcio", "data", "fecha", "fecha inscripcion", "data hora", "marca temporal"],
  descripcio: ["descripcio", "descripcion"],
  categoria: ["categoria", "ambit", "ambito", "tipus", "tipo"],
  dies: ["dies", "dia", "dias", "dies setmana"],
  hora_inici: ["hora inici", "inici", "hora inicio", "inicio"],
  hora_fi: ["hora fi", "fi", "hora final", "final", "hora fin"],
  horari_text: ["horari", "horario"],
  data_inici: ["data inici", "fecha inicio"],
  data_fi: ["data fi", "data final", "fecha fin", "fecha final"],
  espai: ["espai", "sala", "aula", "espacio"],
  capacitat: ["capacitat", "places", "plazas", "aforament", "aforo", "capacidad"],
  nombre_sessions: ["sessions", "nombre sessions", "sesiones"],
  codi_extern: ["codi", "codi extern", "codi pgec", "codigo", "id"],
};

/** Proposa a quin camp de destinació correspon una capçalera, o null. */
export function proposaCamp(capcalera: string, camps: readonly string[]): string | null {
  const c = normalitzaText(capcalera).replace(/_/g, " ");
  if (camps.includes(c.replace(/ /g, "_"))) return c.replace(/ /g, "_");
  const pref = /^(?:preferencia|activitat|actividad|opcio|opcion)\s*(\d{1,2})$/.exec(c);
  if (pref && camps.includes(`preferencia_${Number(pref[1])}`)) return `preferencia_${Number(pref[1])}`;
  for (const camp of camps) if (SINONIMS[camp]?.includes(c)) return camp;
  return null;
}
