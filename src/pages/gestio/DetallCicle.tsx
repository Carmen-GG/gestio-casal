import { useState } from "react";
import { Link, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE, type EstatCicle, type TipusTransicio } from "../../../shared/domain/cicles";
import { CAMPS_PERSONALS, CAMPS_SEMPRE_OBLIGATORIS, ETIQUETES_CAMPS, MIDA_MAXIMA_PRIVACITAT, type ConfiguracioFormulari } from "../../../shared/domain/formulari";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampAreaText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, Cicle, EstatActivitat } from "../../types/gestio";
import { formataData, formataDataHora } from "../../utils/format";
import { useGestio, usePermisos } from "./context";
import { EstatFormulariPublic } from "./EstatFormulariPublic";
import { FormCicle } from "./FormCicle";
import { Historial } from "./Historial";
import { Duplicats } from "./Duplicats";
import { Exportacio, ImportacioSollicituds } from "./ImportacioExportacio";
import { GestioActivitats } from "./GestioActivitats";
import { LlistatSollicituds } from "./Sollicituds";
import { Adjudicacio } from "./Adjudicacio";
import { Places } from "./Places";
import { Assistencia } from "./Assistencia";
import { Sorteig } from "./Sorteig";
import { Indicadors } from "./Indicadors";

/** Estats del cicle en què pot existir una adjudicació confirmada. */
const ESTATS_AMB_PLACES: EstatCicle[] = ["adjudicacio_en_proces", "adjudicat", "arxivat"];

const ETIQUETES_ESTAT_ACTIVITAT: Record<EstatActivitat, string> = { esborrany: "Esborrany", activa: "Activa", inactiva: "Inactiva", arxivada: "Arxivada" };

type Pendent =
  | { tipus: "cicle"; estat: EstatCicle; transicio: TipusTransicio }
  | { tipus: "activitat"; activitat: Activitat; estat: EstatActivitat }
  | null;

export function DetallCicle() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const { jo } = useGestio();
  const [versio, setVersio] = useState(0);
  const recarrega = () => setVersio((v) => v + 1);
  const detall = useConsulta((s) => serveiGestio.cicle(casalId, cicleId, s), [casalId, cicleId, versio], `${casalId}/${cicleId}`);
  const activitats = useConsulta((s) => serveiGestio.activitats(casalId, cicleId, s), [casalId, cicleId, versio], `${casalId}/${cicleId}`);
  const [editantCicle, setEditantCicle] = useState(false);
  const [exit, setExit] = useState("");
  const [errorAccio, setErrorAccio] = useState<ErrorClientApi | null>(null);
  const [pendent, setPendent] = useState<Pendent>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [versioPlaces, setVersioPlaces] = useState(0);

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

      {pot("sollicituds.consultar") && (
        <Seccio titol="Resum i indicadors">
          <Indicadors casalId={casalId} cicleId={cicleId} versio={versio + versioPlaces} />
        </Seccio>
      )}

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

      {cicle.estat !== "arxivat" && activitats.tipus === "dades" && (
        <Seccio titol="Formulari a la pàgina pública">
          <EstatFormulariPublic casalId={casalId} codiCasal={jo.casals.find((c) => c.id === casalId)?.codi} cicle={cicle}
            acceptaSollicituds={accepta_sollicituds} privacitatDeProva={!formulari.informacio_privacitat}
            activitats={activitats.dades.activitats} potGestionar={pot("activitats.gestionar")}
            onCanvi={(m) => { setExit(m); recarrega(); }} />
        </Seccio>
      )}

      <Seccio titol="Formulari d'inscripció" obertaInicial={!formulari.informacio_privacitat && cicle.estat === "preparacio"}>
        <CampsFormulari formulari={formulari} cicle={cicle} editable={pot("cicles.gestionar") && cicle.estat === "preparacio"}
          onDesar={(conf) => accio(() => serveiGestio.actualitzarCicle(casalId, cicleId, { versio: cicle.versio, configuracio_formulari: conf }),
            "S'ha desat la configuració del formulari.")} />
      </Seccio>

      <Seccio titol="Activitats">
        {activitats.tipus === "carregant" && <Carregant />}
        {activitats.tipus === "error" && <MissatgeError error={activitats.error} onReintentar={activitats.reintentar} />}
        {activitats.tipus === "dades" && (
          <GestioActivitats casalId={casalId} cicle={cicle} activitats={activitats.dades.activitats}
            potGestionar={pot("activitats.gestionar")} potCartells={pot("cartells.generar")} potCicle={pot("cicles.gestionar")}
            editable={cicle.estat !== "arxivat"} onCanvi={recarrega} />
        )}
      </Seccio>

      {pot("sollicituds.consultar") && (
        <Seccio titol="Sol·licituds rebudes">
          <LlistatSollicituds casalId={casalId} cicleId={cicleId} activitats={activitats.tipus === "dades" ? activitats.dades.activitats : []}
            versio={versioPlaces + versio} />
          {pot("dades.importar") && ["preparacio", "inscripcions_obertes", "adjudicacio_en_proces"].includes(cicle.estat) && (
            <ImportacioSollicituds casalId={casalId} cicleId={cicleId} onImportat={recarrega} />
          )}
        </Seccio>
      )}

      {pot("sollicituds.consultar") && (
        <Seccio titol="Possibles duplicats" obertaInicial={false}>
          <Duplicats casalId={casalId} cicleId={cicleId} potGestionar={pot("sollicituds.gestionar")} />
        </Seccio>
      )}

      {pot("dades.exportar") && (
        <Seccio titol="Exportació" obertaInicial={false}>
          <Exportacio casalId={casalId} cicleId={cicleId} activitats={activitats.tipus === "dades" ? activitats.dades.activitats : []} />
        </Seccio>
      )}

      {pot("sollicituds.consultar") && ["adjudicacio_en_proces", "adjudicat"].includes(cicle.estat) && (
        <Seccio titol="Sorteig per activitat" obertaInicial={cicle.estat === "adjudicacio_en_proces"}>
          <Sorteig casalId={casalId} cicleId={cicleId} pot={pot} versioCicle={cicle.versio} />
        </Seccio>
      )}

      {pot("sollicituds.consultar") && cicle.estat !== "arxivat" && (
        <Seccio titol="Adjudicació" obertaInicial={cicle.estat === "adjudicacio_en_proces"}>
          <Adjudicacio casalId={casalId} cicleId={cicleId} pot={pot} versioCicle={cicle.versio} />
        </Seccio>
      )}

      {pot("sollicituds.consultar") && ESTATS_AMB_PLACES.includes(cicle.estat) && (
        <Seccio titol="Places i llistes d'espera" obertaInicial={cicle.estat === "adjudicat"}>
          <Places casalId={casalId} cicleId={cicleId} pot={pot} versioCicle={cicle.versio} onCanvi={() => setVersioPlaces((v) => v + 1)} />
        </Seccio>
      )}

      {(pot("sollicituds.consultar") || pot("assistencia.registrar")) && ["adjudicat", "arxivat"].includes(cicle.estat) && (
        <Seccio titol="Assistència" obertaInicial={cicle.estat === "adjudicat"}>
          <Assistencia casalId={casalId} cicle={cicle} pot={pot} onCanviCicle={recarrega} />
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
  const [privacitat, setPrivacitat] = useState(formulari.informacio_privacitat);
  const canvia = (camp: keyof typeof camps, clau: "actiu" | "obligatori", valor: boolean) =>
    setCamps((c) => ({ ...c, [camp]: { ...c[camp], [clau]: valor, ...(clau === "actiu" && !valor ? { obligatori: false } : {}) } }));
  return (
    <div>
      <p>Trieu quins camps surten al formulari i quins són obligatoris. Recolliu només les dades necessàries. La data de naixement sempre es demana: si la persona és menor d'edat, el formulari demana les dades, el DNI i la signatura del pare, mare o tutor.</p>
      {!editable && <p className="text-secundari">Els camps només es poden modificar mentre el cicle és en preparació.</p>}
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
      <h3 className="subseccio">Informació sobre protecció de dades</h3>
      <p className="text-secundari">
        Es mostra al formulari públic i la persona l'ha d'acceptar abans d'enviar. L'ha de redactar o validar el responsable
        del tractament (vegeu docs/validacio-institucional.md). Mentre estigui buida, el formulari públic mostra un text de prova.
      </p>
      {!formulari.informacio_privacitat && <p className="avis avis--alerta">Aquest cicle encara no té la informació de protecció de dades: el formulari mostra el text de prova.</p>}
      <CampAreaText etiqueta="Text informatiu" value={privacitat} rows={8} maxLength={MIDA_MAXIMA_PRIVACITAT}
        disabled={!editable} onChange={(e) => setPrivacitat(e.target.value)} />
      {editable && <button type="button" className="boto" onClick={() => onDesar({ camps, informacio_privacitat: privacitat })}>Desa la configuració del formulari</button>}
    </div>
  );
}
