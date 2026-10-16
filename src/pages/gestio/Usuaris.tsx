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
import type { AccesAlta, AssignacioRol, CodiAcces, PeriodeEquip } from "../../types/gestio";
import { formataData, formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";

/** Rols de l'equip (2026-10-16): la persona responsable (l'assigna la superadministració) i conserge. */
const ROLS = [{ valor: "conserge", text: "Conserge (només gestionar l'assistència)" }];
const NOMS_ROLS: Record<string, string> = {
  responsable_casal: "Responsable del casal",
  conserge: "Conserge",
  // Rols anteriors: les assignacions existents continuen fins que es revoquin.
  gestor_casal: "Gestió del casal (rol antic)",
  consulta_casal: "Consulta del casal (rol antic)",
  difusio_casal: "Difusió del casal (rol antic)",
};
const nomRol = (codi: string) => NOMS_ROLS[codi] ?? codi;
const estatAcces = (a: AssignacioRol) => {
  if (a.darrer_acces_el) return `Darrer accés: ${formataDataHora(a.darrer_acces_el)}`;
  if (a.te_contrasenya) return "Té contrasenya";
  if (a.codi_pendent_fins) return `Pendent del primer accés (codi fins al ${formataDataHora(a.codi_pendent_fins)})`;
  return "Sense codi vigent";
};

export function Usuaris() {
  const { casalId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.assignacions(casalId, s), [casalId, versio]);
  const [v, setV] = useState({ email: "", nom_visible: "", rol_codi: "conserge" });
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
      setV({ email: "", nom_visible: "", rol_codi: "conserge" });
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

  if (!pot("usuaris.gestionar")) {
    return <p role="alert" className="avis avis--error">Només la persona responsable del casal pot gestionar l'equip. <Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>;
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
      <HistorialEquip casalId={casalId} versio={versio} />
      <DialegConfirmacio obert={revocant !== null} enCurs={desant} titol="Donar de baixa" textConfirmar="Dona de baixa" demanaMotiu
        onCancelar={() => setRevocant(null)} onConfirmar={revoca}>
        <p>{revocant?.nom_visible} deixarà de tenir el rol «{revocant ? nomRol(revocant.rol_codi) : ""}» en aquest casal. El canvi té efecte immediat i queda registrat.</p>
      </DialegConfirmacio>
    </div>
  );
}

/**
 * Historial de l'equip (petició de 2026-10-16): cada alta és un període propi, de manera que
 * una mateixa persona pot sortir diverses vegades si l'han donada d'alta i de baixa més d'un cop.
 */
function HistorialEquip({ casalId, versio }: { casalId: string; versio: number }) {
  const consulta = useConsulta((s) => serveiGestio.historialEquip(casalId, s), [casalId, versio]);
  const [nomesBaixes, setNomesBaixes] = useState(false);
  return (
    <Seccio titol="Historial de l'equip" obertaInicial={false}>
      {consulta.tipus === "carregant" && <Carregant text="Carregant l'historial…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (() => {
        const periodes = consulta.dades.historial;
        if (periodes.length === 0) return <p>Encara no hi ha cap alta registrada.</p>;
        const perPersona = new Map<string, PeriodeEquip[]>();
        for (const p of periodes) perPersona.set(p.usuari_id, [...(perPersona.get(p.usuari_id) ?? []), p]);
        const persones = [...perPersona.values()].filter((ps) => !nomesBaixes || ps.every((p) => p.revocat_el));
        return (
          <>
            <p className="text-secundari">
              Cada fila és un període: des de l'alta fins a la baixa. Si una persona ha entrat i sortit de l'equip més d'una vegada, en surten tots els períodes.
            </p>
            <label className="casella"><input type="checkbox" checked={nomesBaixes} onChange={(e) => setNomesBaixes(e.target.checked)} /> Només les persones que ja no són a l'equip</label>
            <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Historial de l'equip">
              <table className="taula">
                <thead>
                  <tr><th scope="col">Persona</th><th scope="col">Rol</th><th scope="col">Alta</th><th scope="col">Baixa</th><th scope="col">Motiu de la baixa</th></tr>
                </thead>
                <tbody>
                  {persones.flatMap((ps) => ps.map((p, i) => (
                    <tr key={p.id}>
                      {i === 0 && (
                        <th scope="row" rowSpan={ps.length}>
                          {p.nom_visible}<br /><span className="text-secundari">{p.email}</span>
                          {ps.length > 1 && <><br /><span className="text-secundari">{ps.length} períodes</span></>}
                        </th>
                      )}
                      <td>{nomRol(p.rol_codi)}</td>
                      <td className="sense-salt">{formataData(p.atorgat_el.slice(0, 10))}{p.atorgat_per && <><br /><span className="text-secundari">per {p.atorgat_per}</span></>}</td>
                      <td className="sense-salt">
                        {p.revocat_el ? <>{formataData(p.revocat_el.slice(0, 10))}{p.revocat_per && <><br /><span className="text-secundari">per {p.revocat_per}</span></>}</> : <span className="etiqueta etiqueta--activa">Actualment a l'equip</span>}
                      </td>
                      <td>{p.revocat_el ? p.motiu ?? "—" : ""}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </Seccio>
  );
}
