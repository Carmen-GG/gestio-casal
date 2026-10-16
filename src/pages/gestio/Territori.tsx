import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { normalitzaText } from "../../../shared/domain/ordenacio";
import { DEMARCACIONS } from "../../../shared/domain/territori";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { CasalTerritori, Referent } from "../../types/gestio";

type Canvis = { comarca: string; demarcacio: string; referent_id: string };
const inicials = (k: CasalTerritori): Canvis => ({ comarca: k.comarca ?? "", demarcacio: k.demarcacio ?? "", referent_id: k.referent_id ?? "" });

/**
 * Territori i referents (petició de 2026-10-16): quina referent porta cada casal i a quina
 * comarca i demarcació pertany. El quadre de comandament filtra amb aquestes dades.
 */
export function Territori() {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.territori(s), [versio]);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [filtreReferent, setFiltreReferent] = useState("");
  const [canvis, setCanvis] = useState<Record<string, Canvis>>({});
  const [seleccio, setSeleccio] = useState<Set<string>>(new Set());
  const [referentLot, setReferentLot] = useState("");

  const casals = useMemo(() => {
    if (consulta.tipus !== "dades") return [];
    const f = normalitzaText(filtre);
    return consulta.dades.casals
      .filter((k) => !filtreReferent || (filtreReferent === "cap" ? !k.referent_id : k.referent_id === filtreReferent))
      .filter((k) => !f || normalitzaText(`${k.nom} ${k.municipi} ${k.comarca ?? ""} ${k.demarcacio ?? ""}`).includes(f));
  }, [consulta, filtre, filtreReferent]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els casals i les referents…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const { referents } = consulta.dades;
  const comarques = [...new Set(consulta.dades.casals.map((k) => k.comarca).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ca"));
  const perReferent = (id: string) => consulta.dades.casals.filter((k) => k.referent_id === id).length;
  const senseReferent = consulta.dades.casals.filter((k) => !k.referent_id).length;

  async function executa(accio: () => Promise<string>) {
    setError(null); setAvis(null); setEnCurs(true);
    try {
      setAvis(await accio());
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e); else throw e;
    } finally { setEnCurs(false); }
  }

  const desaCasal = (k: CasalTerritori) => executa(async () => {
    const c = canvis[k.id] ?? inicials(k);
    await serveiGestio.territoriCasal(k.id, { comarca: c.comarca, demarcacio: c.demarcacio, referent_id: c.referent_id || null });
    setCanvis(({ [k.id]: _, ...resta }) => resta);
    return `S'han desat les dades de ${k.nom}.`;
  });

  const assignaLot = () => executa(async () => {
    const triats = consulta.dades.casals.filter((k) => seleccio.has(k.id));
    for (const k of triats) {
      await serveiGestio.territoriCasal(k.id, { comarca: k.comarca ?? "", demarcacio: k.demarcacio ?? "", referent_id: referentLot || null });
    }
    setSeleccio(new Set());
    const nom = referents.find((r) => r.id === referentLot)?.nom;
    return nom ? `${triats.length} casals assignats a ${nom}.` : `${triats.length} casals han quedat sense referent.`;
  });

  const canvia = (k: CasalTerritori, camp: keyof Canvis, valor: string) =>
    setCanvis((c) => ({ ...c, [k.id]: { ...(c[k.id] ?? inicials(k)), [camp]: valor } }));
  const tots = casals.length > 0 && casals.every((k) => seleccio.has(k.id));

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Territori i referents</h1>
      <p className="text-secundari">
        Indiqueu quina referent porta cada casal i reviseu-ne la comarca i la demarcació. La comarca i la demarcació s'han proposat a partir
        del municipi; corregiu les que no siguin bones. El quadre de comandament fa servir aquestes dades per filtrar els indicadors.
      </p>
      <div aria-live="polite">
        {error && <MissatgeError error={error} />}
        {avis && <AvisExit>{avis}</AvisExit>}
      </div>

      <Seccio titol={`Referents (${referents.length})`}>
        <NouReferent enCurs={enCurs} onDesa={(d) => executa(async () => { await serveiGestio.crearReferent(d); return `S'ha afegit ${d.nom}.`; })} />
        {referents.length === 0 ? <p>Encara no hi ha cap referent.</p> : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Referents">
            <table className="taula">
              <thead><tr><th scope="col">Referent</th><th scope="col">Correu</th><th scope="col" className="num">Casals</th><th scope="col">Estat</th><th scope="col">Accions</th></tr></thead>
              <tbody>
                {referents.map((r) => (
                  <FilaReferent key={r.id} r={r} casals={perReferent(r.id)} enCurs={enCurs}
                    onDesa={(d) => executa(async () => { await serveiGestio.actualitzarReferent(r.id, d); return `S'ha actualitzat ${d.nom}.`; })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-secundari">{senseReferent} casals encara no tenen referent.</p>
      </Seccio>

      <Seccio titol="Casals">
        <div className="barra-filtres">
          <label className="camp camp--en-linia">
            <span>Cerca</span>
            <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Casal, municipi, comarca o demarcació" />
          </label>
          <label className="camp camp--en-linia">
            <span>Referent</span>
            <select value={filtreReferent} onChange={(e) => setFiltreReferent(e.target.value)}>
              <option value="">Totes</option>
              <option value="cap">Sense referent</option>
              {referents.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </select>
          </label>
        </div>
        <div className="barra-filtres">
          <span>{seleccio.size} casals seleccionats.</span>
          <label className="camp camp--en-linia">
            <span>Assigna'ls a</span>
            <select value={referentLot} onChange={(e) => setReferentLot(e.target.value)}>
              <option value="">Cap referent</option>
              {referents.filter((r) => r.actiu).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </select>
          </label>
          <button type="button" className="boto boto--petit" disabled={enCurs || seleccio.size === 0} onClick={() => void assignaLot()}>Assigna</button>
        </div>
        <datalist id="llista-comarques">{comarques.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Territori dels casals">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">
                  <input type="checkbox" aria-label="Selecciona tots els casals de la llista" checked={tots}
                    onChange={(e) => setSeleccio(e.target.checked ? new Set([...seleccio, ...casals.map((k) => k.id)]) : new Set([...seleccio].filter((id) => !casals.some((k) => k.id === id))))} />
                </th>
                <th scope="col">Casal</th><th scope="col">Comarca</th><th scope="col">Demarcació</th><th scope="col">Referent</th><th scope="col">Accions</th>
              </tr>
            </thead>
            <tbody>
              {casals.map((k) => {
                const c = canvis[k.id] ?? inicials(k);
                const modificat = !!canvis[k.id];
                return (
                  <tr key={k.id}>
                    <td>
                      <input type="checkbox" aria-label={`Selecciona ${k.nom}`} checked={seleccio.has(k.id)}
                        onChange={(e) => { const s = new Set(seleccio); if (e.target.checked) s.add(k.id); else s.delete(k.id); setSeleccio(s); }} />
                    </td>
                    <th scope="row">{k.nom}<br /><span className="text-secundari">{k.municipi}{k.actiu ? "" : " · inactiu"}</span></th>
                    <td><input aria-label={`Comarca de ${k.nom}`} list="llista-comarques" value={c.comarca} maxLength={80} onChange={(e) => canvia(k, "comarca", e.target.value)} /></td>
                    <td>
                      <select aria-label={`Demarcació de ${k.nom}`} value={c.demarcacio} onChange={(e) => canvia(k, "demarcacio", e.target.value)}>
                        <option value="">—</option>
                        {DEMARCACIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                        {c.demarcacio && !(DEMARCACIONS as readonly string[]).includes(c.demarcacio) && <option value={c.demarcacio}>{c.demarcacio}</option>}
                      </select>
                    </td>
                    <td>
                      <select aria-label={`Referent de ${k.nom}`} value={c.referent_id} onChange={(e) => canvia(k, "referent_id", e.target.value)}>
                        <option value="">Cap</option>
                        {referents.filter((r) => r.actiu || r.id === c.referent_id).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="boto boto--petit" disabled={!modificat || enCurs} onClick={() => void desaCasal(k)}>Desa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccio>
    </div>
  );
}

function NouReferent({ enCurs, onDesa }: { enCurs: boolean; onDesa: (d: { nom: string; email: string }) => Promise<void> }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  async function envia(e: FormEvent) {
    e.preventDefault();
    await onDesa({ nom: nom.trim(), email: email.trim() });
    setNom(""); setEmail("");
  }
  return (
    <form className="formulari-en-linia" onSubmit={(e) => void envia(e)}>
      <CampText etiqueta="Nom de la referent" obligatori value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} />
      <CampText etiqueta="Correu" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="boto" disabled={enCurs || nom.trim().length < 2}>Afegeix la referent</button>
    </form>
  );
}

function FilaReferent({ r, casals, enCurs, onDesa }: { r: Referent; casals: number; enCurs: boolean; onDesa: (d: { nom: string; email: string; actiu: boolean }) => Promise<void> }) {
  const [editant, setEditant] = useState(false);
  const [nom, setNom] = useState(r.nom);
  const [email, setEmail] = useState(r.email ?? "");
  if (editant) {
    return (
      <tr>
        <td><input aria-label="Nom de la referent" value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} /></td>
        <td><input aria-label="Correu de la referent" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></td>
        <td className="num">{casals}</td>
        <td>{r.actiu ? "Activa" : "Inactiva"}</td>
        <td className="accions-fila">
          <button type="button" className="boto boto--petit" disabled={enCurs || nom.trim().length < 2}
            onClick={() => void onDesa({ nom: nom.trim(), email: email.trim(), actiu: r.actiu }).then(() => setEditant(false))}>Desa</button>
          <button type="button" className="boto boto--secundari boto--petit" onClick={() => { setEditant(false); setNom(r.nom); setEmail(r.email ?? ""); }}>Cancel·la</button>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row">{r.nom}</th>
      <td>{r.email ?? "—"}</td>
      <td className="num">{casals}</td>
      <td>{r.actiu ? "Activa" : "Inactiva"}</td>
      <td className="accions-fila">
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditant(true)}>Edita</button>
        <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs}
          onClick={() => void onDesa({ nom: r.nom, email: r.email ?? "", actiu: !r.actiu })}>{r.actiu ? "Desactiva" : "Reactiva"}</button>
      </td>
    </tr>
  );
}
