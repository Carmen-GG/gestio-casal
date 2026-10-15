import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ETIQUETES_MOTIU_NO_CONTACTE, type CanalComunicacio, type EstatComunicacio, type MotiuNoContacte,
} from "../../../shared/schemas/comunicacions";
import { analitzaTelefon, enllacWhatsapp, missatgeAdmissio, missatgeEspera, missatgeOferta } from "../../../shared/domain/whatsapp";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { DadesComunicacions, PersonaComunicacio } from "../../types/gestio";
import { usePermisos } from "./context";

type Grup = DadesComunicacions["activitats"][number];
type Fila = PersonaComunicacio & { grup: Grup };
/** Situació de cada persona i activitat respecte a la comunicació. */
type Estat =
  | { tipus: "pendent"; reenviar: boolean }
  | { tipus: "enviat" }
  | { tipus: "trucar"; motiu: MotiuNoContacte }
  | { tipus: "trucada" };

const MOTIUS_MANUALS: MotiuNoContacte[] = ["sense_whatsapp", "no_respon", "telefon_invalid", "altres"];
const situacioText = (p: PersonaComunicacio) =>
  p.situacio === "admesa" ? "Admesa" : `Llista d'espera${p.posicio ? ` (${p.posicio})` : ""}${p.oferta_pendent ? ", plaça oferta" : ""}`;

/** Què cal fer amb cada fila, a partir del telèfon i del que ja s'ha registrat. */
export function estatComunicacio(p: PersonaComunicacio): Estat {
  const c = p.comunicacio;
  // Si la situació ha canviat des de l'avís (p. ex. ha passat d'espera a admesa), cal tornar a avisar.
  const vigent = c && c.tipus === p.situacio;
  if (c && vigent && c.estat === "contactat_telefon") return { tipus: "trucada" };
  if (c && vigent && c.estat === "no_contactat") return { tipus: "trucar", motiu: c.motiu ?? "altres" };
  if (c && vigent && c.estat === "enviat") return { tipus: "enviat" };
  const t = analitzaTelefon(p.telefon);
  if (!t.internacional) return { tipus: "trucar", motiu: t.tipus === "fix" ? "telefon_fix" : t.tipus === "sense" ? "sense_telefon" : "telefon_invalid" };
  return { tipus: "pendent", reenviar: !!c };
}

const missatge = (d: DadesComunicacions, f: Fila) => {
  const base = { nom: f.nom, casal: d.casal, activitat: f.grup.activitat, horari: f.grup.horari, espai: f.grup.espai,
    data_inici: f.grup.data_inici > d.avui ? f.grup.data_inici : null };
  // A qui se li ha ofert una plaça vacant, el missatge és l'oferta, no la llista d'espera.
  if (f.oferta_pendent) return missatgeOferta(base);
  return f.situacio === "admesa" ? missatgeAdmissio(base) : missatgeEspera({ ...base, posicio: f.posicio });
};
const enllac = (d: DadesComunicacions, f: Fila) => enllacWhatsapp(analitzaTelefon(f.telefon).internacional!, missatge(d, f));

/**
 * Comunicacions segons activitat (petició de 2026-10-15): un missatge de WhatsApp per
 * activitat i persona, admesa o en llista d'espera, i el llistat de les persones que
 * no s'han pogut contactar, amb les seves activitats, per trucar-les.
 *
 * Sense l'API de WhatsApp Business l'enviament és semiautomàtic: cada clic obre WhatsApp
 * amb el missatge escrit i queda registrat com a enviat.
 */
export function Comunicacions() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.comunicacions(casalId, cicleId, s), [casalId, cicleId, versio]);
  const [activitat, setActivitat] = useState("");
  const [situacio, setSituacio] = useState<"" | "admesa" | "espera">("");
  const [veure, setVeure] = useState<"pendents" | "tots" | "enviats" | "trucar">("pendents");
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | Error | null>(null);
  const [enCurs, setEnCurs] = useState<string | null>(null);
  const [noContactat, setNoContactat] = useState<Fila | null>(null);
  const [motiu, setMotiu] = useState<MotiuNoContacte>("sense_whatsapp");
  const [nota, setNota] = useState("");

  useEffect(() => () => document.body.classList.remove("pagina-impressio", "imprimint-trucades"), []);

  const files = useMemo<Fila[]>(() => consulta.tipus === "dades"
    ? consulta.dades.activitats.flatMap((g) => g.persones.map((p) => ({ ...p, grup: g }))) : [], [consulta]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant les persones a comunicar…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const gestiona = pot("places.gestionar");

  const filtrades = files.filter((f) => (!activitat || f.grup.activitat_id === activitat) && (!situacio || f.situacio === situacio))
    .filter((f) => {
      const e = estatComunicacio(f).tipus;
      return veure === "tots" || (veure === "pendents" ? e === "pendent" : veure === "enviats" ? e === "enviat" || e === "trucada" : e === "trucar");
    });
  const estats = files.map(estatComunicacio);
  const totals = {
    total: files.length,
    enviats: estats.filter((e) => e.tipus === "enviat" || e.tipus === "trucada").length,
    pendents: estats.filter((e) => e.tipus === "pendent").length,
    trucar: estats.filter((e) => e.tipus === "trucar").length,
  };
  const seguent = filtrades.find((f) => estatComunicacio(f).tipus === "pendent");

  async function registra(f: Fila, dades: { canal: CanalComunicacio; estat: EstatComunicacio; motiu?: MotiuNoContacte; nota?: string }, text: string) {
    setError(null);
    setExit("");
    setEnCurs(f.placa_id);
    try {
      await serveiGestio.registrarComunicacio(casalId, f.placa_id, { tipus: f.situacio, ...dades });
      setExit(text);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof Error) setError(e);
      else throw e;
    } finally {
      setEnCurs(null);
    }
  }
  const enviat = (f: Fila) => void registra(f, { canal: "whatsapp_manual", estat: "enviat" },
    `Missatge a ${f.nom} ${f.cognoms} (${f.grup.activitat}) marcat com a enviat.`);
  async function desfer(f: Fila) {
    setError(null);
    setEnCurs(f.placa_id);
    try {
      await serveiGestio.desferComunicacio(casalId, f.placa_id);
      setExit(`S'ha desfet el registre de ${f.nom} ${f.cognoms} (${f.grup.activitat}).`);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof Error) setError(e);
      else throw e;
    } finally {
      setEnCurs(null);
    }
  }

  return (
    <div className="comunicacions">
      <div className="no-imprimir-trucades">
        <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${cicleId}`}>Tornar al cicle «{d.cicle.nom}»</Link></p>
        <h1>Comunicacions segons activitat</h1>
        <p className="text-secundari">
          Un missatge de WhatsApp per activitat i persona, tant si és admesa com si ha quedat en llista d'espera.
          Cada «Envia per WhatsApp» obre el WhatsApp del casal amb el missatge escrit: només cal prémer Envia, i aquí queda marcat com a enviat.
          Quan el casal tingui l'API de WhatsApp Business, els mateixos missatges es podran enviar sols.
        </p>
        <div aria-live="polite">
          {exit && <AvisExit>{exit}</AvisExit>}
          {error && (error instanceof ErrorClientApi ? <MissatgeError error={error} /> : <p className="avis avis--error" role="alert">{error.message}</p>)}
        </div>

        <p className="resum-comunicacions" role="status">
          <strong>{totals.enviats}</strong> de {totals.total} avisats · <strong>{totals.pendents}</strong> per enviar · <strong>{totals.trucar}</strong> per trucar
        </p>

        {d.activitats.length === 0 ? <p>Encara no hi ha cap persona admesa ni en llista d'espera en aquest cicle.</p> : (
          <>
            <div className="barra-filtres">
              <label className="filtre">Activitat
                <select value={activitat} onChange={(e) => setActivitat(e.target.value)}>
                  <option value="">Totes</option>
                  {d.activitats.map((g) => <option key={g.activitat_id} value={g.activitat_id}>{g.activitat}</option>)}
                </select>
              </label>
              <label className="filtre">Situació
                <select value={situacio} onChange={(e) => setSituacio(e.target.value as typeof situacio)}>
                  <option value="">Admeses i llista d'espera</option>
                  <option value="admesa">Només admeses</option>
                  <option value="espera">Només llista d'espera</option>
                </select>
              </label>
              <label className="filtre">Mostra
                <select value={veure} onChange={(e) => setVeure(e.target.value as typeof veure)}>
                  <option value="pendents">Per enviar</option>
                  <option value="enviats">Ja avisats</option>
                  <option value="trucar">Per trucar</option>
                  <option value="tots">Tots</option>
                </select>
              </label>
            </div>
            {gestiona && seguent && (
              <div className="botonera">
                <a className="boto boto--whatsapp" href={enllac(d, seguent)} target="_blank" rel="noopener noreferrer" onClick={() => enviat(seguent)}>
                  Envia el següent: {seguent.nom} {seguent.cognoms} · {seguent.grup.activitat}
                  <span className="visualment-amagat"> (s'obre WhatsApp en una finestra nova)</span>
                </a>
              </div>
            )}

            {d.activitats.filter((g) => filtrades.some((f) => f.grup === g)).map((g) => (
              <Seccio key={g.activitat_id} titol={`${g.activitat} (${filtrades.filter((f) => f.grup === g).length})`}>
                <div className="taula-contenidor" tabIndex={0} role="region" aria-label={`Comunicacions de ${g.activitat}`}>
                  <table className="taula taula--densa">
                    <thead>
                      <tr><th scope="col">Nom</th><th scope="col">Cognoms</th><th scope="col">Telèfon</th><th scope="col">Situació</th><th scope="col">Estat</th><th scope="col">Accions</th></tr>
                    </thead>
                    <tbody>
                      {filtrades.filter((f) => f.grup === g).map((f) => (
                        <FilaComunicacio key={f.placa_id} d={d} f={f} gestiona={gestiona} enCurs={enCurs === f.placa_id}
                          onEnviat={() => enviat(f)} onDesfer={() => void desfer(f)}
                          onNoContactat={() => { setMotiu("sense_whatsapp"); setNota(""); setNoContactat(f); }}
                          onTrucada={() => void registra(f, { canal: "telefon", estat: "contactat_telefon" }, `${f.nom} ${f.cognoms}: trucada registrada.`)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Seccio>
            ))}
            {filtrades.length === 0 && <p>No hi ha cap persona amb aquests filtres.</p>}
          </>
        )}
      </div>

      <LlistatTrucades d={d} files={files} />

      <DialegConfirmacio obert={noContactat !== null} titol="No s'ha pogut contactar" textConfirmar="Desa" enCurs={enCurs !== null}
        onCancelar={() => setNoContactat(null)}
        onConfirmar={() => {
          const f = noContactat!;
          setNoContactat(null);
          void registra(f, { canal: "whatsapp_manual", estat: "no_contactat", motiu, ...(nota.trim() ? { nota: nota.trim() } : {}) },
            `S'ha afegit ${f.nom} ${f.cognoms} al llistat per trucar.`);
        }}>
        {noContactat && (
          <>
            <p><strong>{noContactat.nom} {noContactat.cognoms}</strong> · {noContactat.grup.activitat}. Sortirà al llistat de persones per trucar.</p>
            <div className="camp">
              <label htmlFor="motiu-no-contacte">Motiu</label>
              <select id="motiu-no-contacte" value={motiu} onChange={(e) => setMotiu(e.target.value as MotiuNoContacte)}>
                {MOTIUS_MANUALS.map((m) => <option key={m} value={m}>{ETIQUETES_MOTIU_NO_CONTACTE[m]}</option>)}
              </select>
            </div>
            <div className="camp">
              <label htmlFor="nota-no-contacte">Nota (opcional)</label>
              <input id="nota-no-contacte" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
            </div>
          </>
        )}
      </DialegConfirmacio>
    </div>
  );
}

function FilaComunicacio({ d, f, gestiona, enCurs, onEnviat, onDesfer, onNoContactat, onTrucada }: {
  d: DadesComunicacions; f: Fila; gestiona: boolean; enCurs: boolean;
  onEnviat: () => void; onDesfer: () => void; onNoContactat: () => void; onTrucada: () => void;
}) {
  const e = estatComunicacio(f);
  const text = e.tipus === "pendent" ? (e.reenviar ? "Cal tornar a avisar: ha canviat la situació" : "Per enviar")
    : e.tipus === "enviat" ? "Enviat per WhatsApp"
    : e.tipus === "trucada" ? "S'hi ha parlat per telèfon"
    : `Per trucar: ${ETIQUETES_MOTIU_NO_CONTACTE[e.motiu]}`;
  return (
    <tr className={e.tipus === "trucar" ? "fila--avis" : e.tipus === "enviat" || e.tipus === "trucada" ? "fila--feta" : undefined}>
      <td>{f.nom}</td>
      <td>{f.cognoms}</td>
      <td className="nowrap">{f.telefon ?? "—"}</td>
      <td>{situacioText(f)}</td>
      <td>{text}</td>
      <td>
        {gestiona && (
          <div className="accions-fila accions-fila--horitzontal">
            {e.tipus === "pendent" && (
              <a className="boto boto--whatsapp boto--petit" href={enllac(d, f)} target="_blank" rel="noopener noreferrer"
                onClick={onEnviat} aria-disabled={enCurs}>
                Envia per WhatsApp<span className="visualment-amagat"> a {f.nom} {f.cognoms} (s'obre en una finestra nova)</span>
              </a>
            )}
            {(e.tipus === "pendent" || e.tipus === "enviat") && (
              <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={onNoContactat}>No s'ha pogut contactar</button>
            )}
            {e.tipus === "trucar" && (
              <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={onTrucada}>Trucada feta</button>
            )}
            {f.comunicacio && e.tipus !== "pendent" && (
              <button type="button" className="boto-enllac" disabled={enCurs} onClick={onDesfer}>Desfés</button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/** Persones que no s'han pogut contactar (o que no tenen WhatsApp), amb les seves activitats, per trucar-les. */
function LlistatTrucades({ d, files }: { d: DadesComunicacions; files: Fila[] }) {
  const persones = useMemo(() => {
    const perPersona = new Map<string, { nom: string; cognoms: string; telefon: string | null; activitats: string[]; motius: Set<string>; notes: string[] }>();
    for (const f of files) {
      const e = estatComunicacio(f);
      if (e.tipus !== "trucar") continue;
      const p = perPersona.get(f.participant_id) ?? { nom: f.nom, cognoms: f.cognoms, telefon: f.telefon, activitats: [], motius: new Set<string>(), notes: [] };
      p.activitats.push(`${f.grup.activitat}: ${situacioText(f)}`);
      p.motius.add(ETIQUETES_MOTIU_NO_CONTACTE[e.motiu]);
      if (f.comunicacio?.nota) p.notes.push(f.comunicacio.nota);
      perPersona.set(f.participant_id, p);
    }
    const compara = new Intl.Collator("ca", { sensitivity: "base" }).compare;
    return [...perPersona.values()].sort((a, b) => compara(a.cognoms, b.cognoms) || compara(a.nom, b.nom));
  }, [files]);

  const imprimeix = () => {
    document.body.classList.add("pagina-impressio", "imprimint-trucades");
    const treu = () => { document.body.classList.remove("pagina-impressio", "imprimint-trucades"); window.removeEventListener("afterprint", treu); };
    window.addEventListener("afterprint", treu);
    window.print();
  };
  const excel = async () => {
    const taula = {
      titol: `Persones per trucar · ${d.cicle.nom}`,
      fitxer: `persones-per-trucar-${d.cicle.nom.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 50)}.xlsx`,
      columnes: ["Nom", "Cognoms", "Telèfon", "Activitats", "Motiu", "Notes"],
      files: persones.map((p) => [p.nom, p.cognoms, p.telefon, p.activitats.join("; "), [...p.motius].join("; "), p.notes.join("; ")]),
    };
    descarrega(await generaXlsx(taula), taula.fitxer);
  };

  return (
    <section className="llistat-trucades seccio" aria-labelledby="titol-trucades">
      <div className="seccio__cos">
        <h2 id="titol-trucades">Persones per trucar ({persones.length})</h2>
        <p className="text-secundari no-imprimir">
          Persones amb telèfon fix, sense telèfon o amb un número no vàlid, i les que heu marcat com a no contactades.
          Una fila per persona, amb totes les seves activitats.
        </p>
        <p className="nomes-imprimir">{d.casal} · {d.cicle.nom}</p>
        {persones.length === 0 ? <p>Ningú per trucar.</p> : (
          <>
            <div className="botonera no-imprimir">
              <button type="button" className="boto boto--secundari" onClick={imprimeix}>Imprimeix el llistat</button>
              <button type="button" className="boto boto--secundari" onClick={() => void excel()}>Descarrega-ho en Excel</button>
            </div>
            <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Persones per trucar">
              <table className="taula taula--densa">
                <thead><tr><th scope="col">Nom</th><th scope="col">Cognoms</th><th scope="col">Telèfon</th><th scope="col">Activitats</th><th scope="col">Motiu</th></tr></thead>
                <tbody>
                  {persones.map((p, i) => (
                    <tr key={i}>
                      <td>{p.nom}</td><td>{p.cognoms}</td><td className="nowrap">{p.telefon ?? "—"}</td>
                      <td><ul className="llista-neta">{p.activitats.map((a) => <li key={a}>{a}</li>)}</ul></td>
                      <td>{[...p.motius].join("; ")}{p.notes.length ? <div className="text-secundari">{p.notes.join("; ")}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
