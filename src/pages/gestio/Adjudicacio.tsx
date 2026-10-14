import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  CRITERIS_ORDRE, ESTATS_PARTICIPANTS, METODES, NUMERACIONS_SORTEIG, TIPUS_SORTEIG, type ParametresAdjudicacio,
} from "../../../shared/domain/adjudicacio";
import {
  ETIQUETES_CRITERI, ETIQUETES_ESTAT_EXECUCIO, ETIQUETES_METODE, ETIQUETES_NUMERACIO, ETIQUETES_TIPUS_SORTEIG,
} from "../../../shared/schemas/adjudicacio";
import { ETIQUETES_ESTAT_SOLLICITUD } from "../../../shared/schemas/sollicituds";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { ResumAdjudicacio } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

/**
 * Paràmetres versionats de l'adjudicació, càlcul de propostes i llista
 * d'execucions. La revisió i la confirmació es fan a la pàgina de cada proposta.
 */
export function Adjudicacio({ casalId, cicleId, pot, versioCicle }: {
  casalId: string; cicleId: string; pot: (p: string) => boolean; versioCicle: number;
}) {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.adjudicacio(casalId, cicleId, s), [casalId, cicleId, versio, versioCicle]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [lletra, setLletra] = useState("");

  if (consulta.tipus === "carregant") return <Carregant text="Carregant l'adjudicació…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const p = d.configuracio?.parametres;

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  const calcula = (e: FormEvent) => {
    e.preventDefault();
    void accio(() => serveiGestio.calcularProposta(casalId, cicleId, p?.criteri_ordre === "lletra" && lletra ? { lletra } : {}),
      "S'ha calculat una proposta nova. Reviseu-la abans de confirmar-la.");
  };

  return (
    <div>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
      </div>

      <h3 className="subseccio">Paràmetres</h3>
      <p className="avis avis--alerta">
        Els valors inicials segueixen la regla indicada pel casal: prioritat per a qui va quedar en llista d'espera el cicle anterior
        (1a o 2a preferència), després per preferència i, si no hi ha places per a tothom, sorteig a cada activitat.
        Reviseu-los abans de desar-los. Cada canvi es desa com una versió nova i cada proposta indica amb quina versió s'ha calculat.
      </p>
      {d.pot_desar_parametres && pot("adjudicacio.executar") ? (
        <FormParametres resum={d} enCurs={enCurs} onDesar={(parametres) => accio(
          () => serveiGestio.desarParametresAdjudicacio(casalId, cicleId, { parametres, versio_actual: d.configuracio?.versio ?? null }),
          "S'han desat els paràmetres d'adjudicació.")} />
      ) : p ? <ResumParametres parametres={p} /> : <p>Encara no s'han definit els paràmetres d'adjudicació.</p>}
      {d.configuracio && (
        <p className="text-secundari">Versió {d.configuracio.versio}, desada el {formataDataHora(d.configuracio.creat_el)}.</p>
      )}

      <h3 className="subseccio">Propostes d'adjudicació</h3>
      {p?.criteri_ordre === "sorteig_activitat" && (
        <p className="text-secundari">Abans de calcular, feu el sorteig de cada activitat que té més sol·licituds que places (secció «Sorteig per activitat»).</p>
      )}
      {pot("adjudicacio.executar") && (d.pot_calcular ? (
        <form onSubmit={calcula} className="botonera">
          {p?.criteri_ordre === "lletra" && (
            <label className="filtre">
              Lletra sortejada (si la deixeu buida, la sorteja el sistema)
              <input value={lletra} onChange={(e) => setLletra(e.target.value.slice(0, 1).toUpperCase())} pattern="[A-Za-z]" size={2} />
            </label>
          )}
          <button type="submit" className="boto" disabled={enCurs}>{enCurs ? "Calculant…" : "Calcula una proposta"}</button>
        </form>
      ) : (
        <p className="text-secundari">
          {!d.configuracio ? "Per calcular una proposta, primer deseu els paràmetres." :
            "Per calcular una proposta, passeu el cicle a «En procés d'adjudicació»."}
        </p>
      ))}
      {d.execucions.length === 0 ? <p>Encara no s'ha calculat cap proposta.</p> : (
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Propostes d'adjudicació">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">Versió</th><th scope="col">Estat</th><th scope="col">Calculada</th><th scope="col">Paràmetres</th>
                <th scope="col">Places adjudicades</th><th scope="col">Sense plaça</th><th scope="col"><span className="visualment-amagat">Accions</span></th>
              </tr>
            </thead>
            <tbody>
              {d.execucions.map((e) => (
                <tr key={e.id}>
                  <td>v{e.versio}</td>
                  <td><span className={`etiqueta etiqueta--${e.estat}`}>{ETIQUETES_ESTAT_EXECUCIO[e.estat]}</span></td>
                  <td className="nowrap">{formataDataHora(e.executada_el)}</td>
                  <td>v{e.configuracio_versio}{e.lletra_sorteig ? ` · lletra ${e.lletra_sorteig}` : ""}</td>
                  <td>{e.resum.places_adjudicades ?? ""}</td>
                  <td>{e.resum.sollicituds_sense_placa ?? ""}</td>
                  <td><Link to={`/gestio/${casalId}/adjudicacions/${e.id}`}>{e.estat === "proposta" ? "Revisa i confirma" : "Consulta"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResumParametres({ parametres: p }: { parametres: ParametresAdjudicacio }) {
  return (
    <dl className="dades">
      {p.prioritat_espera_anterior && (
        <div><dt>Prioritat absoluta</dt><dd>Llista d'espera del cicle anterior, en preferències 1 a {p.preferencia_maxima_espera_anterior}</dd></div>
      )}
      <div><dt>Ordre de prioritat</dt><dd>{ETIQUETES_CRITERI[p.criteri_ordre]}</dd></div>
      {p.criteri_ordre === "sorteig_activitat" && (
        <div><dt>Sorteig</dt><dd>{ETIQUETES_TIPUS_SORTEIG[p.tipus_sorteig]}{p.tipus_sorteig === "numero" ? ` · ${ETIQUETES_NUMERACIO[p.numeracio_sorteig]}` : ""}</dd></div>
      )}
      <div><dt>Mètode</dt><dd>{ETIQUETES_METODE[p.metode]}</dd></div>
      <div><dt>Màxim d'activitats per persona</dt><dd>{p.maxim_activitats_per_persona ?? "Sense límit"}</dd></div>
      <div><dt>Prioritat per continuïtat</dt><dd>{p.prioritat_continuitat ? "Sí" : "No"}</dd></div>
      <div><dt>Llista d'espera</dt><dd>{p.llista_espera ? "Sí" : "No"}</dd></div>
      <div><dt>Sol·licituds que hi entren</dt><dd>{p.estats_sollicitud.map((e) => ETIQUETES_ESTAT_SOLLICITUD[e]).join(", ")}</dd></div>
    </dl>
  );
}

function FormParametres({ resum, enCurs, onDesar }: {
  resum: ResumAdjudicacio; enCurs: boolean; onDesar: (p: ParametresAdjudicacio) => void;
}) {
  const [p, setP] = useState<ParametresAdjudicacio>(resum.configuracio?.parametres ?? resum.parametres_inicials);
  const [maxim, setMaxim] = useState(p.maxim_activitats_per_persona?.toString() ?? "");
  const [prefEspera, setPrefEspera] = useState(String(p.preferencia_maxima_espera_anterior));
  // Amb sorteig per activitat, el mètode és sempre per rondes.
  const canvia = (c: Partial<ParametresAdjudicacio>) => setP((x) => {
    const nou = { ...x, ...c };
    return nou.criteri_ordre === "sorteig_activitat" ? { ...nou, metode: "per_rondes" } : nou;
  });
  const maximValid = maxim === "" || (/^\d+$/.test(maxim) && Number(maxim) >= 1 && Number(maxim) <= 30);
  const prefValid = /^\d+$/.test(prefEspera) && Number(prefEspera) >= 1 && Number(prefEspera) <= 30;
  const perActivitat = p.criteri_ordre === "sorteig_activitat";

  const desa = (e: FormEvent) => {
    e.preventDefault();
    if (!maximValid || !prefValid || p.estats_sollicitud.length === 0) return;
    onDesar({ ...p, maxim_activitats_per_persona: maxim === "" ? null : Number(maxim), preferencia_maxima_espera_anterior: Number(prefEspera) });
  };

  return (
    <form onSubmit={desa} className="formulari">
      <fieldset className="camp">
        <legend>1. Prioritat absoluta</legend>
        <label className="casella">
          <input type="checkbox" checked={p.prioritat_espera_anterior} onChange={(e) => canvia({ prioritat_espera_anterior: e.target.checked })} />
          Qui va quedar en llista d'espera de l'activitat el cicle anterior passa davant de tothom en aquella activitat
        </label>
        {p.prioritat_espera_anterior && (
          <div className={`camp camp--compacte camp--mitja ${prefValid ? "" : "camp--error"}`}>
            <label htmlFor="pref-espera">Si l'havia triat com a preferència fins a la</label>
            <input id="pref-espera" inputMode="numeric" value={prefEspera} onChange={(e) => setPrefEspera(e.target.value.trim())} aria-describedby="pref-espera-ajuda" />
            <p id="pref-espera-ajuda" className="camp__ajuda">Per exemple, 2: només compta si era la 1a o la 2a opció.</p>
            {!prefValid && <p className="camp__missatge" role="alert">Ha de ser un número entre 1 i 30.</p>}
          </div>
        )}
        <p className="camp__ajuda">
          Es reconeix la mateixa persona pel nom i cognoms més la data de naixement o el telèfon (o el codi intern o el document, si n'hi ha).
        </p>
      </fieldset>
      <fieldset className="camp">
        <legend>2. Ordre entre persones</legend>
        {CRITERIS_ORDRE.map((c) => (
          <label key={c} className="casella">
            <input type="radio" name="criteri" checked={p.criteri_ordre === c} onChange={() => canvia({ criteri_ordre: c })} /> {ETIQUETES_CRITERI[c]}
          </label>
        ))}
      </fieldset>
      {perActivitat && (
        <fieldset className="camp">
          <legend>Tipus de sorteig (un per activitat)</legend>
          {TIPUS_SORTEIG.map((t) => (
            <label key={t} className="casella">
              <input type="radio" name="tipus-sorteig" checked={p.tipus_sorteig === t} onChange={() => canvia({ tipus_sorteig: t })} /> {ETIQUETES_TIPUS_SORTEIG[t]}
            </label>
          ))}
          {p.tipus_sorteig === "numero" && (
            <fieldset className="camp">
              <legend>Número de cada persona</legend>
              {NUMERACIONS_SORTEIG.map((n) => (
                <label key={n} className="casella">
                  <input type="radio" name="numeracio" checked={p.numeracio_sorteig === n} onChange={() => canvia({ numeracio_sorteig: n })} /> {ETIQUETES_NUMERACIO[n]}
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>
      )}
      <fieldset className="camp">
        <legend>Mètode d'assignació</legend>
        {METODES.map((m) => (
          <label key={m} className="casella">
            <input type="radio" name="metode" checked={p.metode === m} disabled={perActivitat && m !== "per_rondes"}
              onChange={() => canvia({ metode: m })} /> {ETIQUETES_METODE[m]}
          </label>
        ))}
        {perActivitat && <p className="camp__ajuda">Amb sorteig per activitat, primer s'assignen les 1es preferències de tothom, després les 2es, etc.</p>}
      </fieldset>
      <div className={`camp camp--compacte camp--mitja ${maximValid ? "" : "camp--error"}`}>
        <label htmlFor="maxim-activitats">Màxim d'activitats admeses per persona</label>
        <input id="maxim-activitats" inputMode="numeric" value={maxim} onChange={(e) => setMaxim(e.target.value.trim())} aria-describedby="maxim-ajuda" />
        <p id="maxim-ajuda" className="camp__ajuda">Deixeu-lo buit si no hi ha límit.</p>
        {!maximValid && <p className="camp__missatge" role="alert">Ha de ser un número entre 1 i 30.</p>}
      </div>
      <label className="casella">
        <input type="checkbox" checked={p.prioritat_continuitat} onChange={(e) => canvia({ prioritat_continuitat: e.target.checked })} />
        Prioritat per continuïtat: qui ja feia l'activitat el cicle anterior passa primer en aquella activitat
      </label>
      <label className="casella">
        <input type="checkbox" checked={p.llista_espera} onChange={(e) => canvia({ llista_espera: e.target.checked })} />
        Crear llista d'espera amb qui no obtingui plaça
      </label>
      <fieldset className="camp">
        <legend>Sol·licituds que entren a l'adjudicació</legend>
        {ESTATS_PARTICIPANTS.map((e) => (
          <label key={e} className="casella">
            <input type="checkbox" checked={p.estats_sollicitud.includes(e)} onChange={(ev) => canvia({
              estats_sollicitud: ev.target.checked ? [...p.estats_sollicitud, e] : p.estats_sollicitud.filter((x) => x !== e),
            })} /> {ETIQUETES_ESTAT_SOLLICITUD[e]}
          </label>
        ))}
        {p.estats_sollicitud.length === 0 && <p className="camp__missatge" role="alert">Trieu almenys un estat.</p>}
        <p className="camp__ajuda">Les sol·licituds anul·lades no hi entren mai.</p>
      </fieldset>
      <div className="botonera">
        <button type="submit" className="boto" disabled={enCurs}>{resum.configuracio ? "Desa una versió nova" : "Desa els paràmetres"}</button>
      </div>
    </form>
  );
}
