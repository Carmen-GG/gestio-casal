import { useState } from "react";
import { Link } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../../shared/domain/cicles";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, Cicle } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

interface Punt { fet: boolean; text: string }

/**
 * Què falta perquè el formulari d'inscripció surti a la pàgina pública. Són les mateixes
 * condicions que comprova el servidor: cicle a «Inscripcions obertes», dins del termini,
 * alguna activitat activa i el text de protecció de dades.
 */
export function EstatFormulariPublic({ casalId, codiCasal, cicle, acceptaSollicituds, teTextPrivacitat, activitats, potGestionar, onCanvi }: {
  casalId: string; codiCasal: string | undefined; cicle: Cicle; acceptaSollicituds: boolean; teTextPrivacitat: boolean;
  activitats: Activitat[]; potGestionar: boolean; onCanvi: (missatge: string) => void;
}) {
  const [activant, setActivant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const actives = activitats.filter((a) => a.estat === "activa");
  const esborranys = activitats.filter((a) => a.estat === "esborrany");
  const senseHorari = actives.filter((a) => !a.horari_text && (a.dies_setmana.length === 0 || !a.hora_inici));
  const obert = cicle.estat === "inscripcions_obertes";

  const punts: Punt[] = [
    { fet: obert, text: obert ? "El cicle és a «Inscripcions obertes»." : `El cicle és a «${ETIQUETES_ESTAT_CICLE[cicle.estat]}»: passeu-lo a «Inscripcions obertes» a la secció «Estat del cicle»${cicle.estat === "esborrany" ? " (primer a «Preparació»)" : ""}.` },
    { fet: !obert || acceptaSollicituds, text: `Termini d'inscripció: del ${formataDataHora(cicle.obertura_inscripcions)} al ${formataDataHora(cicle.tancament_inscripcions)}.` },
    { fet: actives.length > 0, text: actives.length > 0 ? (actives.length === 1 ? "1 activitat activa." : `${actives.length} activitats actives.`) : "Cap activitat activa: les activitats importades o noves queden en esborrany fins que s'activen." },
    { fet: teTextPrivacitat, text: teTextPrivacitat ? "Té el text de protecció de dades." : "Falta el text de protecció de dades (secció «Formulari d'inscripció»)." },
  ];
  const visible = acceptaSollicituds && actives.length > 0 && teTextPrivacitat;

  async function activaTotes() {
    setActivant(true);
    setError(null);
    let fetes = 0;
    try {
      for (const a of esborranys) {
        await serveiGestio.canviarEstatActivitat(casalId, a.id, { estat: "activa", versio: a.versio });
        fetes++;
      }
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
    } finally {
      setActivant(false);
      if (fetes) onCanvi(fetes === 1 ? "S'ha activat 1 activitat." : `S'han activat ${fetes} activitats.`);
    }
  }

  return (
    <div className="estat-formulari">
      <p className={visible ? "avis avis--exit" : "avis avis--alerta"} role="status">
        {visible ? "El formulari d'inscripció ja surt a la pàgina pública." : "El formulari d'inscripció encara no surt a la pàgina pública."}
        {codiCasal && <> <Link to={`/inscripcio/${encodeURIComponent(codiCasal)}/${cicle.id}`}>Veure la pàgina pública</Link></>}
      </p>
      <ul className="llista-comprovacions">
        {punts.map((p) => (
          <li key={p.text} className={p.fet ? "comprovacio comprovacio--feta" : "comprovacio"}>
            <span aria-hidden="true">{p.fet ? "✓" : "✗"}</span> <span className="visualment-amagat">{p.fet ? "Fet: " : "Falta: "}</span>{p.text}
          </li>
        ))}
      </ul>
      {error && <MissatgeError error={error} />}
      {potGestionar && esborranys.length > 0 && cicle.estat !== "finalitzat" && (
        <p>
          <button type="button" className="boto" disabled={activant} onClick={() => void activaTotes()}>
            {activant ? "Activant…" : esborranys.length === 1 ? "Activa l'activitat en esborrany" : `Activa les ${esborranys.length} activitats en esborrany`}
          </button>
        </p>
      )}
      {senseHorari.length > 0 && (
        <p className="text-secundari">
          {senseHorari.length === 1 ? "1 activitat activa no té" : `${senseHorari.length} activitats actives no tenen`} dies ni hora: al formulari sortiran com a «Horari pendent de publicar».
          Les podeu completar amb «Edita» a la secció «Activitats».
        </p>
      )}
    </div>
  );
}
