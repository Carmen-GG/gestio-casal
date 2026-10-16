import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../../shared/domain/cicles";
import { normalitzaText } from "../../../shared/domain/ordenacio";
import { CATEGORIES_INCIDENCIA, ETIQUETES_CATEGORIA_INCIDENCIA, type CategoriaIncidencia } from "../../../shared/domain/territori";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { Seccio } from "../../components/Seccio";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { CasalQuadre, QuadreGlobal as Dades, RecomptesGlobals } from "../../types/gestio";

const pc = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ca")} %`);
const curta = (iso: string) => iso.split("-").reverse().join("/");
const n = (v: number) => v.toLocaleString("ca");
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : null);

/** Abast de les estadístiques (petició de 2026-10-16). */
type Ambit = "tots" | "casal" | "comarca" | "demarcacio" | "referent" | "seleccio";
const AMBITS: { valor: Ambit; text: string }[] = [
  { valor: "tots", text: "Tots els casals" },
  { valor: "casal", text: "Un casal" },
  { valor: "comarca", text: "Una comarca" },
  { valor: "demarcacio", text: "Una demarcació territorial" },
  { valor: "referent", text: "Els casals d'una referent" },
  { valor: "seleccio", text: "Uns casals concrets" },
];
type Agrupacio = "demarcacio" | "comarca" | "referent" | "casal";
const AGRUPACIONS: { valor: Agrupacio; text: string }[] = [
  { valor: "demarcacio", text: "Demarcació" }, { valor: "comarca", text: "Comarca" }, { valor: "referent", text: "Referent" }, { valor: "casal", text: "Casal" },
];
const AGRUPACIO_PER_DEFECTE: Record<Ambit, Agrupacio> = {
  tots: "demarcacio", casal: "casal", comarca: "casal", demarcacio: "comarca", referent: "casal", seleccio: "casal",
};
const clauGrup = (k: CasalQuadre, a: Agrupacio) =>
  a === "casal" ? k.casal : a === "referent" ? k.referent ?? "Sense referent" : a === "comarca" ? k.comarca ?? "Sense comarca" : k.demarcacio ?? "Sense demarcació";

const CAMPS: (keyof Omit<RecomptesGlobals, "percentatge_assistencia">)[] = [
  "activitats", "places_ofertes", "sollicituds", "persones", "admeses", "espera", "renuncies", "baixes", "baixes_voluntaries",
  "sessions_realitzades", "presencies", "absencies", "absencies_justificades", "activitats_sense_tallerista", "sessions_falta_tallerista",
];

/** Suma dels indicadors d'un grup de casals. Tots són recomptes; els percentatges es recalculen. */
function agrega(casals: CasalQuadre[]) {
  const t = Object.fromEntries(CAMPS.map((c) => [c, 0])) as Record<(typeof CAMPS)[number], number>;
  const categories = Object.fromEntries(CATEGORIES_INCIDENCIA.map((c) => [c, 0])) as Record<CategoriaIncidencia, number>;
  let cicles = 0, persones_diferents = 0, persones_plataforma = 0, equip = 0, amb_responsable = 0, incidencies = 0, obertes = 0;
  for (const k of casals) {
    for (const c of CAMPS) t[c] += k[c];
    for (const c of CATEGORIES_INCIDENCIA) categories[c] += k.incidencies_per_categoria[c] ?? 0;
    cicles += k.cicles; persones_diferents += k.persones_diferents; persones_plataforma += k.persones_plataforma; equip += k.equip;
    amb_responsable += k.responsables > 0 ? 1 : 0; incidencies += k.incidencies; obertes += k.incidencies_obertes;
  }
  const marques = t.presencies + t.absencies + t.absencies_justificades;
  return {
    ...t, casals: casals.length, cicles, persones_diferents, persones_plataforma, equip, amb_responsable, incidencies, obertes, categories,
    assistencia: percent(t.presencies, marques),
    ocupacio: percent(t.admeses, t.places_ofertes),
    sense_tallerista_pc: percent(t.activitats_sense_tallerista, t.activitats),
    falta_tallerista_pc: percent(t.sessions_falta_tallerista, t.sessions_realitzades),
  };
}
type Agregat = ReturnType<typeof agrega>;

/** Columnes de les taules per casal i per cicle. */
const COLUMNES: { clau: keyof RecomptesGlobals; text: string }[] = [
  { clau: "activitats", text: "Activitats" },
  { clau: "places_ofertes", text: "Places ofertes" },
  { clau: "sollicituds", text: "Sol·licituds" },
  { clau: "admeses", text: "Admeses" },
  { clau: "espera", text: "Llista d'espera" },
  { clau: "renuncies", text: "Renúncies" },
  { clau: "baixes_voluntaries", text: "Baixes voluntàries" },
  { clau: "baixes", text: "Baixes per assistència" },
  { clau: "sessions_realitzades", text: "Sessions fetes" },
  { clau: "percentatge_assistencia", text: "Assistència" },
  { clau: "activitats_sense_tallerista", text: "Activitats sense tallerista" },
  { clau: "sessions_falta_tallerista", text: "Faltes de tallerista" },
];
const valor = (r: RecomptesGlobals, c: keyof RecomptesGlobals) =>
  (c === "percentatge_assistencia" ? pc(r[c]) : n(r[c] as number));

/**
 * Quadre de comandament de la superadministració (peticions de 2026-10-15 i 2026-10-16):
 * estadístiques de tots els casals, d'un casal, d'una comarca, d'una demarcació o dels casals
 * d'una referent, agrupades per temes i amb gràfiques. Només recomptes: cap dada personal.
 */
export function QuadreGlobal() {
  const [any, setAny] = useState<number | null>(null);
  const [ambit, setAmbit] = useState<Ambit>("tots");
  const [triat, setTriat] = useState("");
  const [seleccio, setSeleccio] = useState<Set<string>>(new Set());
  const [cercaSeleccio, setCercaSeleccio] = useState("");
  const [agrupacio, setAgrupacio] = useState<Agrupacio>("demarcacio");
  const [tots, setTots] = useState(false);
  const consulta = useConsulta((s) => serveiGestio.quadreGlobal(any, s), [any]);

  const filtrats = useMemo(() => {
    if (consulta.tipus !== "dades") return [];
    const c = consulta.dades.casals;
    if (ambit === "tots") return c;
    if (ambit === "seleccio") return c.filter((k) => seleccio.has(k.casal_id));
    if (!triat) return [];
    if (ambit === "casal") return c.filter((k) => k.casal_id === triat);
    if (ambit === "comarca") return c.filter((k) => (k.comarca ?? "") === triat);
    if (ambit === "demarcacio") return c.filter((k) => (k.demarcacio ?? "") === triat);
    return c.filter((k) => k.referent_id === triat);
  }, [consulta, ambit, triat, seleccio]);

  if (consulta.tipus === "carregant") return <Carregant text="Calculant els indicadors de tots els casals…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const ordenats = (v: (string | null)[]) => [...new Set(v.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "ca"));
  const opcions: Record<Exclude<Ambit, "tots" | "seleccio">, { valor: string; text: string }[]> = {
    casal: d.casals.map((k) => ({ valor: k.casal_id, text: `${k.casal} (${k.municipi})` })),
    comarca: ordenats(d.casals.map((k) => k.comarca)).map((x) => ({ valor: x, text: x })),
    demarcacio: ordenats(d.casals.map((k) => k.demarcacio)).map((x) => ({ valor: x, text: x })),
    referent: d.referents.map((r) => ({ valor: r.id, text: `${r.nom}${r.actiu ? "" : " (inactiva)"} · ${d.casals.filter((k) => k.referent_id === r.id).length} casals` })),
  };
  const idsFiltrats = new Set(filtrats.map((k) => k.casal_id));
  const cicles = d.cicles.filter((c) => idsFiltrats.has(c.casal_id));
  const t = agrega(filtrats);
  const perGrup = new Map<string, CasalQuadre[]>();
  for (const k of filtrats) perGrup.set(clauGrup(k, agrupacio), [...(perGrup.get(clauGrup(k, agrupacio)) ?? []), k]);
  const grups = [...perGrup].map(([nom, casals]) => ({ nom, ...agrega(casals) }));
  const casalsTaula = filtrats.filter((k) => tots || ambit !== "tots" || k.cicles > 0 || k.persones_plataforma > 0 || k.equip > 0 || k.incidencies > 0);
  const nomAgrupacio = AGRUPACIONS.find((a) => a.valor === agrupacio)!.text.toLowerCase();
  const descripcioAbast = ambit === "tots" ? "tots els casals"
    : ambit === "seleccio" ? "casals triats"
    : ambit === "referent" ? `casals de ${d.referents.find((r) => r.id === triat)?.nom ?? ""}`
    : ambit === "casal" ? filtrats[0]?.casal ?? "" : triat;

  function canviaAmbit(a: Ambit) {
    setAmbit(a); setTriat(""); setAgrupacio(AGRUPACIO_PER_DEFECTE[a]);
  }

  const grafic = (titol: string, clau: (g: Agregat) => number | null, format: "n" | "pc" = "n") => (
    <Barres titol={`${titol} per ${nomAgrupacio}`} format={format}
      dades={grups.map((g) => ({ etiqueta: g.nom, valor: clau(g) })).filter((x): x is { etiqueta: string; valor: number } => x.valor !== null)} />
  );

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Quadre de comandament</h1>

      <div className="barra-filtres">
        <label className="camp camp--en-linia">
          <span>Any dels cicles</span>
          <select value={any ?? ""} onChange={(e) => setAny(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tots</option>
            {d.anys.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="camp camp--en-linia">
          <span>Estadístiques de</span>
          <select value={ambit} onChange={(e) => canviaAmbit(e.target.value as Ambit)}>
            {AMBITS.map((a) => <option key={a.valor} value={a.valor}>{a.text}</option>)}
          </select>
        </label>
        {ambit !== "tots" && ambit !== "seleccio" && (
          <label className="camp camp--en-linia">
            <span>{AMBITS.find((a) => a.valor === ambit)!.text.replace(/^(Un|Una|Els casals d'una) /, "").replace(/^./, (x) => x.toUpperCase())}</span>
            <select value={triat} onChange={(e) => setTriat(e.target.value)}>
              <option value="">Trieu-ne {ambit === "casal" ? "un" : "una"}</option>
              {opcions[ambit].map((o) => <option key={o.valor} value={o.valor}>{o.text}</option>)}
            </select>
          </label>
        )}
        <label className="camp camp--en-linia">
          <span>Gràfiques per</span>
          <select value={agrupacio} onChange={(e) => setAgrupacio(e.target.value as Agrupacio)}>
            {AGRUPACIONS.map((a) => <option key={a.valor} value={a.valor}>{a.text}</option>)}
          </select>
        </label>
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => void exporta(d, filtrats, cicles)}>Descarrega l'informe (Excel)</button>
      </div>
      {ambit === "referent" && d.referents.length === 0 && (
        <p className="avis">Encara no hi ha cap referent. Doneu-les d'alta a <Link to="/gestio/administracio/territori">Territori i referents</Link>.</p>
      )}

      {ambit === "seleccio" && (
        <details className="seleccio-casals" open={seleccio.size === 0}>
          <summary>Casals triats: {seleccio.size}</summary>
          <div className="barra-filtres">
            <input type="search" aria-label="Cerca un casal" placeholder="Cerca per casal, municipi o comarca" value={cercaSeleccio} onChange={(e) => setCercaSeleccio(e.target.value)} />
            <button type="button" className="boto boto--secundari boto--petit" onClick={() => setSeleccio(new Set())}>Treu-los tots</button>
          </div>
          <ul className="llista-seleccio">
            {d.casals.filter((k) => !cercaSeleccio || normalitzaText(`${k.casal} ${k.municipi} ${k.comarca ?? ""}`).includes(normalitzaText(cercaSeleccio))).map((k) => (
              <li key={k.casal_id}>
                <label className="casella">
                  <input type="checkbox" checked={seleccio.has(k.casal_id)}
                    onChange={(e) => { const s = new Set(seleccio); if (e.target.checked) s.add(k.casal_id); else s.delete(k.casal_id); setSeleccio(s); }} />
                  {" "}{k.casal} <span className="text-secundari">({k.municipi})</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {filtrats.length === 0 ? (
        <p>{ambit === "seleccio" ? "Trieu els casals que voleu veure." : "Trieu què voleu veure."}</p>
      ) : (
        <>
          <p className="text-secundari" aria-live="polite">
            Abast: <strong>{descripcioAbast}</strong>{any ? ` (cicles de l'any ${any})` : ""} · {n(t.casals)} {t.casals === 1 ? "casal" : "casals"} i {n(t.cicles)} {t.cicles === 1 ? "cicle" : "cicles"}.
          </p>

          <Seccio titol="Participació">
            <ul className="xifres">
              <li><strong>{n(t.activitats)}</strong><span>activitats ({n(t.places_ofertes)} places)</span></li>
              <li><strong>{n(t.sollicituds)}</strong><span>sol·licituds</span></li>
              <li><strong>{n(t.persones_diferents)}</strong><span>persones inscrites diferents</span></li>
              <li><strong>{n(t.admeses)}</strong><span>places adjudicades</span></li>
              <li><strong>{pc(t.ocupacio)}</strong><span>d'ocupació de les places</span></li>
              <li><strong>{n(t.espera)}</strong><span>en llista d'espera</span></li>
            </ul>
            {grups.length > 1 && (
              <div className="graella-grafics">
                {grafic("Persones inscrites diferents", (g) => g.persones_diferents)}
                {grafic("Ocupació de les places", (g) => g.ocupacio, "pc")}
              </div>
            )}
          </Seccio>

          <Seccio titol="Assistència i baixes">
            <ul className="xifres">
              <li><strong>{n(t.sessions_realitzades)}</strong><span>sessions fetes</span></li>
              <li><strong>{pc(t.assistencia)}</strong><span>d'assistència</span></li>
              <li><strong>{n(t.baixes_voluntaries + t.renuncies)}</strong><span>renúncies i baixes voluntàries</span></li>
              <li><strong>{n(t.baixes)}</strong><span>baixes per assistència</span></li>
            </ul>
            {grups.length > 1 && (
              <div className="graella-grafics">
                {grafic("Assistència", (g) => g.assistencia, "pc")}
                {grafic("Renúncies i baixes voluntàries", (g) => g.renuncies + g.baixes_voluntaries)}
              </div>
            )}
          </Seccio>

          <Seccio titol="Activitats i talleristes">
            <ul className="xifres">
              <li><strong>{n(t.activitats_sense_tallerista)}</strong><span>activitats sense tallerista ({pc(t.sense_tallerista_pc)} del total)</span></li>
              <li><strong>{n(t.sessions_falta_tallerista)}</strong><span>sessions en què la tallerista no ha vingut</span></li>
              <li><strong>{pc(t.falta_tallerista_pc)}</strong><span>de les sessions fetes, amb falta de la tallerista</span></li>
            </ul>
            {grups.length > 1 && (
              <div className="graella-grafics">
                {grafic("Activitats sense tallerista", (g) => g.activitats_sense_tallerista)}
                {grafic("Faltes de la tallerista", (g) => g.sessions_falta_tallerista)}
              </div>
            )}
            <p className="text-secundari">
              Una activitat compta com a «sense tallerista» si a la fitxa no hi ha el nom de la tallerista. Les faltes es marquen al full
              d'assistència de cada activitat.
            </p>
          </Seccio>

          <Seccio titol="Incidències">
            <ul className="xifres">
              <li><strong>{n(t.incidencies)}</strong><span>incidències registrades</span></li>
              <li><strong>{n(t.obertes)}</strong><span>encara obertes</span></li>
            </ul>
            <div className="graella-grafics">
              <Barres titol="Incidències per categoria" format="n"
                dades={CATEGORIES_INCIDENCIA.map((c) => ({ etiqueta: ETIQUETES_CATEGORIA_INCIDENCIA[c], valor: t.categories[c] }))} />
              {grups.length > 1 && grafic("Incidències obertes", (g) => g.obertes)}
            </div>
            <p className="text-secundari">Les incidències les registra cada casal a l'apartat «Incidències» del seu menú. Es compten per l'any de la data de la incidència.</p>
          </Seccio>

          <Seccio titol="Equips i persones usuàries">
            <ul className="xifres">
              <li><strong>{n(t.amb_responsable)} de {n(t.casals)}</strong><span>casals amb responsable</span></li>
              <li><strong>{n(t.equip)}</strong><span>persones als equips dels casals</span></li>
              <li><strong>{n(t.persones_plataforma)}</strong><span>persones usuàries importades (PGEc)</span></li>
            </ul>
            {grups.length > 1 && (
              <div className="graella-grafics">
                {grafic("Casals sense responsable", (g) => g.casals - g.amb_responsable)}
                {grafic("Persones usuàries importades", (g) => g.persones_plataforma)}
              </div>
            )}
          </Seccio>

          <p className="text-secundari">
            Les persones diferents es compten per casal (mateix document o mateix nom i data de naixement); qui va a dos casals compta a tots dos.
            L'assistència és el percentatge de presències sobre totes les marques; les faltes justificades compten com a faltes.
          </p>

          <Seccio titol="Per casal" obertaInicial={ambit !== "tots"}>
            {ambit === "tots" && <label className="casella"><input type="checkbox" checked={tots} onChange={(e) => setTots(e.target.checked)} /> Mostra també els casals sense activitat</label>}
            <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Indicadors per casal">
              <table className="taula taula--densa">
                <thead>
                  <tr>
                    <th scope="col">Casal</th><th scope="col">Comarca</th><th scope="col">Referent</th><th scope="col" className="num">Cicles</th>
                    {COLUMNES.map((c) => <th key={c.clau} scope="col" className="num">{c.text}</th>)}
                    <th scope="col" className="num">Incidències (obertes)</th>
                    <th scope="col" className="num">Persones diferents</th><th scope="col" className="num">Persones PGEc</th>
                    <th scope="col" className="num">Equip</th><th scope="col">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {casalsTaula.map((k) => (
                    <tr key={k.casal_id}>
                      <th scope="row"><Link to={`/gestio/${k.casal_id}`}>{k.casal}</Link></th>
                      <td>{k.comarca ?? "—"}</td><td>{k.referent ?? "—"}</td>
                      <td className="num">{n(k.cicles)}</td>
                      {COLUMNES.map((c) => <td key={c.clau} className="num">{valor(k, c.clau)}</td>)}
                      <td className="num">{n(k.incidencies)} ({n(k.incidencies_obertes)})</td>
                      <td className="num">{n(k.persones_diferents)}</td><td className="num">{n(k.persones_plataforma)}</td>
                      <td className="num">{n(k.equip)}</td><td>{k.responsables > 0 ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccio>

          <Seccio titol="Per cicle" obertaInicial={ambit === "casal"}>
            {cicles.length === 0 ? <p>No hi ha cap cicle{any ? ` de l'any ${any}` : ""}.</p> : (
              <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Indicadors per cicle">
                <table className="taula taula--densa">
                  <thead>
                    <tr>
                      <th scope="col">Casal</th><th scope="col">Cicle</th><th scope="col">Estat</th><th scope="col">Dates</th>
                      {COLUMNES.map((c) => <th key={c.clau} scope="col" className="num">{c.text}</th>)}
                      <th scope="col" className="num">Persones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cicles.map((c) => (
                      <tr key={c.cicle_id}>
                        <td>{c.casal}</td>
                        <th scope="row"><Link to={`/gestio/${c.casal_id}/cicles/${c.cicle_id}`}>{c.cicle}</Link></th>
                        <td>{ETIQUETES_ESTAT_CICLE[c.estat] ?? c.estat}</td>
                        <td className="sense-salt">{curta(c.data_inici)} – {curta(c.data_fi)}</td>
                        {COLUMNES.map((k) => <td key={k.clau} className="num">{valor(c, k.clau)}</td>)}
                        <td className="num">{n(c.persones)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccio>
        </>
      )}
    </div>
  );
}

const MAX_BARRES = 15;

/**
 * Gràfica de barres horitzontals, ordenada de més a menys. Cada barra porta el valor escrit,
 * de manera que es pot llegir sense eix ni llegenda.
 */
function Barres({ titol, dades, format }: { titol: string; dades: { etiqueta: string; valor: number }[]; format: "n" | "pc" }) {
  const ordenades = [...dades].sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, "ca"));
  const visibles = ordenades.slice(0, MAX_BARRES);
  const maxim = format === "pc" ? 100 : Math.max(1, ...visibles.map((x) => x.valor));
  const text = (v: number) => (format === "pc" ? pc(v) : n(v));
  return (
    <figure className="grafic">
      <figcaption>{titol}</figcaption>
      {visibles.every((x) => x.valor === 0) ? <p className="text-secundari">Cap dada per ara.</p> : (
        <ul className="barres">
          {visibles.map((x) => (
            <li key={x.etiqueta}>
              <span className="barres__etiqueta" title={x.etiqueta}>{x.etiqueta}</span>
              <span className="barres__pista">
                <span className="barres__barra" style={{ width: `${(x.valor / maxim) * 100}%` }} aria-hidden="true" />
                <span className="barres__valor">{text(x.valor)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ordenades.length > MAX_BARRES && <p className="text-secundari">I {ordenades.length - MAX_BARRES} més (vegeu la taula per casal).</p>}
    </figure>
  );
}

/** Informe en dos fitxers Excel (per casal i per cicle) amb els casals filtrats. */
async function exporta(d: Dades, casals: CasalQuadre[], cicles: Dades["cicles"]) {
  const sufix = d.any ? `-${d.any}` : "";
  const num = (r: RecomptesGlobals) => COLUMNES.map((c) => r[c.clau] as number | null);
  const capcalera = COLUMNES.map((c) => c.text === "Assistència" ? "Assistència (%)" : c.text);
  descarrega(await generaXlsx({
    titol: "Quadre per casal", fitxer: `quadre-global-casals${sufix}.xlsx`,
    columnes: ["Casal", "Municipi", "Comarca", "Demarcació", "Referent", "Cicles", ...capcalera,
      ...CATEGORIES_INCIDENCIA.map((c) => `Incidències: ${ETIQUETES_CATEGORIA_INCIDENCIA[c]}`), "Incidències obertes",
      "Persones diferents", "Persones PGEc", "Equip", "Té responsable"],
    files: casals.map((k) => [k.casal, k.municipi, k.comarca ?? "", k.demarcacio ?? "", k.referent ?? "", k.cicles, ...num(k),
      ...CATEGORIES_INCIDENCIA.map((c) => k.incidencies_per_categoria[c] ?? 0), k.incidencies_obertes,
      k.persones_diferents, k.persones_plataforma, k.equip, k.responsables > 0 ? "Sí" : "No"]),
  }), `quadre-global-casals${sufix}.xlsx`);
  descarrega(await generaXlsx({
    titol: "Quadre per cicle", fitxer: `quadre-global-cicles${sufix}.xlsx`,
    columnes: ["Casal", "Cicle", "Any", "Estat", "Data d'inici", "Data de final", ...capcalera, "Persones"],
    files: cicles.map((c) => [c.casal, c.cicle, c.any, ETIQUETES_ESTAT_CICLE[c.estat] ?? c.estat, c.data_inici, c.data_fi, ...num(c), c.persones]),
  }), `quadre-global-cicles${sufix}.xlsx`);
}
