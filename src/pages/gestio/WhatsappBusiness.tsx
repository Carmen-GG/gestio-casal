import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { configWhatsapp } from "../../../shared/schemas/whatsapp";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { EstatWhatsapp, IdiomaWhatsapp } from "../../types/gestio";
import { usePermisos } from "./context";

type Valors = { phone_number_id: string; numero_visible: string; idioma: IdiomaWhatsapp; actiu: boolean; ofertes_automatiques: boolean };

/**
 * Configuració de WhatsApp Business del casal (petició de 2026-10-16): número de Meta,
 * activació, oferta automàtica de places i les plantilles que cal donar d'alta a Meta.
 * Els secrets (testimoni d'accés i secret de l'app) no passen mai pel panell: només es
 * mostra si el servidor els té.
 */
export function WhatsappBusiness() {
  const { casalId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.estatWhatsapp(casalId, s), [casalId, versio]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant la configuració de WhatsApp Business…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const e = consulta.dades;
  const webhook = `${window.location.origin}/api/whatsapp/webhook`;
  const totsSecrets = e.secrets.testimoni && e.secrets.secret_app && e.secrets.verificacio;

  return (
    <div className="estret-ample">
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>
      <h1>WhatsApp Business</h1>
      <p className={`avis ${e.disponible ? "avis--exit" : "avis--info"}`} role="status">
        {e.disponible
          ? `Actiu: els missatges surten sols des del número ${e.config?.numero_visible ?? "del casal"}.`
          : "No actiu: les comunicacions es fan de manera semiautomàtica (cada missatge obre WhatsApp amb el text escrit)."}
      </p>

      <Seccio titol="Connexió amb Meta al servidor">
        <ul className="llista-neta llista-estat">
          <li>{e.secrets.testimoni ? "✓" : "✗"} Testimoni d'accés a l'API (WHATSAPP_TOKEN)</li>
          <li>{e.secrets.secret_app ? "✓" : "✗"} Secret de l'app de Meta, per rebre els avisos d'entrega i les respostes (WHATSAPP_APP_SECRET)</li>
          <li>{e.secrets.verificacio ? "✓" : "✗"} Text de verificació del webhook (WHATSAPP_VERIFY_TOKEN)</li>
        </ul>
        {!totsSecrets && (
          <p className="text-secundari">
            Els configura qui administra el servidor, amb <code>wrangler secret put</code> (vegeu <code>docs/whatsapp-business.md</code>).
            No s'han d'escriure mai en aquest panell ni enviar per correu o xat.
          </p>
        )}
        <p>Adreça del webhook per a Meta (camp «messages»): <code className="trencable">{webhook}</code></p>
      </Seccio>

      <Seccio titol="Número del casal">
        <FormConfig casalId={casalId} estat={e} editable={pot("casal.configurar")} onDesat={() => setVersio((v) => v + 1)} />
      </Seccio>

      <Seccio titol={`Plantilles per donar d'alta a Meta (${e.plantilles.length})`} obertaInicial={!e.disponible}>
        <p className="text-secundari">
          A WhatsApp Manager → Plantilles de missatge, creeu cada plantilla amb aquest nom, categoria «Utilitat», idioma
          «{e.plantilles[0]?.idioma === "es" ? "Spanish (es)" : "Catalan (ca)"}» i exactament aquest text. {"{{1}}"}, {"{{2}}"}… són les dades que posa l'aplicació.
          Fins que Meta no les aprovi, els enviaments donaran error.
        </p>
        {e.plantilles.map((p) => (
          <article key={p.nom} className="plantilla-meta">
            <h3>{p.titol} · <code>{p.nom}</code></h3>
            <pre className="plantilla-meta__text">{p.text}</pre>
            <p className="text-secundari">Dades, per ordre: {p.parametres.map((x, i) => `{{${i + 1}}} ${x}`).join(" · ")}</p>
            {p.botons && <p className="text-secundari">Botons de resposta ràpida: {p.botons.map((b) => `«${b}»`).join(" i ")}</p>}
            <details><summary>Exemple tal com el rebrà la persona</summary><pre className="plantilla-meta__text">{p.exemple}</pre></details>
            <button type="button" className="boto boto--secundari boto--petit" onClick={() => void navigator.clipboard?.writeText(p.text)}>Copia el text</button>
          </article>
        ))}
      </Seccio>
    </div>
  );
}

function FormConfig({ casalId, estat, editable, onDesat }: { casalId: string; estat: EstatWhatsapp; editable: boolean; onDesat: () => void }) {
  const inicial = (): Valors => ({
    phone_number_id: estat.config?.phone_number_id ?? "", numero_visible: estat.config?.numero_visible ?? "",
    idioma: estat.config?.idioma ?? "ca", actiu: estat.config?.actiu ?? false, ofertes_automatiques: estat.config?.ofertes_automatiques ?? true,
  });
  const [v, setV] = useState<Valors>(inicial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [desant, setDesant] = useState(false);
  const [comprovacio, setComprovacio] = useState<string>("");
  useEffect(() => { setV(inicial()); }, [estat.config?.actualitzat_el]); // eslint-disable-line react-hooks/exhaustive-deps

  async function desa(ev: FormEvent) {
    ev.preventDefault();
    setExit(""); setErrorServidor(null);
    const dades = { ...v, numero_visible: v.numero_visible.trim() || null };
    const r = configWhatsapp.safeParse(dades);
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    setDesant(true);
    try {
      await serveiGestio.desarWhatsapp(casalId, r.data);
      setExit(v.actiu ? "Desat. WhatsApp Business queda actiu per a aquest casal." : "Desat. WhatsApp Business queda desactivat per a aquest casal.");
      onDesat();
    } catch (err) {
      if (err instanceof ErrorClientApi) { setErrorServidor(err); setErrors(err.errorsCamps); } else throw err;
    } finally {
      setDesant(false);
    }
  }

  async function comprova() {
    setComprovacio("Comprovant…"); setErrorServidor(null);
    try {
      const { numero } = await serveiGestio.comprovarWhatsapp(casalId);
      setComprovacio(`Connexió correcta: ${numero.numero ?? "número"}${numero.nom_verificat ? ` · ${numero.nom_verificat}` : ""}${numero.qualitat ? ` · qualitat ${numero.qualitat}` : ""}.`);
    } catch (err) {
      setComprovacio("");
      if (err instanceof ErrorClientApi) setErrorServidor(err); else throw err;
    }
  }

  return (
    <form onSubmit={(ev) => void desa(ev)} noValidate className="formulari">
      {exit && <AvisExit>{exit}</AvisExit>}
      {errorServidor && <MissatgeError error={errorServidor} />}
      <fieldset disabled={!editable || desant} className="sense-vora">
        <CampText etiqueta="Identificador del número de telèfon (Phone number ID)" obligatori inputMode="numeric" value={v.phone_number_id}
          onChange={(e) => setV({ ...v, phone_number_id: e.target.value })} error={errors.phone_number_id}
          ajuda="Es troba a Meta, a WhatsApp Manager → Números de telèfon, o a l'app de Meta → WhatsApp → Configuració de l'API." />
        <CampText etiqueta="Número que veuen les persones" value={v.numero_visible} placeholder="+34 6XX XX XX XX"
          onChange={(e) => setV({ ...v, numero_visible: e.target.value })} error={errors.numero_visible} />
        <div className="camp">
          <label htmlFor="idioma-wa">Idioma de les plantilles</label>
          <select id="idioma-wa" value={v.idioma} onChange={(e) => setV({ ...v, idioma: e.target.value as IdiomaWhatsapp })}>
            <option value="ca">Català</option>
            <option value="es">Castellà</option>
          </select>
        </div>
        <label className="casella"><input type="checkbox" checked={v.actiu} onChange={(e) => setV({ ...v, actiu: e.target.checked })} /> Actiu: enviar els missatges des d'aquest número</label>
        <label className="casella">
          <input type="checkbox" checked={v.ofertes_automatiques} onChange={(e) => setV({ ...v, ofertes_automatiques: e.target.checked })} />
          Quan algú es dona de baixa, enviar sola l'oferta de plaça a la persona següent de la llista d'espera
        </label>
      </fieldset>
      {editable ? (
        <div className="botonera">
          <button type="submit" className="boto" disabled={desant}>{desant ? "Desant…" : "Desa"}</button>
          {estat.config && <button type="button" className="boto boto--secundari" onClick={() => void comprova()}>Comprova la connexió</button>}
        </div>
      ) : <p className="text-secundari">Només la persona responsable del casal pot canviar aquesta configuració.</p>}
      {comprovacio && <p role="status">{comprovacio}</p>}
    </form>
  );
}
