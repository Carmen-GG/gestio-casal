import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  CAMPS_PERSONA, LLISTA_CAMPS_PERSONA, MAX_FILES_BLOC_PERSONES, esLlistatCarnets, proposaMapatgePersones, type CampPersona,
} from "../../../shared/domain/persones-plataforma";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { llegeixFitxer, type TaulaLlegida } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { CercaPersonesPlataforma, ResultatImportacioPersones } from "../../types/gestio";
import { formataData, formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";

const ORIGENS: Record<string, string> = { usuaris: "Usuaris", carnets: "Carnets", altres: "Altres" };
/** Mida màxima de cada bloc enviat (el servidor n'admet 256 kB). */
const MIDA_MAXIMA_BLOC = 180_000;

/**
 * Buscar usuari/a (petició de 2026-10-15): cerca per qualsevol camp de les persones
 * importades dels llistats de la PGEc (usuaris i carnets), mentre l'aplicació no s'hi
 * pugui connectar directament.
 */
export function BuscarUsuari() {
  const { casalId = "" } = useParams();
  const pot = usePermisos(casalId);
  const contacte = pot("sollicituds.dades_contacte");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const camp = params.get("camp") ?? "tots";
  const [text, setText] = useState(q);
  const [campTriat, setCampTriat] = useState(camp);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.cercaPersones(casalId, q, camp, s), [casalId, q, camp, versio]);
  const campsCerca = LLISTA_CAMPS_PERSONA.filter((c) => contacte || CAMPS_PERSONA[c].nivell === "basic");

  function cerca(e: FormEvent) {
    e.preventDefault();
    const nous = new URLSearchParams();
    if (text.trim()) nous.set("q", text.trim());
    if (campTriat !== "tots") nous.set("camp", campTriat);
    setParams(nous);
  }

  const resum = consulta.tipus === "dades" ? consulta.dades.resum : null;
  const potImportar = pot("dades.importar") && contacte;

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>
      <h1>Buscar usuari/a</h1>
      <p className="text-secundari">
        Persones usuàries de la plataforma d'equipaments (PGEc) importades dels llistats d'usuaris i de carnets.
        {resum && (resum.total > 0
          ? ` Hi ha ${resum.total} ${resum.total === 1 ? "persona" : "persones"}; darrera importació: ${formataDataHora(resum.darrera_importacio!)}.`
          : " Encara no s'ha importat cap llistat.")}
      </p>

      <form className="formulari cerca-persones" role="search" onSubmit={cerca}>
        <div className="camp">
          <label htmlFor="cerca-persona">Nom, cognoms, DNI, data de naixement, localitat, telèfon…</label>
          <input id="cerca-persona" type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
            placeholder="Per exemple: Garcia 12/05/1948" autoComplete="off" />
        </div>
        <div className="camp">
          <label htmlFor="cerca-camp">Cerca a</label>
          <select id="cerca-camp" value={campTriat} onChange={(e) => setCampTriat(e.target.value)}>
            <option value="tots">Tots els camps</option>
            {campsCerca.map((c) => <option key={c} value={c}>{CAMPS_PERSONA[c].etiqueta}</option>)}
          </select>
        </div>
        <button type="submit" className="boto">Cerca</button>
      </form>

      {consulta.tipus === "carregant" && q && <Carregant text="Cercant…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && q && <Resultats casalId={casalId} dades={consulta.dades} contacte={contacte} params={params.toString()} />}

      {potImportar && (
        <Seccio titol="Importar llistats de la PGEc" obertaInicial={resum?.total === 0}>
          <ImportacioPersones casalId={casalId} onImportat={() => setVersio((v) => v + 1)} />
        </Seccio>
      )}
    </div>
  );
}

function Resultats({ casalId, dades, contacte, params }: {
  casalId: string; dades: CercaPersonesPlataforma; contacte: boolean; params: string;
}) {
  if (dades.persones.length === 0) return <p className="avis avis--info" role="status">No s'ha trobat cap persona.</p>;
  return (
    <section aria-labelledby="titol-resultats" className="resultats-persones">
      <h2 id="titol-resultats" className="subseccio">
        {dades.total === 1 ? "1 persona" : `${dades.total} persones`}
        {dades.mes_resultats && ` (se'n mostren ${dades.persones.length}; afineu la cerca)`}
      </h2>
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Resultats de la cerca">
        <table className="taula taula--densa">
          <thead>
            <tr>
              <th scope="col">Cognoms i nom</th><th scope="col">Data de naixement</th><th scope="col">Document</th>
              <th scope="col">Localitat de naixement</th>{contacte && <th scope="col">Telèfon</th>}<th scope="col">Núm. de soci</th>
              <th scope="col">Coincideix a</th>
            </tr>
          </thead>
          <tbody>
            {dades.persones.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  <Link to={`/gestio/${casalId}/persones/${p.id}${params ? `?${params}` : ""}`}>{p.cognoms}, {p.nom}</Link>
                  {p.nom_sentit && <span className="text-secundari"> ({p.nom_sentit})</span>}
                </th>
                <td>{formataData(p.data_naixement)}</td>
                <td className="codi">{p.document ?? "—"}</td>
                <td>{p.localitat_naixement ?? "—"}</td>
                {contacte && <td>{p.telefon ?? "—"}</td>}
                <td>{p.numero_soci ?? "—"}</td>
                <td className="text-secundari">{p.coincidencies.join(", ") || "Nom"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Importació dels llistats de la PGEc. El fitxer es llegeix al navegador; només s'envien
 * les columnes triades, en blocs. Les persones que ja hi són es completen (una cel·la
 * buida mai no esborra cap dada).
 */
function ImportacioPersones({ casalId, onImportat }: { casalId: string; onImportat: () => void }) {
  const [fitxer, setFitxer] = useState<{ nom: string; taula: TaulaLlegida } | null>(null);
  const [mapatge, setMapatge] = useState<(CampPersona | "")[]>([]);
  const [origen, setOrigen] = useState<"usuaris" | "carnets" | "altres">("usuaris");
  const [error, setError] = useState<string | ErrorClientApi | null>(null);
  const [progres, setProgres] = useState<{ fetes: number; total: number } | null>(null);
  const [resultat, setResultat] = useState<ResultatImportacioPersones | null>(null);

  async function tria(f: File | undefined) {
    setFitxer(null); setMapatge([]); setError(null); setResultat(null);
    if (!f) return;
    try {
      const taula = await llegeixFitxer(f);
      if (taula.capcaleres.length === 0) throw new Error("El fitxer és buit o no té fila de capçaleres.");
      setFitxer({ nom: f.name, taula });
      const m = proposaMapatgePersones(taula.capcaleres);
      setMapatge(m);
      setOrigen(esLlistatCarnets(taula.capcaleres) ? "carnets" : m.some(Boolean) ? "usuaris" : "altres");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const repetits = mapatge.filter((m, i) => m && mapatge.indexOf(m) !== i);
  const identifica = mapatge.includes("document") || (mapatge.includes("nom") && mapatge.includes("cognom1") && mapatge.includes("data_naixement"));

  /** Files amb només les columnes triades, en blocs que el servidor accepta. */
  function blocs() {
    const files = fitxer!.taula.files.map((f) =>
      Object.fromEntries(mapatge.flatMap((camp, i) => (camp && f[i]?.trim() ? [[camp, f[i]!.trim().slice(0, 600)]] : []))));
    const resultat: { primera_fila: number; files: Record<string, string>[] }[] = [];
    let actual: Record<string, string>[] = [];
    let mida = 0;
    let primera = 2;
    files.forEach((fila, i) => {
      const m = new TextEncoder().encode(JSON.stringify(fila)).length + 1;
      if (actual.length > 0 && (actual.length >= MAX_FILES_BLOC_PERSONES || mida + m > MIDA_MAXIMA_BLOC)) {
        resultat.push({ primera_fila: primera, files: actual });
        actual = []; mida = 0; primera = i + 2;
      }
      actual.push(fila); mida += m;
    });
    if (actual.length) resultat.push({ primera_fila: primera, files: actual });
    return resultat;
  }

  async function importa() {
    setError(null);
    setResultat(null);
    const llista = blocs();
    const total: ResultatImportacioPersones = { creades: 0, actualitzades: 0, sense_canvis: 0, omeses: [] };
    setProgres({ fetes: 0, total: llista.length });
    try {
      for (const [i, b] of llista.entries()) {
        const r = await serveiGestio.importarPersones(casalId, { origen, nom_fitxer: fitxer!.nom, ...b });
        total.creades += r.creades; total.actualitzades += r.actualitzades; total.sense_canvis += r.sense_canvis;
        total.omeses.push(...r.omeses);
        setProgres({ fetes: i + 1, total: llista.length });
      }
      setResultat(total);
      setFitxer(null);
      onImportat();
    } catch (e) {
      // Els blocs ja enviats queden desats: tornar a importar el fitxer no duplica ningú.
      if (total.creades + total.actualitzades + total.sense_canvis > 0) setResultat(total);
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setProgres(null);
    }
  }

  return (
    <div>
      <p className="text-secundari">
        Descarregueu de la PGEc el llistat d'usuaris o el de carnets (CSV o Excel) i importeu-lo aquí. Si una persona ja hi és
        (mateix document), se n'actualitzen les dades i se li afegeixen les del carnet; les cel·les buides no esborren res.
        Es pot tornar a importar el mateix fitxer sense crear duplicats.
      </p>
      {resultat && (
        <AvisExit>
          Importació feta: {resultat.creades} {resultat.creades === 1 ? "persona nova" : "persones noves"}, {resultat.actualitzades} {resultat.actualitzades === 1 ? "actualitzada" : "actualitzades"}
          {resultat.sense_canvis > 0 && `, ${resultat.sense_canvis} sense canvis`}
          {resultat.omeses.length > 0 && ` i ${resultat.omeses.length} ${resultat.omeses.length === 1 ? "fila omesa" : "files omeses"}`}.
        </AvisExit>
      )}
      {resultat && resultat.omeses.length > 0 && (
        <details className="omeses">
          <summary>Files omeses</summary>
          <ul>{resultat.omeses.slice(0, 200).map((o) => <li key={o.fila}>Fila {o.fila}: {o.motiu}</li>)}</ul>
        </details>
      )}
      {error && (typeof error === "string" ? <p className="avis avis--error" role="alert">{error}</p> : <MissatgeError error={error} />)}

      <div className="formulari">
        <div className="camp">
          <label htmlFor="fitxer-persones">Fitxer .csv o .xlsx</label>
          <input id="fitxer-persones" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!!progres} onChange={(e) => void tria(e.target.files?.[0])} />
        </div>
      </div>

      {fitxer && (
        <div>
          <p><strong>{fitxer.nom}</strong>: {fitxer.taula.files.length} files. Reviseu a quin camp correspon cada columna, o trieu «No importar».</p>
          <div className="camp camp--en-linia">
            <label htmlFor="origen-persones">Tipus de llistat</label>
            <select id="origen-persones" value={origen} onChange={(e) => setOrigen(e.target.value as typeof origen)}>
              {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="taula-contenidor taula-contenidor--alta" tabIndex={0} role="region" aria-label="Correspondència de columnes">
            <table className="taula taula--densa">
              <thead><tr><th scope="col">Columna del fitxer</th><th scope="col">Camp de l'aplicació</th></tr></thead>
              <tbody>
                {fitxer.taula.capcaleres.map((c, i) => (
                  <tr key={i} className={mapatge[i] && repetits.includes(mapatge[i]!) ? "fila--error" : undefined}>
                    <th scope="row">{c || `(columna ${i + 1})`}</th>
                    <td>
                      <select aria-label={`Camp de la columna ${c}`} value={mapatge[i] ?? ""}
                        onChange={(e) => setMapatge((m) => m.map((x, k) => (k === i ? e.target.value as CampPersona | "" : x)))}>
                        <option value="">No importar</option>
                        {LLISTA_CAMPS_PERSONA.map((d) => <option key={d} value={d}>{CAMPS_PERSONA[d].etiqueta}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {repetits.length > 0 && <p className="avis avis--error" role="alert">Hi ha camps assignats a més d'una columna: {[...new Set(repetits)].map((r) => CAMPS_PERSONA[r as CampPersona].etiqueta).join(", ")}.</p>}
          {!identifica && <p className="avis avis--alerta">Cal la columna del document, o bé les del nom, el primer cognom i la data de naixement, per reconèixer cada persona.</p>}
          <div className="botonera">
            <button type="button" className="boto" disabled={!!progres || repetits.length > 0 || !identifica} onClick={() => void importa()}>
              {progres ? `Important… (${progres.fetes}/${progres.total})` : `Importa ${fitxer.taula.files.length} files`}
            </button>
            <button type="button" className="boto boto--secundari" disabled={!!progres} onClick={() => setFitxer(null)}>Cancel·la</button>
          </div>
        </div>
      )}
    </div>
  );
}
