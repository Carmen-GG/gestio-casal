import { useState } from "react";
import { proposaCamp } from "../../../shared/domain/importacio";
import { ETIQUETES_CAMPS } from "../../../shared/domain/formulari";
import {
  CAMPS_IMPORTACIO_ACTIVITATS, CAMPS_IMPORTACIO_SOLLICITUDS, MAX_FILES_IMPORTACIO, OBLIGATORIS_IMPORTACIO,
} from "../../../shared/schemas/sollicituds";
import { MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { descarrega, generaXlsx, llegeixFitxer, type TaulaLlegida } from "../../fitxers/xlsx";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, Previsualitzacio } from "../../types/gestio";

type Tipus = "sollicituds" | "activitats";

const ETIQUETES_DESTI: Record<string, string> = {
  ...ETIQUETES_CAMPS,
  codi_participant_intern: "Codi intern de participant", data_registre: "Data i hora de registre",
  descripcio: "Descripció", categoria: "Categoria", dies: "Dies de la setmana", hora_inici: "Hora d'inici", hora_fi: "Hora de finalització",
  horari_text: "Horari (text lliure)", data_inici: "Data d'inici", data_fi: "Data de finalització", espai: "Espai",
  capacitat: "Capacitat (places)", nombre_sessions: "Nombre de sessions", codi_extern: "Codi extern (PGEc)",
};
const etiquetaDesti = (c: string) => ETIQUETES_DESTI[c] ?? c.replace(/^preferencia_(\d+)$/, "Activitat de preferència $1");

/**
 * Importació en tres passos (fitxer, previsualització i validació, confirmació)
 * i exportacions en XLSX real. La validació definitiva la fa el servidor.
 */
export function ImportacioExportacio({ casalId, cicleId, activitats, pot }: {
  casalId: string; cicleId: string; activitats: Activitat[]; pot: (p: string) => boolean;
}) {
  return (
    <div className="dues-columnes">
      {pot("dades.importar") && <Importacio casalId={casalId} cicleId={cicleId} potActivitats={pot("activitats.gestionar")} />}
      {pot("dades.exportar") && <Exportacio casalId={casalId} cicleId={cicleId} activitats={activitats} />}
      {!pot("dades.importar") && !pot("dades.exportar") && <p>No teniu permís per importar ni exportar dades.</p>}
    </div>
  );
}

function Importacio({ casalId, cicleId, potActivitats }: { casalId: string; cicleId: string; potActivitats: boolean }) {
  const [tipus, setTipus] = useState<Tipus>("sollicituds");
  const [fitxer, setFitxer] = useState<{ nom: string; taula: TaulaLlegida } | null>(null);
  const [mapatge, setMapatge] = useState<string[]>([]);
  const [prev, setPrev] = useState<Previsualitzacio | null>(null);
  const [clau, setClau] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [resultat, setResultat] = useState("");
  const [nomesProblemes, setNomesProblemes] = useState(true);

  const camps: readonly string[] = tipus === "sollicituds" ? CAMPS_IMPORTACIO_SOLLICITUDS : CAMPS_IMPORTACIO_ACTIVITATS;
  const obligatoris: readonly string[] = OBLIGATORIS_IMPORTACIO[tipus];

  function reinicia() {
    setFitxer(null); setMapatge([]); setPrev(null); setError(null); setClau(crypto.randomUUID());
  }

  async function tria(f: File | undefined) {
    reinicia();
    setResultat("");
    if (!f) return;
    try {
      const taula = await llegeixFitxer(f);
      if (taula.capcaleres.length === 0) throw new Error("El fitxer és buit o no té fila de capçaleres.");
      if (taula.files.length > MAX_FILES_IMPORTACIO) throw new Error(`El fitxer té ${taula.files.length} files; el màxim és ${MAX_FILES_IMPORTACIO}. Dividiu-lo.`);
      setFitxer({ nom: f.name, taula });
      // Proposta de mapatge: cada capçalera reconeguda, una sola vegada.
      const usats = new Set<string>();
      setMapatge(taula.capcaleres.map((c) => {
        const p = proposaCamp(c, camps);
        if (!p || usats.has(p)) return "";
        usats.add(p);
        return p;
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Files amb només les columnes mapades, amb el nom del camp de destinació. */
  const filesMapades = () => fitxer!.taula.files.map((f) =>
    Object.fromEntries(mapatge.flatMap((desti, i) => (desti ? [[desti, (f[i] ?? "").slice(0, 4000)]] : []))));

  const repetits = mapatge.filter((m, i) => m && mapatge.indexOf(m) !== i);
  const absents = obligatoris.filter((o) => !mapatge.includes(o));

  async function valida() {
    setError(null);
    setEnCurs(true);
    try {
      setPrev(await serveiGestio.previsualitzarImportacio(casalId, cicleId, tipus, { files: filesMapades(), nom_fitxer: fitxer!.nom }));
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  async function confirma() {
    setError(null);
    setEnCurs(true);
    try {
      const r = await serveiGestio.confirmarImportacio(casalId, cicleId, tipus, {
        files: filesMapades(), nom_fitxer: fitxer!.nom, clau, confirmacio: true, files_esperades: prev!.resum.valides,
      });
      setResultat(`Importació feta: ${r.importades} registres importats i ${r.omeses} omesos (amb errors o buits).${tipus === "activitats" ? " Les activitats s'han creat en esborrany: reviseu-les i activeu-les." : ""}`);
      reinicia();
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  return (
    <section aria-labelledby="titol-importacio">
      <h3 id="titol-importacio" className="subseccio">Importació</h3>
      {resultat && <AvisExit>{resultat}</AvisExit>}
      {error && (typeof error === "string" ? <p className="avis avis--error" role="alert">{error}</p> : <MissatgeError error={error} />)}

      <ol className="passos">
        <li className={!fitxer ? "passos__actiu" : ""}>Fitxer</li>
        <li className={fitxer && !prev ? "passos__actiu" : ""}>Columnes i validació</li>
        <li className={prev ? "passos__actiu" : ""}>Confirmació</li>
      </ol>

      {!prev && (
        <div className="formulari">
          <div className="camp">
            <label htmlFor="tipus-importacio">Què voleu importar?</label>
            <select id="tipus-importacio" value={tipus} onChange={(e) => { setTipus(e.target.value as Tipus); reinicia(); }}>
              <option value="sollicituds">Sol·licituds (per exemple, inscripcions en paper)</option>
              {potActivitats && <option value="activitats">Activitats (per exemple, una exportació de PGEc)</option>}
            </select>
          </div>
          <div className="camp">
            <label htmlFor="fitxer-importacio">Fitxer .xlsx o .csv</label>
            <input id="fitxer-importacio" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void tria(e.target.files?.[0])} />
            <p className="camp__ajuda">La primera fila ha de tenir els noms de les columnes. Màxim {MAX_FILES_IMPORTACIO} files.</p>
          </div>
        </div>
      )}

      {fitxer && !prev && (
        <div>
          <p><strong>{fitxer.nom}</strong>: {fitxer.taula.files.length} files. Indiqueu a quin camp correspon cada columna (o deixeu-la sense importar).</p>
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Correspondència de columnes">
            <table className="taula taula--densa">
              <thead><tr><th scope="col">Columna del fitxer</th><th scope="col">Exemple</th><th scope="col">Camp de destinació</th></tr></thead>
              <tbody>
                {fitxer.taula.capcaleres.map((c, i) => (
                  <tr key={i} className={mapatge[i] && repetits.includes(mapatge[i]!) ? "fila--error" : undefined}>
                    <th scope="row">{c || `(columna ${i + 1})`}</th>
                    <td className="text-secundari">{fitxer.taula.files.slice(0, 2).map((f) => f[i]).filter(Boolean).join(" · ").slice(0, 60)}</td>
                    <td>
                      <select aria-label={`Destinació de la columna ${c}`} value={mapatge[i] ?? ""}
                        onChange={(e) => setMapatge((m) => m.map((x, k) => (k === i ? e.target.value : x)))}>
                        <option value="">No importar</option>
                        {camps.map((d) => <option key={d} value={d}>{etiquetaDesti(d)}{obligatoris.includes(d) ? " (obligatori)" : ""}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {repetits.length > 0 && <p className="avis avis--error" role="alert">Hi ha camps de destinació assignats a més d'una columna: {[...new Set(repetits)].map(etiquetaDesti).join(", ")}.</p>}
          {absents.length > 0 && <p className="avis avis--alerta">Falten columnes obligatòries: {absents.map(etiquetaDesti).join(", ")}.</p>}
          <div className="botonera">
            <button type="button" className="boto" disabled={enCurs || repetits.length > 0 || absents.length > 0} onClick={() => void valida()}>
              {enCurs ? "Validant…" : "Valida les dades"}
            </button>
            <button type="button" className="boto boto--secundari" onClick={reinicia}>Cancel·la</button>
          </div>
        </div>
      )}

      {prev && (
        <div>
          <ul className="resum-importacio">
            <li><strong>{prev.resum.valides}</strong> {prev.resum.valides === 1 ? "registre vàlid" : "registres vàlids"}{prev.resum.amb_avisos ? ` (${prev.resum.amb_avisos} amb avisos)` : ""}</li>
            <li><strong>{prev.resum.errors}</strong> amb errors (no s'importaran)</li>
            <li><strong>{prev.resum.buides}</strong> {prev.resum.buides === 1 ? "fila buida (s'ometrà)" : "files buides (s'ometran)"}</li>
          </ul>
          <label className="casella"><input type="checkbox" checked={nomesProblemes} onChange={(e) => setNomesProblemes(e.target.checked)} /> Mostra només les files amb errors o avisos</label>
          <div className="taula-contenidor taula-contenidor--alta" tabIndex={0} role="region" aria-label="Resultat de la validació">
            <table className="taula taula--densa">
              <thead><tr><th scope="col">Fila</th><th scope="col">Registre</th><th scope="col">Resultat</th></tr></thead>
              <tbody>
                {prev.files.filter((f) => !nomesProblemes || f.estat === "error" || f.estat === "avis").map((f) => (
                  <tr key={f.fila} className={f.estat === "error" ? "fila--error" : f.estat === "avis" ? "fila--avis" : undefined}>
                    <td>{f.fila}</td>
                    <td>{f.descripcio}</td>
                    <td>
                      {f.estat === "valida" && "Correcta"}
                      {f.estat === "buida" && "Buida"}
                      {f.errors.length > 0 && <ul className="llista-errors">{f.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                      {f.avisos.length > 0 && <ul className="llista-avisos">{f.avisos.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-secundari">La fila 1 del fitxer és la de capçaleres. Les dades existents no es modifiquen: només s'afegeixen registres nous.</p>
          <div className="botonera">
            <button type="button" className="boto" disabled={enCurs || prev.resum.valides === 0} onClick={() => void confirma()}>
              {enCurs ? "Important…" : `Confirma la importació de ${prev.resum.valides} ${prev.resum.valides === 1 ? "registre" : "registres"}`}
            </button>
            <button type="button" className="boto boto--secundari" disabled={enCurs} onClick={() => setPrev(null)}>Torna a les columnes</button>
            <button type="button" className="boto boto--secundari" disabled={enCurs} onClick={reinicia}>Cancel·la</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Exportacio({ casalId, cicleId, activitats }: { casalId: string; cicleId: string; activitats: Activitat[] }) {
  const [activitat, setActivitat] = useState("");
  const [enCurs, setEnCurs] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");

  async function exporta(activitatId?: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      const taula = await serveiGestio.exportacioSollicituds(casalId, cicleId, activitatId);
      descarrega(await generaXlsx(taula), taula.fitxer);
      setExit(`S'ha generat ${taula.fitxer} amb ${taula.files.length} files.`);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  return (
    <section aria-labelledby="titol-exportacio">
      <h3 id="titol-exportacio" className="subseccio">Exportació (XLSX)</h3>
      {exit && <AvisExit>{exit}</AvisExit>}
      {error && <MissatgeError error={error} />}
      <p className="text-secundari">Els fitxers inclouen només les dades que podeu consultar. Cada exportació queda registrada.</p>
      <div className="botonera">
        <button type="button" className="boto boto--secundari" disabled={enCurs} onClick={() => void exporta()}>Sol·licituds del cicle</button>
      </div>
      <div className="camp camp--en-linia">
        <label htmlFor="exportacio-activitat">Sol·licitants d'una activitat</label>
        <select id="exportacio-activitat" value={activitat} onChange={(e) => setActivitat(e.target.value)}>
          <option value="">Trieu una activitat</option>
          {activitats.filter((a) => a.estat !== "arxivada").map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <button type="button" className="boto boto--secundari" disabled={enCurs || !activitat} onClick={() => void exporta(activitat)}>Exporta</button>
      </div>
      <p className="text-secundari">Les persones admeses i les llistes d'espera s'exporten des de «Places i llistes d'espera», i els resultats de cada proposta, des de la seva pàgina. L'assistència arribarà amb el control d'assistència.</p>
    </section>
  );
}
