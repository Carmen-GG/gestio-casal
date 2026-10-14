import { Link, Navigate } from "react-router";
import { useGestio } from "./context";

export function GestioInici() {
  const { jo } = useGestio();
  if (jo.casals.length === 1) return <Navigate to={`/gestio/${jo.casals[0]!.id}`} replace />;
  return (
    <section aria-labelledby="titol-casals">
      <h1 id="titol-casals">Casals</h1>
      {jo.casals.length === 0 ? (
        <p>No teniu cap casal assignat. Demaneu accés a l'administració.</p>
      ) : (
        <ul className="llista-targetes">
          {jo.casals.map((c) => (
            <li key={c.id} className="targeta">
              <h2><Link to={`/gestio/${c.id}`}>{c.nom}</Link></h2>
              <p className="text-secundari">Codi: {c.codi}{c.actiu ? "" : " · inactiu"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
