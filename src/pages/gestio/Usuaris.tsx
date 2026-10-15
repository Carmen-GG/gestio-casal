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
import { CodiAccesLliurat, ResultatAlta } from "../../components/CodiAccesLliurat";
import type { AccesAlta, AssignacioRol, CodiAcces } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

const ROLS = [
  { valor: "gestor_casal", text: "Gestió del casal" },
  { valor: "consulta_casal", text: "Consulta del casal" },
  { valor: "difusio_casal", text: "Difusió del casal (PG-Cartells)" },
];
const nomRol = (codi: string) => (codi === "responsable_casal" ? "Responsable del casal" : ROLS.find((r) => r.valor === codi)?.text ?? codi);
const estatAcces = (a: AssignacioRol) => {
  if (a.darrer_acces_el) return `Darrer accés: ${formataDataHora(a.darrer_acces_el)}`;
  if (a.te_contrasenya) return "Té contrasenya";
  if (a.codi_pendent_fins) return `Pendent del primer accés (codi fins al ${formataDataHora(a.codi_pendent_fins)})`;
  return "Sense codi vigent";
};

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
  const [alta, setAlta] = useState<{ nom: string; email: string; acces: AccesAlta } | null>(null);
  const [codi, setCodi] = useState<{ nom: string; email: string; codi: CodiAcces } | null>(null);

  async function nouCodi(a: AssignacioRol) {
    setError(null); setExit(""); setAlta(null); setCodi(null); setDesant(true);
    try {
      const r = await serveiGestio.nouCodiUsuari(casalId, a.id);
      setCodi({ nom: a.nom_visible, email: a.email, codi: r.codi });
      setVersio((x) => x + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) setError(err); else throw err;
    } finally { setDesant(false); }
  }

  async function envia(e: FormEvent) {
    e.preventDefault();
    setError(null); setExit(""); setAlta(null); setCodi(null);
    const r = assignarRol.safeParse(v);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({}); setDesant(true);
    try {
      const resposta = await serveiGestio.assignarRol(casalId, r.data);
      setExit(`S'ha donat d'alta ${v.nom_visible} amb el rol «${nomRol(v.rol_codi)}».`);
      setAlta({ nom: v.nom_visible, email: r.data.email, acces: resposta.acces });
      setV({ email: "", nom_visible: "", rol_codi: "gestor_casal" });
      setVersio((x) => x + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err;
    } finally { setDesant(false); }
  }

  async function revoca(motiu: string) {
    if (!revocant) return;
    setDesant(true); setError(null); setExit(""); setAlta(null); setCodi(null);
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
      <h1>Equip del casal</h1>
      <p className="text-secundari">
        Doneu d'alta les persones de l'equip amb el seu correu. Rebreu un codi de primer accés per fer-los arribar: amb el seu correu i el codi
        crearan la seva contrasenya. Si algú oblida la contrasenya, genereu-li un codi nou. Les baixes tenen efecte immediat.
      </p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
        {alta && <ResultatAlta nom={alta.nom} email={alta.email} acces={alta.acces} />}
        {codi && <CodiAccesLliurat nom={codi.nom} email={codi.email} codi={codi.codi} />}
      </div>
      <Seccio titol="Persones de l'equip">
        {consulta.tipus === "carregant" && <Carregant />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (consulta.dades.assignacions.length === 0 ? <p>No hi ha cap persona assignada a aquest casal.</p> : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Persones autoritzades">
            <table className="taula">
              <thead><tr><th scope="col">Persona</th><th scope="col">Correu</th><th scope="col">Rol</th><th scope="col">Accés</th><th scope="col">Accions</th></tr></thead>
              <tbody>
                {consulta.dades.assignacions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nom_visible}</td><td>{a.email}</td><td>{nomRol(a.rol_codi)}</td><td>{estatAcces(a)}</td>
                    <td>
                      {a.rol_codi === "responsable_casal" ? <span className="text-secundari">La gestiona la superadministració</span> : (
                        <div className="botonera botonera--compacta">
                          <button type="button" className="boto boto--secundari boto--petit" disabled={desant} onClick={() => void nouCodi(a)}>
                            {a.te_contrasenya ? "Codi per canviar la contrasenya" : "Nou codi d'accés"}
                          </button>
                          <button type="button" className="boto boto--secundari boto--petit" onClick={() => setRevocant(a)}>Dona de baixa</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Seccio>
      <Seccio titol="Dona d'alta una persona">
        <form onSubmit={envia} noValidate className="formulari">
          <div className="graella-camps">
            <CampText etiqueta="Correu electrònic" obligatori type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={errors.email} />
            <CampText etiqueta="Nom" obligatori value={v.nom_visible} onChange={(e) => setV({ ...v, nom_visible: e.target.value })} error={errors.nom_visible} />
            <CampSeleccio etiqueta="Rol" obligatori value={v.rol_codi} opcions={ROLS} onChange={(e) => setV({ ...v, rol_codi: e.target.value })} error={errors.rol_codi} />
          </div>
          <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : "Dona d'alta"}</button>
        </form>
      </Seccio>
      <DialegConfirmacio obert={revocant !== null} enCurs={desant} titol="Donar de baixa" textConfirmar="Dona de baixa" demanaMotiu
        onCancelar={() => setRevocant(null)} onConfirmar={revoca}>
        <p>{revocant?.nom_visible} deixarà de tenir el rol «{revocant ? nomRol(revocant.rol_codi) : ""}» en aquest casal. El canvi té efecte immediat i queda registrat.</p>
      </DialegConfirmacio>
    </div>
  );
}
