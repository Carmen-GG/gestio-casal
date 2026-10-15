import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Carregant, MissatgeError } from "../components/EstatsConsulta";
import { useConsulta } from "../hooks/useConsulta";
import { serveiPublic } from "../services/public";

type Casal = { codi: string; nom: string };

/**
 * Pàgina principal (petició de 2026-10-15): tres entrades.
 * 1. Superadministració (correu i contrasenya).
 * 2. Administració d'un casal (es tria al desplegable i s'entra amb correu i contrasenya).
 * 3. Formulari d'inscripció públic d'un casal, el que genera la gestió de cada casal.
 */
export function Inici() {
  const navegar = useNavigate();
  const consulta = useConsulta((s) => serveiPublic.casals(s), []);

  return (
    <section aria-labelledby="titol-inici">
      <h1 id="titol-inici">Casals Cívics i Comunitaris</h1>
      {consulta.tipus === "carregant" && <Carregant text="Carregant els casals…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (
        <ul className="entrades-inici">
          <Entrada titol="Superadministració" id="entrada-superadministracio"
            text="Gestió de les persones responsables de cada casal i quadre de comandament de tots els casals.">
            <Link className="boto" to="/gestio/entrar?ambit=superadministracio&tornar=%2Fgestio">Entra a la superadministració</Link>
          </Entrada>
          <Entrada titol="Administració del casal" id="entrada-casal"
            text="Per a l'equip de cada casal: cicles, activitats, inscripcions, sorteig, assistència i comunicacions.">
            <TriaCasal id="casal-administracio" casals={consulta.dades.casals} boto="Entra a l'administració"
              onTria={(codi) => navegar(`/gestio/casal/${encodeURIComponent(codi)}`)} />
          </Entrada>
          <Entrada titol="Formulari d'inscripció" id="entrada-formulari"
            text="Per a les persones que es volen inscriure: cicles oberts i activitats de cada casal.">
            <TriaCasal id="casal-formulari" casals={consulta.dades.casals} boto="Obre el formulari del casal"
              onTria={(codi) => navegar(`/inscripcio/${encodeURIComponent(codi)}`)} />
          </Entrada>
        </ul>
      )}
    </section>
  );
}

function Entrada({ titol, id, text, children }: { titol: string; id: string; text: string; children: ReactNode }) {
  return (
    <li className="entrada-inici" aria-labelledby={id}>
      <h2 id={id}>{titol}</h2>
      <p className="text-secundari">{text}</p>
      {children}
    </li>
  );
}

function TriaCasal({ id, casals, boto, onTria }: { id: string; casals: Casal[]; boto: string; onTria: (codi: string) => void }) {
  const [codi, setCodi] = useState("");
  const envia = (e: FormEvent) => {
    e.preventDefault();
    if (codi) onTria(codi);
  };
  return (
    <form onSubmit={envia} className="formulari tria-casal">
      <div className="camp">
        <label htmlFor={id}>Casal</label>
        <select id={id} value={codi} onChange={(e) => setCodi(e.target.value)} required>
          <option value="">Trieu un casal…</option>
          {casals.map((c) => <option key={c.codi} value={c.codi}>{c.nom}</option>)}
        </select>
      </div>
      <button type="submit" className="boto" disabled={!codi}>{boto}</button>
    </form>
  );
}
