import { useState } from "react";
import { Link } from "react-router";
import { proposaCamp } from "../../../shared/domain/importacio";
import { CAMPS_IMPORTACIO_ACTIVITATS } from "../../../shared/schemas/sollicituds";
import { MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { llegeixFitxer } from "../../fitxers/xlsx";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, ResultatImportacioActivitats } from "../../types/gestio";
import { formataHorari } from "../../utils/format";
import { FormActivitat } from "./FormActivitat";

const MAX_FILES = 400;

/** Data curta per a la taula (DD/MM/AAAA). */
const dataCurta = (d: string) => d.split("-").reverse().join("/");
const teHorari = (a: Activitat) => !!a.horari_text || a.dies_setmana.length > 0 || !!a.hora_inici;

/**
 * Activitats del cicle (decisió de 2026-10-15): s'importa el llistat de la PGEc
 * tal com surt de la plataforma, sense passos de confirmació, i cada filera es
 * pot corregir amb «Edita».
 */
export function GestioActivitats({ casalId, cicleId, activitats, potGestionar, potCartells, editable, onCanvi }: {
  casalId: string; cicleId: string; activitats: Activitat[]; potGestionar: boolean; potCartells: boolean;
  /** El cicle encara admet canvis d'activitats. */
  editable: boolean;
  onCanvi: () => void;
}) {
  const [editant, setEditant] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [important, setImportant] = useState(false);
  const [resultat, setResultat] = useState<ResultatImportacioActivitats | null>(null);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<string | ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState<string | null>(null);
  const visibles = activitats.filter((a) => a.estat !== "arxivada");
  const pot = potGestionar && editable;

  async function importa(fitxer: File | undefined) {
    setError(null); setExit(""); setResultat(null);
    if (!fitxer) return;
    setImportant(true);
    try {
      const taula = await llegeixFitxer(fitxer);
      if (taula.capcaleres.length === 0) throw new Error("El fitxer és buit o no té fila de capçaleres.");
      if (taula.files.length > MAX_FILES) throw new Error(`El fitxer té ${taula.files.length} files; el màxim és ${MAX_FILES}.`);
      // Cada capçalera reconeguda va al seu camp (una sola vegada); la resta de columnes no s'envien.
      const usats = new Set<string>();
      const desti = taula.capcaleres.map((c) => {
        const camp = proposaCamp(c, CAMPS_IMPORTACIO_ACTIVITATS);
        if (!camp || usats.has(camp)) return null;
        usats.add(camp);
        return camp;
      });
      if (!usats.has("nom")) throw new Error("No s'ha trobat la columna del títol de l'activitat (per exemple «Nom activitat» o «Títol»).");
      const files = taula.files.map((f) =>
        Object.fromEntries(desti.flatMap((camp, i) => (camp ? [[camp, (f[i] ?? "").slice(0, 4000)]] : []))));
      setResultat(await serveiGestio.importarActivitatsPgec(casalId, cicleId, { files, nom_fitxer: fitxer.name }));
      onCanvi();
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else setError((e as Error).message);
    } finally {
      setImportant(false);
    }
  }

  async function canviaEstat(a: Activitat) {
    const estat = a.estat === "activa" ? "inactiva" : "activa";
    setError(null); setExit(""); setEnCurs(a.id);
    try {
      await serveiGestio.canviarEstatActivitat(casalId, a.id, { estat, versio: a.versio });
      setExit(estat === "activa" ? `«${a.nom}» torna a sortir al formulari.` : `«${a.nom}» ja no surt al formulari.`);
      onCanvi();
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setEnCurs(null);
    }
  }

  return (
    <div>
      {pot && (
        <div className="importa-pgec">
          <input id="fitxer-pgec" className="visualment-amagat" type="file" disabled={important}
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { void importa(e.target.files?.[0]); e.target.value = ""; }} />
          <label className="boto" htmlFor="fitxer-pgec" aria-disabled={important}>
            {important ? "Important…" : "Importa el llistat de la PGEC (CSV o XLSX)"}
          </label>
          <p className="camp__ajuda">
            S'importen totes les fileres: títol, codi FA, dies, hores, dates, places, aula i persones a qui va dirigida.
            Si un codi FA ja existeix al cicle, s'actualitza l'activitat.
          </p>
        </div>
      )}

      <div aria-live="polite">
        {resultat && (
          <AvisExit>
            Importació feta: {resultat.creades} activitats noves, {resultat.actualitzades} actualitzades
            {resultat.sense_canvis ? `, ${resultat.sense_canvis} sense canvis` : ""}{resultat.omeses ? ` i ${resultat.omeses} no importades` : ""}.
          </AvisExit>
        )}
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && (typeof error === "string" ? <p className="avis avis--error" role="alert">{error}</p> : <MissatgeError error={error} />)}
      </div>
      {resultat && resultat.avisos.length > 0 && (
        <div className="avis avis--alerta">
          <p>Revisa aquestes fileres amb «Edita»:</p>
          <ul>{resultat.avisos.map((a) => <li key={a.fila}>Fila {a.fila}, <strong>{a.activitat}</strong>: {a.avisos.join(" ")}</li>)}</ul>
        </div>
      )}

      {visibles.length === 0 ? <p>Aquest cicle encara no té activitats.</p> : (
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Activitats del cicle">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">Codi FA</th><th scope="col">Activitat</th><th scope="col">Dies i horari</th><th scope="col">Dates</th>
                <th scope="col">Places</th><th scope="col">Aula</th><th scope="col">A qui va dirigida</th><th scope="col">Estat</th>
                {(pot || potCartells) && <th scope="col">Accions</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => editant === a.id ? (
                <tr key={a.id}><td colSpan={9}>
                  <FormActivitat activitat={a} textBoto="Desa l'activitat" onCancelar={() => setEditant(null)} onDesar={async (dades) => {
                    await serveiGestio.actualitzarActivitat(casalId, a.id, { ...dades, versio: a.versio });
                    setEditant(null);
                    setExit(`S'ha desat l'activitat «${String(dades.nom)}».`);
                    onCanvi();
                  }} />
                </td></tr>
              ) : (
                <tr key={a.id} className={a.estat !== "activa" ? "fila--inactiva" : undefined}>
                  <td className="text-secundari">{a.codi_extern ?? "—"}</td>
                  <td><strong>{a.nom}</strong></td>
                  <td>{teHorari(a) ? formataHorari(a) : "—"}</td>
                  <td className="sense-salt">{a.data_inici ? <>{dataCurta(a.data_inici)}{a.data_fi && <><br />{dataCurta(a.data_fi)}</>}</> : "—"}</td>
                  <td>{a.capacitat}</td>
                  <td>{a.espai ?? "—"}</td>
                  <td>{a.destinataris ?? "—"}</td>
                  <td>{a.estat === "activa" ? "Al formulari" : "No surt al formulari"}</td>
                  {(pot || potCartells) && (
                    <td><div className="accions-fila accions-fila--horitzontal">
                      {pot && <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditant(a.id)}>Edita</button>}
                      {potCartells && (
                        <Link className="boto boto--secundari boto--petit"
                          to={`/gestio/${casalId}/cartells/nou?cicle=${encodeURIComponent(cicleId)}&activitat=${encodeURIComponent(a.id)}`}>Cartell</Link>
                      )}
                      {pot && (
                        <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs === a.id} onClick={() => void canviaEstat(a)}>
                          {a.estat === "activa" ? "Treu del formulari" : "Posa al formulari"}
                        </button>
                      )}
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pot && (nova ? (
        <div>
          <h3 className="subseccio">Nova activitat</h3>
          <FormActivitat textBoto="Crea l'activitat" onCancelar={() => setNova(false)} onDesar={async (dades) => {
            const { activitat } = await serveiGestio.crearActivitat(casalId, cicleId, dades);
            await serveiGestio.canviarEstatActivitat(casalId, activitat.id, { estat: "activa", versio: activitat.versio });
            setNova(false);
            setExit(`S'ha creat l'activitat «${activitat.nom}».`);
            onCanvi();
          }} />
        </div>
      ) : (
        <div className="botonera">
          <button type="button" className="boto boto--secundari" onClick={() => setNova(true)}>Afegeix una activitat a mà</button>
        </div>
      ))}
    </div>
  );
}
