import { Link, Outlet } from "react-router";

/** Estructura comuna: enllaç per saltar al contingut, capçalera i peu. */
export function Disseny() {
  return (
    <>
      <a className="salta-contingut" href="#contingut">
        Salta al contingut principal
      </a>
      <header className="capcalera">
        <div className="contenidor capcalera__interior">
          <Link to="/" className="capcalera__marca">
            Casal · Gestió integral
          </Link>
          <Link to="/gestio" className="capcalera__enllac">Panell de gestió</Link>
        </div>
      </header>
      <main id="contingut" className="contenidor" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="peu">
        <div className="contenidor">Casals Cívics i Comunitaris</div>
      </footer>
    </>
  );
}
