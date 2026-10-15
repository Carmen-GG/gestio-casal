import { useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiAuth } from "../../services/gestio";
import type { ContextGestio } from "./context";
import { MenuCasal } from "./MenuCasal";

/** Estructura del panell: comprova la sessió al servidor abans de mostrar res. */
export function GestioDisseny() {
  const ubicacio = useLocation();
  const navegar = useNavigate();
  const { casalId } = useParams();
  const [versio, setVersio] = useState(0);
  // Amb clau: en recarregar les dades de la persona no es desmunta la pàgina oberta (i no es perden els missatges).
  const consulta = useConsulta((s) => serveiAuth.jo(s), [versio], "jo");
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
      navegar("/", { replace: true });
    }
  }

  return (
    <div className="gestio">
      <nav className="barra-gestio" aria-label={jo.superadministracio ? "Superadministració" : "Administració"}>
        <Link to="/gestio" className="barra-gestio__titol">{jo.superadministracio ? "Superadministració" : "Administració"}</Link>
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
        <Link to="/gestio/compte" className="barra-gestio__usuari" title="El meu compte">{jo.usuari.nom_visible}</Link>
        <button type="button" className="boto boto--secundari boto--petit" onClick={sortir} disabled={sortint}>
          Tanca la sessió
        </button>
      </nav>
      {!jo.te_contrasenya && !ubicacio.pathname.startsWith("/gestio/compte") && (
        <p className="avis" role="status">
          Encara no teniu contrasenya: cada vegada caldria un codi d'accés nou.{" "}
          <Link to="/gestio/compte">Fixeu una contrasenya</Link> per entrar amb el vostre correu.
        </p>
      )}
      {casalActual?.nomes_consulta && (
        <p className="avis avis--info mode-consulta" role="status">
          Mode consulta: aquest casal té persona responsable. Podeu veure'n totes les dades, però no modificar-les.
        </p>
      )}
      {casalActual ? (
        <div className="gestio__amb-menu">
          <MenuCasal casalId={casalActual.id} permisos={casalActual.permisos} />
          <div className="gestio__contingut"><Outlet context={context} /></div>
        </div>
      ) : <Outlet context={context} />}
    </div>
  );
}
