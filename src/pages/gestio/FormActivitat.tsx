import { useState, type FormEvent } from "react";
import { activitatCrear } from "../../../shared/schemas/gestio";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { CampAreaText, CampSeleccio, CampText } from "../../components/Formulari";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import type { Activitat } from "../../types/gestio";

const DIES = [[1, "Dl"], [2, "Dt"], [3, "Dc"], [4, "Dj"], [5, "Dv"], [6, "Ds"], [7, "Dg"]] as const;
const NOMS_DIES = ["", "Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];

type Valors = {
  nom: string; descripcio: string; categoria: string; dies_setmana: number[]; hora_inici: string; hora_fi: string;
  horari_text: string; data_inici: string; data_fi: string; espai: string; tallerista: string; gestio: string; destinataris: string; grup: string; capacitat: string; nombre_sessions: string; minim_participants: string; codi_extern: string;
};

const desDe = (a?: Activitat): Valors => ({
  nom: a?.nom ?? "", descripcio: a?.descripcio ?? "", categoria: a?.categoria ?? "", dies_setmana: a?.dies_setmana ?? [],
  hora_inici: a?.hora_inici ?? "", hora_fi: a?.hora_fi ?? "", horari_text: a?.horari_text ?? "",
  data_inici: a?.data_inici ?? "", data_fi: a?.data_fi ?? "", espai: a?.espai ?? "", tallerista: a?.tallerista ?? "", gestio: a?.gestio ?? "associacio", destinataris: a?.destinataris ?? "", grup: a?.grup != null ? String(a.grup) : "",
  capacitat: a ? String(a.capacitat) : "", nombre_sessions: a?.nombre_sessions != null ? String(a.nombre_sessions) : "",
  minim_participants: a?.minim_participants != null ? String(a.minim_participants) : "",
  codi_extern: a?.codi_extern ?? "",
});

export function FormActivitat({ activitat, textBoto, onDesar, onCancelar }: {
  activitat?: Activitat; textBoto: string; onCancelar?: () => void;
  onDesar: (dades: Record<string, unknown>) => Promise<void>;
}) {
  const [v, setV] = useState<Valors>(desDe(activitat));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [desant, setDesant] = useState(false);
  const canvia = (k: keyof Valors) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const commutaDia = (d: number) =>
    setV((x) => ({ ...x, dies_setmana: x.dies_setmana.includes(d) ? x.dies_setmana.filter((y) => y !== d) : [...x.dies_setmana, d] }));

  async function envia(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    const nul = (s: string) => (s.trim() === "" ? null : s.trim());
    const dades = {
      nom: v.nom, descripcio: nul(v.descripcio), categoria: nul(v.categoria), dies_setmana: v.dies_setmana,
      hora_inici: nul(v.hora_inici), hora_fi: nul(v.hora_fi), horari_text: nul(v.horari_text),
      data_inici: nul(v.data_inici), data_fi: nul(v.data_fi), espai: nul(v.espai), tallerista: nul(v.tallerista), gestio: v.gestio, destinataris: nul(v.destinataris), grup: v.grup === "" ? null : Number(v.grup),
      capacitat: v.capacitat === "" ? Number.NaN : Number(v.capacitat),
      nombre_sessions: v.nombre_sessions === "" ? null : Number(v.nombre_sessions),
      minim_participants: v.minim_participants === "" ? null : Number(v.minim_participants), codi_extern: nul(v.codi_extern),
    };
    const r = activitatCrear.safeParse(dades);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    setDesant(true);
    try {
      await onDesar(dades);
      if (!activitat) setV(desDe());
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
        <CampText etiqueta="Títol" obligatori value={v.nom} onChange={canvia("nom")} error={errors.nom} maxLength={150} />
        <CampText etiqueta="Categoria" value={v.categoria} onChange={canvia("categoria")} error={errors.categoria} maxLength={80} />
        <CampText etiqueta="Capacitat (places)" obligatori type="number" min={0} value={v.capacitat} onChange={canvia("capacitat")} error={errors.capacitat} />
        <CampText etiqueta="Nombre de sessions" type="number" min={0} value={v.nombre_sessions} onChange={canvia("nombre_sessions")} error={errors.nombre_sessions} />
        <CampText etiqueta="Mínim de participants" type="number" min={0} value={v.minim_participants} onChange={canvia("minim_participants")}
          error={errors.minim_participants} ajuda="Habitualment 15 en activitats d'adults i 8 en infantils i juvenils. Només serveix per avisar." />
        <fieldset className="camp camp--ample">
          <legend>Dies de la setmana <span className="camp__opcional">(opcional)</span></legend>
          <div className="dies">
            {DIES.map(([d, curt]) => (
              <label key={d} className="dies__dia">
                <input type="checkbox" checked={v.dies_setmana.includes(d)} onChange={() => commutaDia(d)} />
                <span aria-hidden="true">{curt}</span><span className="visualment-amagat">{NOMS_DIES[d]}</span>
              </label>
            ))}
          </div>
          {errors.dies_setmana && <p className="camp__missatge" role="alert">{errors.dies_setmana}</p>}
        </fieldset>
        <CampText etiqueta="Hora d'inici" type="time" value={v.hora_inici} onChange={canvia("hora_inici")} error={errors.hora_inici} />
        <CampText etiqueta="Hora de finalització" type="time" value={v.hora_fi} onChange={canvia("hora_fi")} error={errors.hora_fi} />
        <CampText etiqueta="Horari (text lliure)" value={v.horari_text} onChange={canvia("horari_text")} error={errors.horari_text}
          ajuda="Només si l'horari no és regular. Substitueix els dies i hores a la pàgina pública." />
        <CampText etiqueta="Data d'inici" type="date" value={v.data_inici} onChange={canvia("data_inici")} error={errors.data_inici} />
        <CampText etiqueta="Data de finalització" type="date" value={v.data_fi} onChange={canvia("data_fi")} error={errors.data_fi} />
        <CampText etiqueta="Aula o espai" value={v.espai} onChange={canvia("espai")} error={errors.espai} />
        <CampSeleccio etiqueta="Qui la gestiona" obligatori value={v.gestio} onChange={canvia("gestio")} error={errors.gestio}
          opcions={[{ valor: "generalitat", text: "Generalitat (compta a les estadístiques)" }, { valor: "associacio", text: "Associació o entitat (no compta)" }]}
          ajuda="Les estadístiques de la superadministració només compten les activitats de la Generalitat. Les importades de la PGEc ja hi surten com a Generalitat." />
        <CampText etiqueta="Tallerista" value={v.tallerista} onChange={canvia("tallerista")} error={errors.tallerista}
          ajuda="Nom de la persona que fa el taller. Si encara no n'hi ha, deixeu-ho buit: comptarà com a activitat sense tallerista." />
        <CampText etiqueta="Grup" type="number" min={1} max={99} value={v.grup} onChange={canvia("grup")} error={errors.grup}
          ajuda="Activitats que no es poden acumular: per exemple 1 per a totes les esportives i 2 per a totes les de ball. El màxim de cada grup es posa sota la llista d'activitats." />
        <CampText etiqueta="Persones a qui va dirigida" value={v.destinataris} onChange={canvia("destinataris")} error={errors.destinataris} maxLength={200} />
        <CampText etiqueta="Codi FA (PGEC)" value={v.codi_extern} onChange={canvia("codi_extern")} error={errors.codi_extern} />
        <div className="camp--ample">
          <CampAreaText etiqueta="Descripció" value={v.descripcio} onChange={canvia("descripcio")} error={errors.descripcio} maxLength={2000} rows={3} />
        </div>
      </div>
      <div className="botonera">
        <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : textBoto}</button>
        {onCancelar && <button type="button" className="boto boto--secundari" onClick={onCancelar} disabled={desant}>Cancel·la</button>}
      </div>
    </form>
  );
}
