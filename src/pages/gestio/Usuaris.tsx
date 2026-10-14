import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { assignarRol } from "../../../shared/schemas/gestio";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampSeleccio, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { AssignacioRol } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

const ROLS = [
  { valor: "gestor_casal", text: "Gestió del casal" },
  { valor: "consulta_casal", text: "Consulta del casal" },
  { valor: "difusio_casal", text: "Difusió del casal (PG-Cartells)" },
];
const nomRol = (codi: string) => ROLS.find((r) => r.valor === codi)?.text ?? codi;

export function Usuaris() {
  const { casalId = "" } = useParams();
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.assignacions(casalId, s), [casalId, versio]);
  const [v, setV] = useState({ email: "", nom_visible: "", rol_codi: "gestor_casal" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [desant, setDesant] = useState(false);
  const [revocant, setRevocant] = useState<AssignacioRol | null>(null);

  async function envia(e: FormEvent) {
    e.preventDefault();
    setError(null); setExit("");
    const r = assignarRol.safeParse(v);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({}); setDesant(true);
    try {
      await serveiGestio.assignarRol(casalId, v);
      setExit(`S'ha assignat el rol a ${v.nom_visible}.`);
      setV({ email: "", nom_visible: "", rol_codi: "gestor_casal" });
      setVersio((x) => x + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err;
    } finally { setDesant(false); }
  }

  async function revoca(motiu: string) {
    if (!revocant) return;
    setDesant(true); setError(null); setExit("");
    try {
      await serveiGestio.revocarRol(casalId, revocant.id, motiu);
      setExit(`S'ha revocat el rol de ${revocant.nom_visible}.`);
      setVersio((x) => x + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) setError(err); else throw err;
    } finally { setDesant(false); setRevocant(null); }
  }

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>
      <h1>Persones autoritzades</h1>
      <div aria-live="polite">{exit && <AvisExit>{exit}</AvisExit>}{error && <MissatgeError error={error} />}</div>
      <Seccio titol="Rols vigents">
        {consulta.tipus === "carregant" && <Carregant />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (consulta.dades.assignacions.length === 0 ? <p>No hi ha cap persona assignada a aquest casal.</p> : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Persones autoritzades">
            <table className="taula">
              <thead><tr><th scope="col">Persona</th><th scope="col">Correu</th><th scope="col">Rol</th><th scope="col">Des de</th><th scope="col">Accions</th></tr></thead>
              <tbody>
                {consulta.dades.assignacions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nom_visible}</td><td>{a.email}</td><td>{nomRol(a.rol_codi)}</td><td>{formataDataHora(a.atorgat_el)}</td>
                    <td><button type="button" className="boto boto--secundari boto--petit" onClick={() => setRevocant(a)}>Revoca</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Seccio>
      <Seccio titol="Assigna un rol">
        <form onSubmit={envia} noValidate className="formulari">
          <div className="graella-camps">
            <CampText etiqueta="Correu electrònic" obligatori type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={errors.email} />
            <CampText etiqueta="Nom" obligatori value={v.nom_visible} onChange={(e) => setV({ ...v, nom_visible: e.target.value })} error={errors.nom_visible} />
            <CampSeleccio etiqueta="Rol" obligatori value={v.rol_codi} opcions={ROLS} onChange={(e) => setV({ ...v, rol_codi: e.target.value })} error={errors.rol_codi} />
          </div>
          <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : "Assigna el rol"}</button>
        </form>
      </Seccio>
      <DialegConfirmacio obert={revocant !== null} enCurs={desant} titol="Revocar el rol" textConfirmar="Revoca el rol" demanaMotiu
        onCancelar={() => setRevocant(null)} onConfirmar={revoca}>
        <p>{revocant?.nom_visible} deixarà de tenir el rol «{revocant ? nomRol(revocant.rol_codi) : ""}» en aquest casal. El canvi té efecte immediat i queda registrat.</p>
      </DialegConfirmacio>
    </div>
  );
}
