import { useState, type FormEvent } from "react";
import { cicleCrear } from "../../../shared/schemas/gestio";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { CampText } from "../../components/Formulari";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import { inputLocalAIso, isoAInputLocal } from "../../utils/format";
import type { Cicle } from "../../types/gestio";

type Valors = Record<"nom" | "any" | "data_inici" | "data_fi" | "obertura_inscripcions" | "tancament_inscripcions" | "data_resolucio_prevista", string>;

const buit: Valors = { nom: "", any: String(new Date().getFullYear()), data_inici: "", data_fi: "", obertura_inscripcions: "", tancament_inscripcions: "", data_resolucio_prevista: "" };

const desDeCicle = (c: Cicle): Valors => ({
  nom: c.nom, any: String(c.any), data_inici: c.data_inici, data_fi: c.data_fi,
  obertura_inscripcions: isoAInputLocal(c.obertura_inscripcions), tancament_inscripcions: isoAInputLocal(c.tancament_inscripcions),
  data_resolucio_prevista: c.data_resolucio_prevista,
});

/**
 * Formulari de creació i edició de cicles. Valida al navegador amb el mateix
 * esquema que el servidor, però el resultat definitiu el decideix el servidor.
 */
export function FormCicle({ cicle, onDesar, onCancelar, textBoto }: {
  cicle?: Cicle; textBoto: string; onCancelar?: () => void;
  onDesar: (dades: Record<string, unknown>) => Promise<void>;
}) {
  const [v, setV] = useState<Valors>(cicle ? desDeCicle(cicle) : buit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [desant, setDesant] = useState(false);
  const canvia = (k: keyof Valors) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function envia(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    const dades = {
      nom: v.nom, any: Number(v.any), data_inici: v.data_inici, data_fi: v.data_fi,
      obertura_inscripcions: v.obertura_inscripcions ? inputLocalAIso(v.obertura_inscripcions) : "",
      tancament_inscripcions: v.tancament_inscripcions ? inputLocalAIso(v.tancament_inscripcions) : "",
      data_resolucio_prevista: v.data_resolucio_prevista,
    };
    const r = cicleCrear.safeParse(dades);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    setDesant(true);
    try {
      await onDesar(dades);
      if (!cicle) setV(buit);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setErrorServidor(err); setErrors(err.errorsCamps); }
      else throw err;
    } finally {
      setDesant(false);
    }
  }

  return (
    <form onSubmit={envia} noValidate className="formulari">
      {errorServidor && <MissatgeError error={errorServidor} />}
      <div className="graella-camps">
        <CampText etiqueta="Nom del cicle" obligatori value={v.nom} onChange={canvia("nom")} error={errors.nom} maxLength={150} />
        <CampText etiqueta="Any" obligatori type="number" min={2000} max={2100} value={v.any} onChange={canvia("any")} error={errors.any} />
        <CampText etiqueta="Data d'inici" obligatori type="date" value={v.data_inici} onChange={canvia("data_inici")} error={errors.data_inici} />
        <CampText etiqueta="Data de finalització" obligatori type="date" value={v.data_fi} onChange={canvia("data_fi")} error={errors.data_fi} />
        <CampText etiqueta="Obertura de les inscripcions" obligatori type="datetime-local" value={v.obertura_inscripcions}
          onChange={canvia("obertura_inscripcions")} error={errors.obertura_inscripcions} ajuda="Hora del casal (Europa/Madrid)." />
        <CampText etiqueta="Tancament de les inscripcions" obligatori type="datetime-local" value={v.tancament_inscripcions}
          onChange={canvia("tancament_inscripcions")} error={errors.tancament_inscripcions} />
        <CampText etiqueta="Data prevista de la resolució" obligatori type="date" value={v.data_resolucio_prevista}
          onChange={canvia("data_resolucio_prevista")} error={errors.data_resolucio_prevista}
          ajuda="Es mostra a la confirmació que rep la persona sol·licitant." />
      </div>
      <div className="botonera">
        <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : textBoto}</button>
        {onCancelar && <button type="button" className="boto boto--secundari" onClick={onCancelar} disabled={desant}>Cancel·la</button>}
      </div>
    </form>
  );
}
