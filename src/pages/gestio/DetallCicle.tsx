import { useState } from "react";
import { Link, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE, type EstatCicle, type TipusTransicio } from "../../../shared/domain/cicles";
import { CAMPS_PERSONALS, CAMPS_SEMPRE_OBLIGATORIS, ETIQUETES_CAMPS, type ConfiguracioFormulari } from "../../../shared/domain/formulari";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, Cicle, EstatActivitat } from "../../types/gestio";
import { formataData, formataDataHora, formataHorari } from "../../utils/format";
import { usePermisos } from "./context";
import { FormActivitat } from "./FormActivitat";
import { FormCicle } from "./FormCicle";
import { Historial } from "./Historial";

const ETIQUETES_ESTAT_ACTIVITAT: Record<EstatActivitat, string> = { esborrany: "Esborrany", activa: "Activa", inactiva: "Inactiva", arxivada: "Arxivada" };
const ACCIONS_ACTIVITAT: Record<EstatActivitat, { estat: EstatActivitat; text: string }[]> = {
  esborrany: [{ estat: "activa", text: "Activa" }, { estat: "arxivada", text: "Arxiva" }],
  activa: [{ estat: "inactiva", text: "Desactiva" }, { estat: "arxivada", text: "Arxiva" }],
  inactiva: [{ estat: "activa", text: "Activa" }, { estat: "arxivada", text: "Arxiva" }],
  arxivada: [{ estat: "inactiva", text: "Recupera" }],
};

type Pendent =
  | { tipus: "cicle"; estat: EstatCicle; transicio: TipusTransicio }
  | { tipus: "activitat"; activitat: Activitat; estat: EstatActivitat }
  | null;

export function DetallCicle() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const recarrega = () => setVersio((v) => v + 1);
  const detall = useConsulta((s) => serveiGestio.cicle(casalId, cicleId, s), [casalId, cicleId, versio]);
  const activitats = useConsulta((s) => serveiGestio.activitats(casalId, cicleId, s), [casalId, cicleId, versio]);
  const [editantCicle, setEditantCicle] = useState(false);
  const [editantActivitat, setEditantActivitat] = useState<string | null>(null);
  const [exit, setExit] = useState("");
  const [errorAccio, setErrorAccio] = useState<ErrorClientApi | null>(null);
  const [pendent, setPendent] = useState<Pendent>(null);
  const [enCurs, setEnCurs] = useState(false);

  if (detall.tipus === "carregant") return <Carregant text="Carregant el cicle…" />;
  if (detall.tipus === "error") return <MissatgeError error={detall.error} onReintentar={detall.reintentar} />;
  const { cicle, transicions, formulari, accepta_sollicituds } = detall.dades;

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setErrorAccio(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      recarrega();
    } catch (e) {
      if (e instanceof ErrorClientApi) setErrorAccio(e);
      else throw e;
    } finally {
      setEnCurs(false);
      setPendent(null);
    }
  }

  const confirmaPendent = (motiu: string) => {
    if (!pendent) return;
    if (pendent.tipus === "cicle") {
      void accio(() => serveiGestio.canviarEstatCicle(casalId, cicleId, {
        estat: pendent.estat, versio: cicle.versio, ...(pendent.transicio === "requereix_confirmacio" ? { confirmacio: true, motiu } : motiu ? { motiu } : {}),
      }), `El cicle ara és «${ETIQUETES_ESTAT_CICLE[pendent.estat]}».`);
    } else {
      void accio(() => serveiGestio.canviarEstatActivitat(casalId, pendent.activitat.id, {
        estat: pendent.estat, versio: pendent.activitat.versio, ...(motiu ? { motiu } : {}),
      }), `L'activitat «${pendent.activitat.nom}» ara és «${ETIQUETES_ESTAT_ACTIVITAT[pendent.estat]}».`);
    }
  };

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar als cicles</Link></p>
      <h1>{cicle.nom}</h1>
      <p>
        <span className="etiqueta">{ETIQUETES_ESTAT_CICLE[cicle.estat]}</span>{" "}
        {accepta_sollicituds && <span className="etiqueta etiqueta--obert">Acceptant sol·licituds ara</span>}
      </p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {errorAccio && <MissatgeError error={errorAccio} />}
      </div>

      <Seccio titol="Dades del cicle" accions={pot("cicles.gestionar") && !editantCicle && cicle.estat !== "arxivat" ? (
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditantCicle(true)}>Edita les dades</button>
      ) : undefined}>
        {editantCicle ? (
          <FormCicle cicle={cicle} textBoto="Desa els canvis" onCancelar={() => setEditantCicle(false)} onDesar={async (dades) => {
            await serveiGestio.actualitzarCicle(casalId, cicleId, { ...dades, versio: cicle.versio });
            setEditantCicle(false);
            setExit("S'han desat les dades del cicle.");
            recarrega();
          }} />
        ) : <DadesCicle cicle={cicle} />}
      </Seccio>

      {pot("cicles.gestionar") && (
        <Seccio titol="Estat del cicle">
          {transicions.length === 0 ? <p>Aquest cicle no admet més canvis d'estat.</p> : (
            <div className="botonera">
              {transicions.map((t) => (
                <button key={t.estat} type="button" className={`boto ${t.tipus === "requereix_confirmacio" ? "boto--perill" : "boto--secundari"}`}
                  onClick={() => setPendent({ tipus: "cicle", estat: t.estat, transicio: t.tipus })}>
                  Passa a «{ETIQUETES_ESTAT_CICLE[t.estat]}»
                </button>
              ))}
            </div>
          )}
        </Seccio>
      )}

      <Seccio titol="Camps del formulari d'inscripció" obertaInicial={false}>
        <CampsFormulari formulari={formulari} cicle={cicle} editable={pot("cicles.gestionar") && ["esborrany", "preparacio"].includes(cicle.estat)}
          onDesar={(conf) => accio(() => serveiGestio.actualitzarCicle(casalId, cicleId, { versio: cicle.versio, configuracio_formulari: conf }),
            "S'han desat els camps del formulari.")} />
      </Seccio>

      <Seccio titol="Activitats">
        {activitats.tipus === "carregant" && <Carregant />}
        {activitats.tipus === "error" && <MissatgeError error={activitats.error} onReintentar={activitats.reintentar} />}
        {activitats.tipus === "dades" && (activitats.dades.activitats.length === 0 ? <p>Aquest cicle encara no té activitats.</p> : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Activitats del cicle">
            <table className="taula">
              <thead><tr><th scope="col">Activitat</th><th scope="col">Horari</th><th scope="col">Places</th><th scope="col">Estat</th>
                {pot("activitats.gestionar") && <th scope="col">Accions</th>}</tr></thead>
              <tbody>
                {activitats.dades.activitats.map((a) => editantActivitat === a.id ? (
                  <tr key={a.id}><td colSpan={5}>
                    <FormActivitat activitat={a} textBoto="Desa l'activitat" onCancelar={() => setEditantActivitat(null)} onDesar={async (dades) => {
                      await serveiGestio.actualitzarActivitat(casalId, a.id, { ...dades, versio: a.versio });
                      setEditantActivitat(null);
                      setExit(`S'ha desat l'activitat «${String(dades.nom)}».`);
                      recarrega();
                    }} />
                  </td></tr>
                ) : (
                  <tr key={a.id}>
                    <td><strong>{a.nom}</strong>{a.categoria && <div className="text-secundari">{a.categoria}</div>}</td>
                    <td>{formataHorari(a)}</td>
                    <td>{a.capacitat}</td>
                    <td><span className="etiqueta">{ETIQUETES_ESTAT_ACTIVITAT[a.estat]}</span></td>
                    {pot("activitats.gestionar") && (
                      <td><div className="accions-fila">
                        {a.estat !== "arxivada" && <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditantActivitat(a.id)}>Edita</button>}
                        <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs}
                          onClick={() => accio(() => serveiGestio.duplicarActivitat(casalId, a.id), `S'ha creat una còpia de «${a.nom}» en esborrany.`)}>Duplica</button>
                        {ACCIONS_ACTIVITAT[a.estat].map((x) => (
                          <button key={x.estat} type="button" className="boto boto--secundari boto--petit" disabled={enCurs}
                            onClick={() => setPendent({ tipus: "activitat", activitat: a, estat: x.estat })}>{x.text}</button>
                        ))}
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Seccio>

      {pot("activitats.gestionar") && !["finalitzat", "arxivat"].includes(cicle.estat) && (
        <Seccio titol="Nova activitat" obertaInicial={false}>
          <FormActivitat textBoto="Crea l'activitat" onDesar={async (dades) => {
            const { activitat } = await serveiGestio.crearActivitat(casalId, cicleId, dades);
            setExit(`S'ha creat l'activitat «${activitat.nom}» en esborrany. Activeu-la perquè aparegui a la pàgina pública.`);
            recarrega();
          }} />
        </Seccio>
      )}

      <Seccio titol="Historial de canvis del cicle" obertaInicial={false}>
        <Historial casalId={casalId} entitat="cicle" id={cicleId} versio={versio} />
      </Seccio>

      <DialegConfirmacio
        obert={pendent !== null}
        enCurs={enCurs}
        titol={pendent?.tipus === "cicle" ? "Confirmeu el canvi d'estat del cicle" : "Confirmeu el canvi d'estat de l'activitat"}
        textConfirmar="Confirma el canvi"
        demanaMotiu={pendent?.tipus === "cicle" && pendent.transicio === "requereix_confirmacio"}
        onCancelar={() => setPendent(null)}
        onConfirmar={confirmaPendent}
      >
        {pendent?.tipus === "cicle" && (
          <>
            <p>El cicle passarà de «{ETIQUETES_ESTAT_CICLE[cicle.estat]}» a «{ETIQUETES_ESTAT_CICLE[pendent.estat]}».</p>
            {pendent.transicio === "requereix_confirmacio" && (
              <p className="avis avis--alerta">Aquest canvi pot afectar sol·licituds o adjudicacions ja existents. Cal indicar-ne el motiu, que quedarà registrat.</p>
            )}
          </>
        )}
        {pendent?.tipus === "activitat" && (
          <p>L'activitat «{pendent.activitat.nom}» passarà de «{ETIQUETES_ESTAT_ACTIVITAT[pendent.activitat.estat]}» a «{ETIQUETES_ESTAT_ACTIVITAT[pendent.estat]}».</p>
        )}
      </DialegConfirmacio>
    </div>
  );
}

function DadesCicle({ cicle }: { cicle: Cicle }) {
  return (
    <dl className="dades">
      <div><dt>Any</dt><dd>{cicle.any}</dd></div>
      <div><dt>Dates del cicle</dt><dd>{formataData(cicle.data_inici)} – {formataData(cicle.data_fi)}</dd></div>
      <div><dt>Obertura de les inscripcions</dt><dd>{formataDataHora(cicle.obertura_inscripcions)}</dd></div>
      <div><dt>Tancament de les inscripcions</dt><dd>{formataDataHora(cicle.tancament_inscripcions)}</dd></div>
      <div><dt>Data prevista de la resolució</dt><dd>{formataData(cicle.data_resolucio_prevista)}</dd></div>
    </dl>
  );
}

function CampsFormulari({ formulari, editable, onDesar }: {
  formulari: ConfiguracioFormulari; cicle: Cicle; editable: boolean; onDesar: (c: ConfiguracioFormulari) => void;
}) {
  const [camps, setCamps] = useState(formulari.camps);
  const canvia = (camp: keyof typeof camps, clau: "actiu" | "obligatori", valor: boolean) =>
    setCamps((c) => ({ ...c, [camp]: { ...c[camp], [clau]: valor, ...(clau === "actiu" && !valor ? { obligatori: false } : {}) } }));
  return (
    <div>
      <p>Recolliu només les dades estrictament necessàries. Activar camps com el DNI/NIE o la data de naixement requereix una justificació validada pel responsable del tractament.</p>
      {!editable && <p className="text-secundari">Els camps només es poden modificar mentre el cicle és en esborrany o preparació.</p>}
      <div className="taula-contenidor">
        <table className="taula">
          <thead><tr><th scope="col">Camp</th><th scope="col">Es demana</th><th scope="col">Obligatori</th></tr></thead>
          <tbody>
            {CAMPS_PERSONALS.map((camp) => {
              const fix = CAMPS_SEMPRE_OBLIGATORIS.includes(camp);
              return (
                <tr key={camp}>
                  <th scope="row">{ETIQUETES_CAMPS[camp]}</th>
                  <td><input type="checkbox" aria-label={`Demanar ${ETIQUETES_CAMPS[camp]}`} checked={camps[camp].actiu} disabled={!editable || fix}
                    onChange={(e) => canvia(camp, "actiu", e.target.checked)} /></td>
                  <td><input type="checkbox" aria-label={`${ETIQUETES_CAMPS[camp]} obligatori`} checked={camps[camp].obligatori}
                    disabled={!editable || fix || !camps[camp].actiu} onChange={(e) => canvia(camp, "obligatori", e.target.checked)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && <button type="button" className="boto" onClick={() => onDesar({ camps })}>Desa els camps del formulari</button>}
    </div>
  );
}
