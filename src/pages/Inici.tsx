import { Link } from "react-router";

const CASAL_PER_DEFECTE = import.meta.env.VITE_CASAL_PER_DEFECTE || "CAN-BOADA";

export function Inici() {
  return (
    <section aria-labelledby="titol-inici">
      <h1 id="titol-inici">Inscripcions a les activitats</h1>
      <p>Consulteu els cicles d'activitats amb inscripcions i les activitats que s'hi ofereixen.</p>
      <p>
        <Link className="boto" to={`/inscripcio/${CASAL_PER_DEFECTE}`}>
          Veure els cicles d'activitats
        </Link>
      </p>
    </section>
  );
}
