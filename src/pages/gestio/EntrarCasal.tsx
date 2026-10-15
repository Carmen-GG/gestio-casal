import { Link, Navigate, useParams } from "react-router";
import { useGestio } from "./context";

/** Enllaç d'entrada a l'administració d'un casal per codi (des de la pàgina principal). */
export function EntrarCasal() {
  const { codi = "" } = useParams();
  const { jo } = useGestio();
  const casal = jo.casals.find((c) => c.codi === codi);
  if (casal) return <Navigate to={`/gestio/${casal.id}`} replace />;
  return (
    <section className="estret" aria-labelledby="titol-sense-acces">
      <h1 id="titol-sense-acces">Sense accés a aquest casal</h1>
      <p className="avis avis--alerta">
        El vostre compte ({jo.usuari.email}) no té accés a l'administració d'aquest casal. Si n'hauríeu de tenir,
        demaneu-ho a la persona responsable del casal o a la superadministració.
      </p>
      <p><Link to="/gestio">Anar al panell</Link> · <Link to="/">Tornar a la pàgina principal</Link></p>
    </section>
  );
}
