import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Carregant, MissatgeError } from "../components/EstatsConsulta";
import { useConsulta } from "../hooks/useConsulta";
import { serveiPublic } from "../services/public";

const CASAL_PER_DEFECTE = import.meta.env.VITE_CASAL_PER_DEFECTE || "CAN-BOADA";

export function Inici() {
  const navegar = useNavigate();
  const consulta = useConsulta((s) => serveiPublic.casals(s), []);
  const [codi, setCodi] = useState("");

  function veure(e: FormEvent) {
    e.preventDefault();
    if (codi) navegar(`/inscripcio/${encodeURIComponent(codi)}`);
  }

  return (
    <section aria-labelledby="titol-inici">
      <h1 id="titol-inici">Inscripcions a les activitats</h1>
      <p>Trieu el casal per consultar els cicles d'activitats amb inscripcions i les activitats que s'hi ofereixen.</p>
      {consulta.tipus === "carregant" && <Carregant text="Carregant els casals…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (
        <form onSubmit={veure} className="formulari tria-casal">
          <div className="camp">
            <label htmlFor="casal-inici">Casal</label>
            <select id="casal-inici" value={codi} onChange={(e) => setCodi(e.target.value)} required>
              <option value="">Trieu un casal…</option>
              {consulta.dades.casals.map((c) => <option key={c.codi} value={c.codi}>{c.nom}</option>)}
            </select>
          </div>
          <div className="botonera">
            <button type="submit" className="boto" disabled={!codi}>Veure els cicles d'activitats</button>
          </div>
        </form>
      )}
      {consulta.tipus === "dades" && consulta.dades.casals.some((c) => c.codi === CASAL_PER_DEFECTE) && (
        <p><Link to={`/inscripcio/${CASAL_PER_DEFECTE}`}>Anar directament al casal de demostració</Link></p>
      )}
      <h2>Personal dels casals</h2>
      <p>
        <Link className="boto boto--secundari" to="/gestio">Entrar al panell de gestió</Link>
      </p>
    </section>
  );
}
