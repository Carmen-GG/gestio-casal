import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ActivitatPublica, CasalPublic, CiclePublic, FormulariPublic, RespostaSollicitudRegistrada,
} from "../../shared/api/public";
import { ETIQUETES_CAMPS, esMenorEnData, type CampPersonal } from "../../shared/domain/formulari";
import {
  activitatsAmbPreferenciaDuplicada, MAX_ACTIVITATS_FORMULARI, missatgeErrorPreferencies, validaPreferencies, type Preferencia,
} from "../../shared/domain/preferencies";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { autoritzacioTutor, dadesPersonalsSollicitud } from "../../shared/schemas/public";
import { MissatgeError } from "../components/EstatsConsulta";
import { CampText } from "../components/Formulari";
import { Signatura } from "../components/Signatura";
import { ErrorClientApi } from "../services/api";
import { serveiPublic } from "../services/public";
import { formataData, formataDataHora, formataHorari } from "../utils/format";

/** Atributs de cada camp perquè el navegador ajudi a omplir-lo correctament. */
const ATRIBUTS: Partial<Record<CampPersonal, { type?: string; autoComplete?: string; inputMode?: "numeric" | "tel" | "email" }>> = {
  nom: { autoComplete: "given-name" },
  cognom1: { autoComplete: "family-name" },
  cognom2: { autoComplete: "off" },
  data_naixement: { type: "date", autoComplete: "bday" },
  document_identitat: { autoComplete: "off" },
  telefon: { type: "tel", autoComplete: "tel", inputMode: "tel" },
  email: { type: "email", autoComplete: "email", inputMode: "email" },
  adreca: { autoComplete: "street-address" },
  codi_postal: { autoComplete: "postal-code", inputMode: "numeric" },
  municipi: { autoComplete: "address-level2" },
};

const novaClau = () => crypto.randomUUID();

/** Data d'avui al casal (AAAA-MM-DD), la mateixa que fa servir el servidor. */
const avuiMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

interface DadesTutor { nom: string; cognoms: string; document_identitat: string; autoritza: boolean; signatura: string | null }
const TUTOR_BUIT: DadesTutor = { nom: "", cognoms: "", document_identitat: "", autoritza: false, signatura: null };

/** Avisos de la tria d'activitats que es mostren mentre la persona les marca. */
function avisosPreferencies(seleccio: Preferencia[], activitats: ActivitatPublica[]): string[] {
  const nom = (id: string) => activitats.find((a) => a.id === id)?.nom ?? "";
  const avisos: string[] = [];
  if (seleccio.length > MAX_ACTIVITATS_FORMULARI) {
    avisos.push(`Heu triat ${seleccio.length} activitats i el màxim és ${MAX_ACTIVITATS_FORMULARI}. Desmarqueu-ne ${seleccio.length - MAX_ACTIVITATS_FORMULARI}.`);
  }
  const duplicades = activitatsAmbPreferenciaDuplicada(seleccio);
  if (duplicades.ordres.length) {
    avisos.push(`Hi ha prioritats repetides (${duplicades.ordres.join(", ")}): ${duplicades.activitats.map(nom).join(", ")}. Cada activitat ha de tenir una prioritat diferent.`);
  }
  const senseOrdre = seleccio.filter((p) => p.ordre == null).map((p) => nom(p.activitat_id));
  if (senseOrdre.length) avisos.push(`Falta posar la prioritat a: ${senseOrdre.join(", ")}.`);
  return avisos;
}

/**
 * Formulari públic d'inscripció d'un cicle. Ajuda a omplir-lo bé (validació
 * immediata amb les mateixes regles que el servidor), però només mostra la
 * confirmació quan el servidor ha desat la sol·licitud.
 */
export function FormulariInscripcio({ casal, cicle, activitats, formulari }: {
  casal: CasalPublic; cicle: CiclePublic; activitats: ActivitatPublica[]; formulari: FormulariPublic;
}) {
  const [dades, setDades] = useState<Partial<Record<CampPersonal, string>>>({});
  const [seleccio, setSeleccio] = useState<Preferencia[]>([]);
  const [acceptacio, setAcceptacio] = useState(false);
  const [tutor, setTutor] = useState<DadesTutor>(TUTOR_BUIT);
  const [parany, setParany] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [enviant, setEnviant] = useState(false);
  const [resultat, setResultat] = useState<RespostaSollicitudRegistrada | null>(null);
  // La clau d'enviament es conserva entre reintents perquè un reenviament no dupliqui la sol·licitud.
  const clau = useRef(novaClau());
  const refConfirmacio = useRef<HTMLDivElement>(null);
  const refActivitats = useRef<HTMLFieldSetElement>(null);

  const modificat = !resultat && (Object.values(dades).some(Boolean) || seleccio.length > 0);

  // Avisa abans de sortir de la pàgina si hi ha dades sense enviar.
  useEffect(() => {
    if (!modificat) return;
    const avisa = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisa);
    return () => window.removeEventListener("beforeunload", avisa);
  }, [modificat]);

  useEffect(() => {
    if (resultat) refConfirmacio.current?.focus();
  }, [resultat]);

  const duplicades = activitatsAmbPreferenciaDuplicada(seleccio);
  const avisos = avisosPreferencies(seleccio, activitats);
  const errorPreferencies = errors.preferencies;
  const naixement = dades.data_naixement ?? "";
  const menor = /^\d{4}-\d{2}-\d{2}$/.test(naixement) && naixement <= avuiMadrid() && esMenorEnData(naixement, avuiMadrid());

  function marcaActivitat(id: string, marcada: boolean) {
    setSeleccio((s) => {
      // La prioritat la tria la persona: una activitat nova arriba sense número.
      if (marcada) return [...s, { activitat_id: id, ordre: null }];
      // En treure una activitat, les prioritats posteriors pugen una posició (1, 2, 3... sense salts).
      const treta = s.find((p) => p.activitat_id === id)?.ordre ?? null;
      return s.filter((p) => p.activitat_id !== id)
        .map((p) => (treta != null && p.ordre != null && p.ordre > treta ? { ...p, ordre: p.ordre - 1 } : p));
    });
    setErrors(({ preferencies: _, ...resta }) => resta);
  }

  function canviaTutor<K extends keyof DadesTutor>(camp: K, valor: DadesTutor[K]) {
    setTutor((t) => ({ ...t, [camp]: valor }));
    setErrors(({ tutor: _t, [`tutor.${camp}`]: _c, ...resta }) => resta);
  }

  function canviaOrdre(id: string, ordre: number | null) {
    setSeleccio((s) => s.map((p) => (p.activitat_id === id ? { ...p, ordre } : p)));
    setErrors(({ preferencies: _, ...resta }) => resta);
  }

  function canviaCamp(camp: CampPersonal, valor: string) {
    setDades((d) => ({ ...d, [camp]: valor }));
    setErrors(({ [`dades.${camp}`]: _, ...resta }) => resta);
  }

  /** Mateixes comprovacions que el servidor, per avisar abans d'enviar. */
  function errorsLocals(): Record<string, string> {
    const e: Record<string, string> = {};
    const cosDades = Object.fromEntries(formulari.camps.map(({ camp }) => [camp, dades[camp] ?? ""]));
    const r = dadesPersonalsSollicitud.safeParse(cosDades);
    if (!r.success) for (const [k, v] of Object.entries(errorsPerCamp(r.error))) e[`dades.${k}`] = v;
    for (const { camp, obligatori } of formulari.camps) {
      if (obligatori && !(dades[camp] ?? "").trim()) e[`dades.${camp}`] = "Aquest camp és obligatori.";
    }
    const ep = validaPreferencies(seleccio, MAX_ACTIVITATS_FORMULARI);
    if (ep) e.preferencies = missatgeErrorPreferencies(ep);
    if (menor) {
      const t = autoritzacioTutor.safeParse({ ...tutor, signatura: tutor.signatura ?? "" });
      if (!t.success) {
        for (const [k, v] of Object.entries(errorsPerCamp(t.error))) {
          e[`tutor.${k}`] = k === "signatura" ? "Cal signar dins del requadre." : k === "autoritza" ? "Cal marcar la casella d'autorització." : v;
        }
      }
    }
    if (!acceptacio) e.acceptacio_privacitat = "Cal llegir i acceptar la informació sobre protecció de dades.";
    return e;
  }

  /** Porta la vista al primer error: primer les dades, després les activitats. */
  function enfocaPrimerError(e: Record<string, string>) {
    requestAnimationFrame(() => {
      const primerCamp = formulari.camps.find(({ camp }) => e[`dades.${camp}`]);
      if (primerCamp) {
        const input = document.querySelector<HTMLInputElement>(`[name="${primerCamp.camp}"]`);
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus({ preventScroll: true });
        return;
      }
      const primerTutor = ["nom", "cognoms", "document_identitat", "autoritza", "signatura"].find((k) => e[`tutor.${k}`]) ?? (e.tutor ? "nom" : null);
      if (primerTutor) {
        const el = document.getElementById(`tutor-${primerTutor}`) ?? document.querySelector<HTMLElement>(`[name="tutor-${primerTutor}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
        return;
      }
      if (e.preferencies) {
        const afectada = refActivitats.current?.querySelector<HTMLElement>(".targeta--error") ?? refActivitats.current;
        afectada?.scrollIntoView({ behavior: "smooth", block: "center" });
        afectada?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
        return;
      }
      document.getElementById("acceptacio-privacitat")?.focus();
    });
  }

  async function envia(ev: FormEvent) {
    ev.preventDefault();
    if (enviant) return;
    setErrorServidor(null);
    const locals = errorsLocals();
    setErrors(locals);
    if (Object.keys(locals).length) {
      enfocaPrimerError(locals);
      return;
    }
    setEnviant(true);
    try {
      const cos = {
        dades: Object.fromEntries(formulari.camps.map(({ camp }) => [camp, (dades[camp] ?? "").trim()])),
        preferencies: [...seleccio].sort((a, b) => a.ordre! - b.ordre!),
        acceptacio_privacitat: true,
        ...(menor ? { tutor: { ...tutor, nom: tutor.nom.trim(), cognoms: tutor.cognoms.trim(), document_identitat: tutor.document_identitat.trim() } } : {}),
        ...(parany ? { web: parany } : {}),
      };
      const r = await serveiPublic.enviarSollicitud(casal.codi, cicle.id, cos, clau.current);
      setResultat(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (!(e instanceof ErrorClientApi)) throw e;
      setErrorServidor(e);
      setErrors(e.errorsCamps);
      if (Object.keys(e.errorsCamps).length) enfocaPrimerError(e.errorsCamps);
    } finally {
      setEnviant(false);
    }
  }

  function novaSollicitud() {
    clau.current = novaClau();
    setDades({});
    setSeleccio([]);
    setAcceptacio(false);
    setTutor(TUTOR_BUIT);
    setErrors({});
    setErrorServidor(null);
    setResultat(null);
    window.scrollTo({ top: 0 });
  }

  if (resultat) {
    return (
      <div>
        <div className="confirmacio" role="status" tabIndex={-1} ref={refConfirmacio}>
          <p className="confirmacio__titol">✓ SOL·LICITUD ENVIADA CORRECTAMENT</p>
          <p>Hem rebut la teva sol·licitud d'inscripció.</p>
          <p><strong>Aquesta sol·licitud NO garanteix plaça.</strong></p>
          <p>La data prevista de comunicació de la resolució és: <strong>{formataData(resultat.data_resolucio_prevista)}</strong></p>
        </div>
        <dl className="dades resum-confirmacio">
          <div><dt>Codi de confirmació</dt><dd className="codi">{resultat.codi_confirmacio}</dd></div>
          <div><dt>Rebuda el</dt><dd>{formataDataHora(resultat.rebuda_el)}</dd></div>
          <div><dt>Cicle</dt><dd>{resultat.cicle}</dd></div>
        </dl>
        <h2>Activitats sol·licitades, per ordre de preferència</h2>
        <ol>{resultat.preferencies.map((p) => <li key={p.ordre}>{p.activitat}</li>)}</ol>
        <p className="text-secundari">Guardeu el codi de confirmació. Si heu de fer cap consulta, adreceu-vos al casal amb aquest codi.</p>
        <div className="botonera no-imprimir">
          <button type="button" className="boto boto--secundari" onClick={() => window.print()}>Imprimeix el justificant</button>
          <button type="button" className="boto boto--secundari" onClick={novaSollicitud}>Fes una altra sol·licitud</button>
        </div>
      </div>
    );
  }

  const errorConnexio = errorServidor && (errorServidor.codi === "sense_connexio" || errorServidor.codi === "temps_esgotat");

  return (
    <form onSubmit={envia} noValidate className="formulari" aria-describedby="nota-obligatoris">
      <h2>Sol·licitud d'inscripció</h2>
      <p id="nota-obligatoris" className="text-secundari">
        Inscripcions obertes fins al {formataDataHora(cicle.tancament_inscripcions)}. Els camps marcats com a obligatoris s'han d'omplir.
      </p>

      <div aria-live="assertive">
        {errorServidor && (errorConnexio ? (
          <div className="avis avis--error" role="alert">
            <p>{errorServidor.missatgeUsuari}</p>
            <p>No hem pogut confirmar que la sol·licitud s'hagi rebut. Torneu a prémer «Envia la sol·licitud»: si ja s'havia rebut, no es duplicarà.</p>
          </div>
        ) : <MissatgeError error={errorServidor} />)}
      </div>

      <fieldset className="grup">
        <legend>Dades de la persona participant</legend>
        <div className="graella-camps">
          {formulari.camps.map(({ camp, obligatori }) => (
            <CampText key={camp} name={camp} etiqueta={ETIQUETES_CAMPS[camp]} obligatori={obligatori}
              value={dades[camp] ?? ""} onChange={(e) => canviaCamp(camp, e.target.value)} error={errors[`dades.${camp}`]}
              {...ATRIBUTS[camp]} />
          ))}
        </div>
      </fieldset>

      {menor && (
        <fieldset className="grup">
          <legend>Autorització del pare, mare o tutor legal</legend>
          <p className="text-secundari">La persona participant és menor d'edat. Cal que el pare, la mare o el tutor legal l'autoritzi.</p>
          {errors.tutor && <p className="avis avis--error" role="alert">{errors.tutor}</p>}
          <div className="graella-camps">
            <CampText name="tutor-nom" etiqueta="Nom del pare, mare o tutor" obligatori autoComplete="off" maxLength={80}
              value={tutor.nom} onChange={(e) => canviaTutor("nom", e.target.value)} error={errors["tutor.nom"]} />
            <CampText name="tutor-cognoms" etiqueta="Cognoms del pare, mare o tutor" obligatori autoComplete="off" maxLength={160}
              value={tutor.cognoms} onChange={(e) => canviaTutor("cognoms", e.target.value)} error={errors["tutor.cognoms"]} />
            <CampText name="tutor-document_identitat" etiqueta="DNI/NIE del pare, mare o tutor" obligatori autoComplete="off"
              maxLength={12} value={tutor.document_identitat} onChange={(e) => canviaTutor("document_identitat", e.target.value)}
              error={errors["tutor.document_identitat"]} />
          </div>
          <div className={`camp ${errors["tutor.autoritza"] ? "camp--error" : ""}`}>
            <label className="casella">
              <input id="tutor-autoritza" type="checkbox" checked={tutor.autoritza} aria-invalid={!!errors["tutor.autoritza"]}
                onChange={(e) => canviaTutor("autoritza", e.target.checked)} />
              <span>
                Autoritzo {[dades.nom, dades.cognom1].filter(Boolean).join(" ") || "la persona menor"} a inscriure's a les activitats triades.{" "}
                <span className="camp__obligatori">(obligatori)</span>
              </span>
            </label>
            {errors["tutor.autoritza"] && <p className="camp__missatge" role="alert">{errors["tutor.autoritza"]}</p>}
          </div>
          <Signatura id="tutor-signatura" etiqueta="Signatura del pare, mare o tutor" error={errors["tutor.signatura"]}
            onChange={(png) => canviaTutor("signatura", png)} />
        </fieldset>
      )}

      <fieldset className="grup" ref={refActivitats} aria-describedby={errorPreferencies ? "error-preferencies" : "ajuda-preferencies"}>
        <legend>Activitats i ordre de preferència</legend>
        <p id="ajuda-preferencies" className="text-secundari">
          Marqueu fins a {MAX_ACTIVITATS_FORMULARI} activitats i poseu a cadascuna la seva prioritat: 1 per a la que més us interessa, 2 per a la següent, i així successivament.
        </p>
        {errorPreferencies && <p id="error-preferencies" className="avis avis--error" role="alert">{errorPreferencies}</p>}
        {!errorPreferencies && avisos.length > 0 && (
          <div className="avis avis--alerta" role="status">
            {avisos.map((a) => <p key={a}>{a}</p>)}
          </div>
        )}
        {seleccio.length > 0 && avisos.length === 0 && (
          <p className="text-secundari" role="status">Activitats triades: {seleccio.length} de {MAX_ACTIVITATS_FORMULARI} com a màxim.</p>
        )}
        <ul className="llista-targetes">
          {activitats.map((a) => {
            const pref = seleccio.find((p) => p.activitat_id === a.id);
            const duplicada = duplicades.activitats.includes(a.id);
            const senseOrdre = !!pref && pref.ordre == null;
            const idSelect = `ordre-${a.id}`;
            return (
              <li key={a.id} className={`targeta targeta--activitat ${pref ? "targeta--triada" : ""} ${duplicada || senseOrdre ? "targeta--error" : ""}`}>
                <label className="targeta__marca">
                  <input type="checkbox" checked={!!pref} onChange={(e) => marcaActivitat(a.id, e.target.checked)} />
                  <span><strong>{a.nom}</strong></span>
                </label>
                {a.categoria && <p className="etiqueta">{a.categoria}</p>}
                <p>{formataHorari(a)}</p>
                {a.data_inici && a.data_fi && <p className="text-secundari">Del {formataData(a.data_inici)} al {formataData(a.data_fi)}</p>}
                {a.espai && <p className="text-secundari">Espai: {a.espai}</p>}
                {a.destinataris && <p className="text-secundari">Adreçada a: {a.destinataris}</p>}
                {a.descripcio && <p>{a.descripcio}</p>}
                {pref && (
                  <div className="camp camp--compacte">
                    <label htmlFor={idSelect}>Prioritat</label>
                    <select id={idSelect} value={pref.ordre ?? ""} aria-invalid={duplicada || senseOrdre}
                      onChange={(e) => canviaOrdre(a.id, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Tria</option>
                      {Array.from({ length: Math.min(seleccio.length, MAX_ACTIVITATS_FORMULARI) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                    {duplicada && <p className="camp__missatge">Aquesta prioritat està repetida.</p>}
                    {senseOrdre && <p className="camp__missatge">Falta posar-hi la prioritat.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Camp parany per a robots: no és visible ni accessible per a les persones. */}
      <div className="parany" aria-hidden="true">
        <label htmlFor="web">No ompliu aquest camp</label>
        <input id="web" name="web" tabIndex={-1} autoComplete="off" value={parany} onChange={(e) => setParany(e.target.value)} />
      </div>

      <fieldset className="grup">
        <legend>Protecció de dades</legend>
        <div className="text-privacitat" tabIndex={0} role="region" aria-label="Informació sobre protecció de dades">
          {formulari.informacio_privacitat.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className={`camp ${errors.acceptacio_privacitat ? "camp--error" : ""}`}>
          <label className="casella">
            <input id="acceptacio-privacitat" type="checkbox" checked={acceptacio} aria-invalid={!!errors.acceptacio_privacitat}
              aria-describedby={errors.acceptacio_privacitat ? "error-acceptacio" : undefined}
              onChange={(e) => { setAcceptacio(e.target.checked); setErrors(({ acceptacio_privacitat: _, ...r }) => r); }} />
            <span>He llegit i accepto la informació sobre protecció de dades. <span className="camp__obligatori">(obligatori)</span></span>
          </label>
          {errors.acceptacio_privacitat && <p id="error-acceptacio" className="camp__missatge" role="alert">{errors.acceptacio_privacitat}</p>}
        </div>
      </fieldset>

      <div className="botonera">
        <button type="submit" className="boto" disabled={enviant}>
          {enviant ? "Enviant…" : "Envia la sol·licitud"}
        </button>
      </div>
    </form>
  );
}
