import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiCartells } from "../../services/cartells";
import type { FotoCartells } from "../../types/gestio";
import { useGestio, usePermisos } from "../gestio/context";
import { GaleriaFotos } from "./GaleriaFotos";

/** Fotos que es preparen i pugen alhora: prou per anar de pressa sense saturar el navegador. */
const EN_PARALLEL = 3;

interface Progres { total: number; fetes: number; noves: number; repetides: number; errors: { nom: string; motiu: string }[] }

/**
 * Fototeca de PG-Cartells (petició de 2026-10-16): es poden pujar carpetes senceres, amb les
 * subcarpetes, i després triar-ne una foto a «Nou material». Les fotos es redueixen al navegador.
 */
export function Fototeca() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const casal = jo.casals.find((c) => c.id === casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiCartells.fotos(casalId, s), [casalId, versio]);
  const [progres, setProgres] = useState<Progres | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [retirant, setRetirant] = useState<FotoCartells | null>(null);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const carpetaRef = useRef<HTMLInputElement>(null);
  const fitxersRef = useRef<HTMLInputElement>(null);

  if (!casal || !pot("cartells.consultar")) return <p role="alert" className="avis avis--error">No teniu accés a PG-Cartells en aquest casal.</p>;
  const potPujar = pot("cartells.fotografies");

  async function puja(llista: FileList | null) {
    if (!llista || llista.length === 0) return;
    const { esFoto, carpetaDe, preparaFoto } = await import("../../cartells/fototeca");
    const fitxers = [...llista].filter(esFoto);
    const omesos = llista.length - fitxers.length;
    const p: Progres = { total: fitxers.length, fetes: 0, noves: 0, repetides: 0, errors: [] };
    setProgres({ ...p });
    setEnCurs(true);
    setExit(""); setError(null);
    let seguent = 0;
    const treballa = async () => {
      while (seguent < fitxers.length) {
        const f = fitxers[seguent++]!;
        try {
          const preparada = await preparaFoto(f);
          const nom = f.name.replace(/\.[^.]+$/, "") || f.name;
          const [foto, miniatura] = await Promise.all([
            serveiCartells.pujarImatge(casalId, "fotografia", preparada.foto, `${nom}.jpg`),
            serveiCartells.pujarImatge(casalId, "previsualitzacio", preparada.miniatura, `${nom}-miniatura.jpg`),
          ]);
          const r = await serveiCartells.afegirFoto(casalId, {
            fitxer_id: foto.fitxer.id, miniatura_id: miniatura.fitxer.id, carpeta: carpetaDe(f), nom,
            amplada: preparada.amplada, alcada: preparada.alcada,
          });
          if (r.existent) p.repetides++; else p.noves++;
        } catch (e) {
          p.errors.push({ nom: f.name, motiu: e instanceof Error ? e.message : "Error desconegut" });
        }
        p.fetes++;
        setProgres({ ...p, errors: [...p.errors] });
      }
    };
    await Promise.all(Array.from({ length: Math.min(EN_PARALLEL, fitxers.length) }, treballa));
    setEnCurs(false);
    setExit(`S'han afegit ${p.noves} ${p.noves === 1 ? "foto" : "fotos"}${p.repetides ? ` (${p.repetides} ja hi eren)` : ""}${omesos ? `. S'han omès ${omesos} ${omesos === 1 ? "fitxer que no és una foto" : "fitxers que no són fotos"}` : ""}.`);
    setVersio((v) => v + 1);
    if (carpetaRef.current) carpetaRef.current.value = "";
    if (fitxersRef.current) fitxersRef.current.value = "";
  }

  async function retira(f: FotoCartells) {
    setError(null);
    try {
      await serveiCartells.retirarFoto(casalId, f.id);
      setExit(`S'ha retirat «${f.nom}» de la fototeca.`);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally {
      setRetirant(null);
    }
  }

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cartells`}>PG-Cartells</Link></p>
      <h1>Fototeca</h1>
      <p className="text-secundari">
        Les fotos que pugeu aquí es poden triar a «Nou material». Feu servir només fotos amb l'autorització de les persones que hi surten.
      </p>
      <div aria-live="polite">
        {error && <MissatgeError error={error} />}
        {exit && <AvisExit>{exit}</AvisExit>}
      </div>

      {potPujar && (
        <Seccio titol="Puja fotos">
          <p>Podeu pujar una carpeta sencera, amb les subcarpetes: cada subcarpeta queda com una carpeta de la fototeca. Les fotos es redueixen abans de pujar-les.</p>
          <div className="botonera">
            <label className="boto">
              Tria una carpeta
              <input ref={carpetaRef} type="file" className="visualment-amagat" multiple disabled={enCurs}
                {...{ webkitdirectory: "", directory: "" }} onChange={(e) => void puja(e.target.files)} />
            </label>
            <label className="boto boto--secundari">
              Tria fotos soltes
              <input ref={fitxersRef} type="file" className="visualment-amagat" multiple accept="image/*" disabled={enCurs}
                onChange={(e) => void puja(e.target.files)} />
            </label>
          </div>
          {progres && (
            <div role="status">
              <progress max={progres.total || 1} value={progres.fetes} aria-label="Fotos pujades" />
              <p>{enCurs ? `Pujant ${progres.fetes} de ${progres.total}…` : `Fet: ${progres.fetes} de ${progres.total}.`}</p>
              {progres.errors.length > 0 && (
                <details>
                  <summary>{progres.errors.length} fotos no s'han pogut pujar</summary>
                  <ul>{progres.errors.map((e) => <li key={e.nom}>{e.nom}: {e.motiu}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </Seccio>
      )}

      <Seccio titol={consulta.tipus === "dades" ? `Fotos (${consulta.dades.fotos.length})` : "Fotos"}>
        {consulta.tipus === "carregant" && <Carregant text="Carregant la fototeca…" />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (
          <GaleriaFotos casalId={casalId} fotos={consulta.dades.fotos} ocupat={enCurs}
            onRetira={potPujar ? setRetirant : undefined} />
        )}
      </Seccio>

      <DialegConfirmacio obert={!!retirant} titol="Retirar la foto" textConfirmar="Retira-la"
        onConfirmar={() => retirant && void retira(retirant)} onCancelar={() => setRetirant(null)}>
        <p>«{retirant?.nom}» deixarà de sortir a la fototeca. Els materials que ja s'han fet amb aquesta foto no canvien.</p>
      </DialegConfirmacio>
    </div>
  );
}
