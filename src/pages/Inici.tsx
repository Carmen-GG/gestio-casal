import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { MissatgeError } from "../components/EstatsConsulta";
import { CampText } from "../components/Formulari";
import { ErrorClientApi } from "../services/api";
import { serveiAuth } from "../services/gestio";

/**
 * Pàgina principal (petició de 2026-10-15): només dues entrades.
 * 1. Superadministració: només la contrasenya de superadministració.
 * 2. Administració: correu i contrasenya, o el codi de primer accés la primera vegada.
 *    No es tria casal: cada persona entra al casal que li ha assignat la superadministració.
 */
export function Inici() {
  return (
    <section aria-labelledby="titol-inici">
      <h1 id="titol-inici">Casals Cívics i Comunitaris</h1>
      <ul className="entrades-inici">
        <Entrada titol="Superadministració" id="entrada-superadministracio"
          text="Des de dins: assignar la persona responsable de cada casal, entrar a qualsevol casal i el quadre de comandament amb les dades de tots els casals i cicles.">
          <EntradaSuperadministracio />
        </Entrada>
        <Entrada titol="Administració" id="entrada-administracio"
          text="Per a la persona responsable i l'equip de cada casal. Des de dins: cicles i activitats, inscripcions i sorteig, assistència, comunicacions, cartells i l'equip del casal.">
          <EntradaAdministracio />
        </Entrada>
      </ul>
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

const errorApi = (e: unknown, text: string) => (e instanceof ErrorClientApi ? e : new ErrorClientApi(0, "error", text));

function EntradaSuperadministracio() {
  const navegar = useNavigate();
  const [contrasenya, setContrasenya] = useState("");
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);

  async function envia(e: FormEvent) {
    e.preventDefault();
    if (!contrasenya) return;
    setEnviant(true);
    setError(null);
    try {
      await serveiAuth.entrarSuperadministracio(contrasenya);
      navegar("/gestio");
    } catch (err) {
      setError(errorApi(err, "No s'ha pogut entrar."));
      setEnviant(false);
    }
  }

  return (
    <form onSubmit={(e) => void envia(e)} noValidate className="formulari entrada-inici__formulari" aria-label="Accés a la superadministració">
      {error && <MissatgeError error={error} />}
      <CampText etiqueta="Contrasenya de superadministració" type="password" obligatori autoComplete="current-password"
        value={contrasenya} onChange={(e) => setContrasenya(e.target.value)} />
      <button type="submit" className="boto" disabled={enviant || !contrasenya}>{enviant ? "Comprovant…" : "Entra"}</button>
    </form>
  );
}

function EntradaAdministracio() {
  const navegar = useNavigate();
  const [primer, setPrimer] = useState(false);
  const [v, setV] = useState({ email: "", contrasenya: "", codi: "", nova: "", repeticio: "" });
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [errorLocal, setErrorLocal] = useState("");
  const canvia = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function envia(e: FormEvent) {
    e.preventDefault();
    setErrorLocal("");
    setError(null);
    if (primer) {
      if (v.nova.length < 12) { setErrorLocal("La contrasenya ha de tenir almenys 12 caràcters."); return; }
      if (v.nova !== v.repeticio) { setErrorLocal("Les dues contrasenyes no coincideixen."); return; }
    }
    setEnviant(true);
    try {
      if (primer) await serveiAuth.primerAcces({ email: v.email.trim(), codi: v.codi.trim(), contrasenya: v.nova });
      else await serveiAuth.entrarAmbContrasenya(v.email.trim(), v.contrasenya);
      navegar("/gestio");
    } catch (err) {
      setError(errorApi(err, "No s'ha pogut entrar."));
      setEnviant(false);
    }
  }

  const complet = v.email.trim() && (primer ? v.codi.trim() && v.nova && v.repeticio : v.contrasenya);
  return (
    <form onSubmit={(e) => void envia(e)} noValidate className="formulari entrada-inici__formulari" aria-label="Accés a l'administració">
      {error && <MissatgeError error={error} />}
      {errorLocal && <p className="avis avis--error" role="alert">{errorLocal}</p>}
      <CampText etiqueta="Correu electrònic" type="email" obligatori autoComplete="username" value={v.email} onChange={canvia("email")} />
      <label className="casella">
        <input type="checkbox" checked={primer} onChange={(e) => { setPrimer(e.target.checked); setError(null); setErrorLocal(""); }} />
        {" "}És la primera vegada (o he oblidat la contrasenya) i tinc un codi
      </label>
      {primer ? (
        <>
          <CampText etiqueta="Codi de primer accés" obligatori autoComplete="one-time-code" value={v.codi} onChange={canvia("codi")}
            ajuda="El que us ha donat la superadministració o la persona responsable del casal. P. ex. ABCD-EFGH-JKLM." />
          <CampText etiqueta="Nova contrasenya" type="password" obligatori autoComplete="new-password" value={v.nova} onChange={canvia("nova")}
            ajuda="Almenys 12 caràcters. Una frase que recordeu és una bona contrasenya." />
          <CampText etiqueta="Repetiu la contrasenya" type="password" obligatori autoComplete="new-password" value={v.repeticio} onChange={canvia("repeticio")} />
        </>
      ) : (
        <CampText etiqueta="Contrasenya" type="password" obligatori autoComplete="current-password" value={v.contrasenya} onChange={canvia("contrasenya")} />
      )}
      <button type="submit" className="boto" disabled={enviant || !complet}>
        {enviant ? "Comprovant…" : primer ? "Crea la contrasenya i entra" : "Entra"}
      </button>
    </form>
  );
}
