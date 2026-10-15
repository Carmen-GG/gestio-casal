import { useState, type FormEvent } from "react";
import { MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampText } from "../../components/Formulari";
import { ErrorClientApi } from "../../services/api";
import { serveiAuth } from "../../services/gestio";
import { useGestio } from "./context";

const MINIM = 12;

/** El meu compte: fixar o canviar la contrasenya del panell. El servidor torna a validar-ho tot. */
export function Compte() {
  const { jo, recarregarJo } = useGestio();
  const [actual, setActual] = useState("");
  const [nova, setNova] = useState("");
  const [repeticio, setRepeticio] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [desant, setDesant] = useState(false);

  async function envia(e: FormEvent) {
    e.preventDefault();
    setExit("");
    setErrorServidor(null);
    const nous: Record<string, string> = {};
    if (jo.te_contrasenya && !actual) nous.actual = "Escriviu la contrasenya actual.";
    if (nova.length < MINIM) nous.nova = `La contrasenya ha de tenir almenys ${MINIM} caràcters.`;
    else if (nova.trim() !== nova) nous.nova = "La contrasenya no pot començar ni acabar amb espais.";
    if (repeticio !== nova) nous.repeticio = "Les dues contrasenyes no coincideixen.";
    setErrors(nous);
    if (Object.keys(nous).length) return;
    setDesant(true);
    try {
      await serveiAuth.canviarContrasenya(jo.te_contrasenya ? { actual, nova } : { nova });
      setActual(""); setNova(""); setRepeticio("");
      setExit("S'ha desat la contrasenya. A partir d'ara podeu entrar amb el vostre correu i aquesta contrasenya.");
      recarregarJo();
    } catch (err) {
      if (err instanceof ErrorClientApi) { setErrorServidor(err); setErrors(err.errorsCamps); }
      else throw err;
    } finally {
      setDesant(false);
    }
  }

  return (
    <section aria-labelledby="titol-compte" className="estret">
      <h1 id="titol-compte">El meu compte</h1>
      <p>{jo.usuari.nom_visible} · {jo.usuari.email}</p>
      <h2>{jo.te_contrasenya ? "Canviar la contrasenya" : "Fixar una contrasenya"}</h2>
      <p className="text-secundari">
        Amb la contrasenya entrareu al panell amb el vostre correu, sense codis d'accés. No caduca. La sessió es tanca
        sola després de 60 minuts sense activitat.
      </p>
      {exit && <AvisExit>{exit}</AvisExit>}
      {errorServidor && <MissatgeError error={errorServidor} />}
      <form onSubmit={envia} noValidate className="formulari">
        {/* Camp ocult perquè el gestor de contrasenyes del navegador associï la contrasenya al correu. */}
        <input type="email" name="username" autoComplete="username" value={jo.usuari.email} readOnly hidden />
        {jo.te_contrasenya && (
          <CampText etiqueta="Contrasenya actual" type="password" obligatori autoComplete="current-password"
            value={actual} onChange={(e) => setActual(e.target.value)} error={errors.actual} />
        )}
        <CampText etiqueta="Contrasenya nova" type="password" obligatori autoComplete="new-password" value={nova}
          onChange={(e) => setNova(e.target.value)} error={errors.nova} ajuda={`Almenys ${MINIM} caràcters. Una frase de diverses paraules és fàcil de recordar i segura.`} />
        <CampText etiqueta="Repetiu la contrasenya nova" type="password" obligatori autoComplete="new-password" value={repeticio}
          onChange={(e) => setRepeticio(e.target.value)} error={errors.repeticio} />
        <div className="botonera">
          <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : "Desa la contrasenya"}</button>
        </div>
      </form>
    </section>
  );
}
