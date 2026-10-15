import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { assignarResponsable } from "../../../shared/schemas/gestio";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { normalitzaText } from "../../../shared/domain/ordenacio";
import { CodiAccesLliurat, ResultatAlta } from "../../components/CodiAccesLliurat";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { AccesAlta, CasalResponsables, CodiAcces, ResponsableCasal } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { useGestio } from "./context";
import { NouCasal } from "./GestioInici";

/** Pantalla d'inici de la superadministració: només tres opcions (petició de 2026-10-15). */
export function AdministracioInici() {
  const { jo } = useGestio();
  return (
    <section aria-labelledby="titol-admin">
      <h1 id="titol-admin">Superadministració</h1>
      <ul className="taulells-admin">
        <li>
          <Link to="/gestio/administracio/responsables">
            <h2>Gestionar responsables</h2>
            <p>Assigneu a cada casal el correu de la persona responsable i lliureu-li el codi de primer accés.</p>
          </Link>
        </li>
        <li>
          <Link to="/gestio/administracio/casal">
            <h2>Casal</h2>
            <p>Entreu a qualsevol casal per veure'n les dades com si en fóssiu responsable.</p>
          </Link>
        </li>
        {jo.quadre_global && (
          <li>
            <Link to="/gestio/administracio/quadre">
              <h2>Quadre de comandament</h2>
              <p>Indicadors de tots els casals i cicles: inscripcions, places, assistència, persones i equips.</p>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

const estatAcces = (r: ResponsableCasal) => {
  if (r.darrer_acces_el) return `Ha entrat (darrer accés: ${formataDataHora(r.darrer_acces_el)})`;
  if (r.te_contrasenya) return "Té contrasenya";
  if (r.codi_pendent_fins) return `Pendent del primer accés (codi vàlid fins al ${formataDataHora(r.codi_pendent_fins)})`;
  return "Sense codi vigent: genereu-ne un de nou";
};

/** Gestionar responsables: el correu de la persona responsable de cada casal. */
export function Responsables() {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.responsables(s), [versio]);
  const [filtre, setFiltre] = useState("");
  const [senseResponsable, setSenseResponsable] = useState(false);
  const [obert, setObert] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ nom: string; email: string; casal: string; acces: AccesAlta } | null>(null);
  const [codi, setCodi] = useState<{ nom: string; email: string; casal: string; codi: CodiAcces } | null>(null);
  const [baixa, setBaixa] = useState<{ casal: CasalResponsables; r: ResponsableCasal } | null>(null);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);

  const casals = useMemo(() => {
    if (consulta.tipus !== "dades") return [];
    const f = normalitzaText(filtre);
    return consulta.dades.casals
      .filter((k) => !senseResponsable || k.responsables.length === 0)
      .filter((k) => !f || normalitzaText(`${k.nom} ${k.municipi} ${k.responsables.map((r) => `${r.nom_visible} ${r.email}`).join(" ")}`).includes(f));
  }, [consulta, filtre, senseResponsable]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els casals…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const totals = consulta.dades.casals;
  const ambResponsable = totals.filter((k) => k.responsables.length > 0).length;

  async function nouCodi(k: CasalResponsables, r: ResponsableCasal) {
    setError(null); setResultat(null); setCodi(null); setEnCurs(true);
    try {
      const { codi } = await serveiGestio.nouCodiResponsable(k.id, r.assignacio_id);
      setCodi({ nom: r.nom_visible, email: r.email, casal: k.nom, codi });
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally { setEnCurs(false); }
  }

  async function confirmaBaixa(motiu: string) {
    if (!baixa) return;
    setError(null); setResultat(null); setCodi(null); setEnCurs(true);
    try {
      await serveiGestio.revocarResponsable(baixa.casal.id, baixa.r.assignacio_id, motiu);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally { setEnCurs(false); setBaixa(null); }
  }

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Gestionar responsables</h1>
      <p className="text-secundari">
        {ambResponsable} de {totals.length} casals tenen responsable. La persona responsable entra la primera vegada amb el seu correu i el codi
        que li feu arribar, i crea la seva contrasenya. Només pot entrar al seu casal, on dona d'alta i de baixa el seu equip.
        Mentre un casal no té responsable, el podeu gestionar vosaltres; quan en té, només el podeu consultar.
      </p>
      <div aria-live="polite">
        {error && <MissatgeError error={error} />}
        {resultat && <ResultatAlta nom={resultat.nom} email={resultat.email} acces={resultat.acces} casal={resultat.casal} />}
        {codi && <CodiAccesLliurat nom={codi.nom} email={codi.email} codi={codi.codi} casal={codi.casal} />}
      </div>
      <div className="barra-filtres">
        <label className="camp camp--en-linia">
          <span>Cerca</span>
          <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Casal, municipi o persona" />
        </label>
        <label className="casella"><input type="checkbox" checked={senseResponsable} onChange={(e) => setSenseResponsable(e.target.checked)} /> Només casals sense responsable</label>
      </div>
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Responsables dels casals">
        <table className="taula">
          <thead><tr><th scope="col">Casal</th><th scope="col">Responsable</th><th scope="col">Accés</th><th scope="col">Accions</th></tr></thead>
          <tbody>
            {casals.map((k) => {
              const files = k.responsables.length ? k.responsables : [null];
              return files.map((r, i) => (
                <tr key={`${k.id}-${r?.assignacio_id ?? "cap"}`}>
                  {i === 0 && (
                    <th scope="row" rowSpan={files.length + (obert === k.id ? 1 : 0)}>
                      {k.nom}<br /><span className="text-secundari">{k.municipi}{k.actiu ? "" : " · inactiu"}</span>
                    </th>
                  )}
                  {r ? (
                    <>
                      <td>{r.nom_visible}<br /><span className="text-secundari">{r.email}</span></td>
                      <td>{estatAcces(r)}</td>
                      <td>
                        <div className="botonera botonera--compacta">
                          <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => void nouCodi(k, r)}>
                            {r.te_contrasenya ? "Codi per canviar la contrasenya" : "Nou codi d'accés"}
                          </button>
                          <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => setBaixa({ casal: k, r })}>Dona de baixa</button>
                          {i === files.length - 1 && obert !== k.id && (
                            <button type="button" className="boto boto--secundari boto--petit" onClick={() => setObert(k.id)}>Afegeix-ne una altra</button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-secundari">Sense responsable</td>
                      <td className="text-secundari">—</td>
                      <td>{obert !== k.id && <button type="button" className="boto boto--petit" onClick={() => setObert(k.id)}>Assigna responsable</button>}</td>
                    </>
                  )}
                </tr>
              )).concat(obert === k.id ? [
                <tr key={`${k.id}-form`}>
                  <td colSpan={3}>
                    <FormResponsable casal={k} onCancelar={() => setObert(null)} onFet={(nom, email, acces) => {
                      setObert(null); setCodi(null); setError(null);
                      setResultat({ nom, email, casal: k.nom, acces });
                      setVersio((v) => v + 1);
                    }} />
                  </td>
                </tr>,
              ] : []);
            })}
          </tbody>
        </table>
      </div>
      {casals.length === 0 && <p>No hi ha cap casal amb aquests criteris.</p>}
      <DialegConfirmacio obert={baixa !== null} enCurs={enCurs} titol="Donar de baixa la persona responsable" textConfirmar="Dona de baixa" demanaMotiu
        onCancelar={() => setBaixa(null)} onConfirmar={(m) => void confirmaBaixa(m)}>
        <p>{baixa?.r.nom_visible} deixarà de ser responsable del {baixa?.casal.nom} i no hi podrà entrar. Les persones del seu equip continuen igual.</p>
      </DialegConfirmacio>
    </div>
  );
}

function FormResponsable({ casal, onFet, onCancelar }: {
  casal: CasalResponsables; onFet: (nom: string, email: string, acces: AccesAlta) => void; onCancelar: () => void;
}) {
  const [v, setV] = useState({ email: "", nom_visible: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [desant, setDesant] = useState(false);

  async function envia(e: FormEvent) {
    e.preventDefault();
    const r = assignarResponsable.safeParse(v);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({}); setError(null); setDesant(true);
    try {
      const { acces } = await serveiGestio.assignarResponsable(casal.id, r.data);
      onFet(r.data.nom_visible, r.data.email, acces);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err;
    } finally { setDesant(false); }
  }

  return (
    <form onSubmit={envia} noValidate className="formulari" aria-label={`Responsable del ${casal.nom}`}>
      {error && <MissatgeError error={error} />}
      <div className="graella-camps">
        <CampText etiqueta="Correu electrònic" obligatori type="email" autoComplete="off" value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })} error={errors.email} />
        <CampText etiqueta="Nom" obligatori value={v.nom_visible} onChange={(e) => setV({ ...v, nom_visible: e.target.value })} error={errors.nom_visible} />
      </div>
      <div className="botonera">
        <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : "Assigna i genera el codi"}</button>
        <button type="button" className="boto boto--secundari" onClick={onCancelar}>Cancel·la</button>
      </div>
    </form>
  );
}

/** Casal: triar qualsevol casal i entrar-hi; i, per a la xarxa, donar-ne d'alta de nous. */
export function AdministracioCasal() {
  const { jo } = useGestio();
  const navegar = useNavigate();
  const consulta = useConsulta((s) => serveiGestio.responsables(s), []);
  const [triat, setTriat] = useState("");
  const casal = consulta.tipus === "dades" ? consulta.dades.casals.find((k) => k.id === triat) : undefined;

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Casal</h1>
      {consulta.tipus === "carregant" && <Carregant />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (
        <form className="formulari" onSubmit={(e) => { e.preventDefault(); if (triat) navegar(`/gestio/${triat}`); }}>
          <div className="camp">
            <label htmlFor="admin-casal">Trieu el casal</label>
            <select id="admin-casal" value={triat} onChange={(e) => setTriat(e.target.value)}>
              <option value="">Trieu un casal…</option>
              {consulta.dades.casals.map((k) => (
                <option key={k.id} value={k.id}>{k.nom}{k.responsables.length ? "" : " (sense responsable)"}</option>
              ))}
            </select>
          </div>
          {casal && (casal.responsables.length > 0 ? (
            <p className="avis avis--info">
              Té responsable ({casal.responsables.map((r) => r.nom_visible).join(", ")}): hi podreu veure totes les dades, però no modificar-les.
            </p>
          ) : (
            <p className="avis avis--alerta">No té responsable: el gestionareu vosaltres com si en fóssiu responsable, fins que n'hi assigneu una.</p>
          ))}
          <button type="submit" className="boto" disabled={!triat}>Entra al casal</button>
        </form>
      )}
      {jo.pot_crear_casals && (
        <Seccio titol="Nou casal" obertaInicial={false}>
          <NouCasal />
        </Seccio>
      )}
    </div>
  );
}
