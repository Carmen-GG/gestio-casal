import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { casalCrear } from "../../../shared/schemas/gestio";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { MissatgeError } from "../../components/EstatsConsulta";
import { CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import { useGestio } from "./context";
import { AdministracioInici } from "./Administracio";

export function GestioInici() {
  const { jo } = useGestio();
  if (jo.superadministracio) return <AdministracioInici />;
  // Amb un sol casal s'hi entra directament, excepte qui pot crear-ne (ha de poder afegir el segon).
  if (jo.casals.length === 1 && !jo.pot_crear_casals) return <Navigate to={`/gestio/${jo.casals[0]!.id}`} replace />;
  return (
    <section aria-labelledby="titol-casals">
      <h1 id="titol-casals">Casals</h1>
      {jo.casals.length === 0 ? (
        <p>{jo.pot_crear_casals ? "Encara no hi ha cap casal. Creeu-ne el primer a la secció següent." : "No teniu cap casal assignat. Demaneu accés a l'administració."}</p>
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
      {jo.pot_crear_casals && (
        <Seccio titol="Nou casal" obertaInicial={jo.casals.length === 0}>
          <NouCasal />
        </Seccio>
      )}
    </section>
  );
}

type Valors = Record<"codi" | "nom" | "municipi" | "adreca", string>;
const buit: Valors = { codi: "", nom: "", municipi: "", adreca: "" };

/** Alta d'un casal (només administració central). El servidor torna a validar i comprova el permís. */
export function NouCasal() {
  const { recarregarJo } = useGestio();
  const navega = useNavigate();
  const [v, setV] = useState<Valors>(buit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [desant, setDesant] = useState(false);
  const canvia = (k: keyof Valors) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function envia(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    const dades = { codi: v.codi, nom: v.nom, municipi: v.municipi, ...(v.adreca.trim() ? { adreca: v.adreca } : {}) };
    const r = casalCrear.safeParse(dades);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    setDesant(true);
    try {
      const { casal } = await serveiGestio.crearCasal(r.data);
      recarregarJo();
      navega(`/gestio/${casal.id}`);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setErrorServidor(err); setErrors(err.errorsCamps); }
      else throw err;
    } finally {
      setDesant(false);
    }
  }

  return (
    <form onSubmit={envia} noValidate className="formulari">
      {errorServidor && <MissatgeError error={errorServidor} />}
      <div className="graella-camps">
        <CampText etiqueta="Nom" obligatori value={v.nom} onChange={canvia("nom")} error={errors.nom} maxLength={200}
          ajuda="P. ex. «Casal Cívic i Comunitari Terrassa – Can Boada». Surt als cartells i al formulari públic." />
        <CampText etiqueta="Codi" obligatori value={v.codi} onChange={canvia("codi")} error={errors.codi} maxLength={40}
          ajuda="Curt i sense espais, p. ex. CAN-BOADA. Forma part de l'adreça del formulari públic i no es pot canviar." />
        <CampText etiqueta="Municipi" obligatori value={v.municipi} onChange={canvia("municipi")} error={errors.municipi} maxLength={100} />
        <CampText etiqueta="Adreça" value={v.adreca} onChange={canvia("adreca")} error={errors.adreca} maxLength={250} />
      </div>
      <div className="botonera">
        <button type="submit" className="boto" disabled={desant}>{desant ? "Creant…" : "Crea el casal"}</button>
      </div>
    </form>
  );
}
