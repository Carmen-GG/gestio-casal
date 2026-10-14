import { useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiAuth } from "../../services/gestio";
import type { ContextGestio } from "./context";

/** Estructura del panell: comprova la sessió al servidor abans de mostrar res. */
export function GestioDisseny() {
  const ubicacio = useLocation();
  const navegar = useNavigate();
  const { casalId } = useParams();
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiAuth.jo(s), [versio]);
  const [sortint, setSortint] = useState(false);

  if (consulta.tipus === "carregant") return <Carregant text="Comprovant la sessió…" />;
  if (consulta.tipus === "error") {
    if (consulta.error.status === 401) {
      return <Navigate to={`/gestio/entrar?tornar=${encodeURIComponent(ubicacio.pathname)}`} replace />;
    }
    return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  }

  const jo = consulta.dades;
  const casalActual = jo.casals.find((c) => c.id === casalId);
  const esCartells = /^\/gestio\/[^/]+\/cartells(\/|$)/.test(ubicacio.pathname);
  const context: ContextGestio = { jo, recarregarJo: () => setVersio((v) => v + 1) };

  async function sortir() {
    setSortint(true);
    try {
      await serveiAuth.sortir();
    } finally {
      navegar("/gestio/entrar", { replace: true });
    }
  }

  return (
    <div className="gestio">
      <nav className="barra-gestio" aria-label="Panell de gestió">
        <Link to="/gestio" className="barra-gestio__titol">Panell de gestió</Link>
        {jo.casals.length > 0 && (
          <label className="barra-gestio__casal">
            <span>Casal:</span>
            <select value={casalId ?? ""} onChange={(e) => e.target.value && navegar(`/gestio/${e.target.value}`)}>
              <option value="">Trieu un casal…</option>
              {jo.casals.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
        )}
        {casalActual && (
          <ul className="barra-gestio__moduls" aria-label="Mòduls">
            <li><Link to={`/gestio/${casalActual.id}`} aria-current={esCartells ? undefined : "page"}>Inscripcions</Link></li>
            {casalActual.permisos.includes("cartells.consultar") && (
              <li><Link to={`/gestio/${casalActual.id}/cartells`} aria-current={esCartells ? "page" : undefined}>PG-Cartells</Link></li>
            )}
          </ul>
        )}
        <span className="barra-gestio__usuari">{jo.usuari.nom_visible}</span>
        <button type="button" className="boto boto--secundari boto--petit" onClick={sortir} disabled={sortint}>
          Tanca la sessió
        </button>
      </nav>
      <Outlet context={context} />
    </div>
  );
}
