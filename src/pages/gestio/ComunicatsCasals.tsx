import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { normalitzaText } from "../../../shared/domain/ordenacio";
import { netejaParametre, textPlantilla } from "../../../shared/domain/whatsapp";
import { comunicat as esquemaComunicat, configWhatsappCentral } from "../../../shared/schemas/comunicats";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampAreaText, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type {
  ComunicatCreat, EstatCanalComunicat, EstatComunicats, IdiomaWhatsapp, MotiuComunicat, ProgresEnviament, ResultatComunicat,
} from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

export const MOTIUS_COMUNICAT: Record<MotiuComunicat, string> = {
  telefon_fix: "Només té telèfon fix",
  sense_telefon: "No té telèfon",
  telefon_invalid: "El telèfon no és vàlid",
  sense_whatsapp: "El número no té WhatsApp",
  error_meta: "WhatsApp no l'ha pogut entregar",
  sense_numero: "Sense número de WhatsApp Business per enviar-lo",
  sense_correu: "Sense correu",
  error_correu: "El correu no s'ha pogut entregar",
  duplicat: "Ja l'ha rebut per un altre casal",
};

const ORIGEN_WHATSAPP = { casal: "Número del casal", central: "Número de la superadministració" } as const;
const CONTACTAT = ["enviat", "entregat", "llegit"];

/**
 * Comunicats als casals (petició de 2026-10-16): un avís (tancament, incidència general…)
 * per correu i WhatsApp a les responsables i per WhatsApp a totes les persones usuàries dels
 * casals triats. En acabar, el resultat de cada casal amb les persones que no s'han pogut contactar.
 */
export function ComunicatsCasals() {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.estatComunicats(s), [versio]);
  const [resultatId, setResultatId] = useState<string | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els casals…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const e = consulta.dades;
  const centralActiu = e.serveis.whatsapp && !!e.config_central?.actiu;

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Comunicats als casals</h1>
      <p className="text-secundari">
        Per a avisos com el tancament d'un casal o una incidència general. Les responsables el reben per correu i per WhatsApp, i les persones
        usuàries de cada casal (les de la llista importada de la PGEc) per WhatsApp, des del número del seu casal o, si no en té, des del número
        de la superadministració.
      </p>
      <ul className="llista-neta llista-estat">
        <li>{e.serveis.correu ? "✓ El correu surt sol." : "✗ El servei de correu no està configurat: us prepararem el correu perquè l'envieu des del vostre programa."}</li>
        <li>{centralActiu ? `✓ Número de WhatsApp de la superadministració actiu${e.config_central?.numero_visible ? ` (${e.config_central.numero_visible})` : ""}.` : "✗ El número de WhatsApp de la superadministració no està actiu: les responsables no rebran WhatsApp, ni les persones dels casals sense número propi."}</li>
      </ul>

      <NouComunicat estat={e} onEnviat={(id) => { setResultatId(id); setVersio((v) => v + 1); }} />

      {resultatId && <Resultat id={resultatId} key={resultatId} />}

      {e.comunicats.length > 0 && (
        <Seccio titol={`Comunicats enviats (${e.comunicats.length})`} obertaInicial={false}>
          <ul className="llista-neta llista-enviaments">
            {e.comunicats.map((c) => {
              const r = c.recompte;
              return (
                <li key={c.id}>
                  <strong>{formataDataHora(c.creat_el)}</strong> · {c.assumpte} · {c.casal_ids.length} {c.casal_ids.length === 1 ? "casal" : "casals"}
                  <div className="text-secundari">
                    Enviats {(r.enviat ?? 0) + (r.entregat ?? 0) + (r.llegit ?? 0)}, llegits {r.llegit ?? 0}
                    {(r.no_enviable ?? 0) + (r.fallit ?? 0) ? `, no contactats ${(r.no_enviable ?? 0) + (r.fallit ?? 0)}` : ""}
                    {r.pendent ? `, pendents ${r.pendent}` : ""}
                  </div>
                  <button type="button" className="boto boto--secundari boto--petit" onClick={() => setResultatId(c.id)}>Veure el resultat</button>
                </li>
              );
            })}
          </ul>
        </Seccio>
      )}

      <Seccio titol="Número de WhatsApp de la superadministració" obertaInicial={!e.config_central}>
        <ConfigCentral estat={e} onDesat={() => setVersio((v) => v + 1)} />
      </Seccio>
    </div>
  );
}

function NouComunicat({ estat, onEnviat }: { estat: EstatComunicats; onEnviat: (id: string) => void }) {
  const [assumpte, setAssumpte] = useState("");
  const [text, setText] = useState("");
  const [canals, setCanals] = useState({ correu_responsables: true, whatsapp_responsables: true, whatsapp_persones: true });
  const [triats, setTriats] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [creat, setCreat] = useState<ComunicatCreat | null>(null);
  const [progres, setProgres] = useState<ProgresEnviament | null>(null);
  const [enCurs, setEnCurs] = useState(false);

  const visibles = useMemo(() => {
    const f = normalitzaText(filtre);
    return estat.casals.filter((k) => !f || normalitzaText(`${k.nom} ${k.municipi} ${k.codi}`).includes(f));
  }, [estat.casals, filtre]);
  const seleccio = estat.casals.filter((k) => triats.has(k.id));
  const totsVisibles = visibles.length > 0 && visibles.every((k) => triats.has(k.id));
  const commuta = (id: string) => setTriats((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const commutaVisibles = () => setTriats((t) => {
    const n = new Set(t);
    for (const k of visibles) if (totsVisibles) n.delete(k.id); else n.add(k.id);
    return n;
  });

  const responsables = seleccio.flatMap((k) => k.responsables);
  const persones = seleccio.reduce((n, k) => n + (k.whatsapp ? k.persones_mobil : 0), 0);
  const idioma: IdiomaWhatsapp = estat.config_central?.idioma ?? "ca";
  const exemple = text.trim() ? textPlantilla("avis_general", idioma, ["Maria", seleccio[0]?.nom ?? "Casal Cívic", netejaParametre(text, 900)]) : "";

  function valida(ev: FormEvent) {
    ev.preventDefault();
    const r = esquemaComunicat.safeParse({ assumpte, text, casal_ids: [...triats], ...canals });
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    setConfirmar(true);
  }

  async function envia() {
    setConfirmar(false); setError(null); setCreat(null); setProgres(null); setEnCurs(true);
    try {
      const c = await serveiGestio.crearComunicat({ assumpte, text, casal_ids: [...triats], ...canals });
      setCreat(c);
      await bucle(c.comunicat_id);
      setAssumpte(""); setText("");
      onEnviat(c.comunicat_id);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err;
    } finally { setEnCurs(false); }
  }

  async function bucle(id: string) {
    let p: ProgresEnviament;
    do {
      p = await serveiGestio.continuaComunicat(id);
      setProgres(p);
    } while (p.queden > 0 && !p.aturat);
  }

  async function repren() {
    if (!creat) return;
    setError(null); setEnCurs(true);
    try { await bucle(creat.comunicat_id); onEnviat(creat.comunicat_id); }
    catch (err) { if (err instanceof ErrorClientApi) setError(err); else throw err; }
    finally { setEnCurs(false); }
  }

  const fets = progres ? creat!.total - progres.queden : 0;
  return (
    <Seccio titol="Nou comunicat">
      <div aria-live="polite">
        {error && <MissatgeError error={error} />}
        {enCurs && creat && <p className="avis avis--info" role="status">Enviant… {fets} de {creat.total}. No tanqueu aquesta pàgina.</p>}
        {progres?.aturat && (
          <div className="avis avis--error" role="alert">
            <p>L'enviament s'ha aturat: {progres.aturat} Quan estigui resolt, repreneu-lo: només s'enviaran els pendents.</p>
            <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => void repren()}>Reprèn l'enviament</button>
          </div>
        )}
        {creat?.correu_manual && <CorreuManual llista={creat.correu_manual} assumpte={assumpte || "Comunicat"} text={text} />}
      </div>
      <form className="formulari" onSubmit={valida} noValidate>
        <CampText etiqueta="Assumpte del correu" obligatori maxLength={150} value={assumpte} onChange={(e) => setAssumpte(e.target.value)} error={errors.assumpte}
          placeholder="Per exemple: Tancament del casal per obres" />
        <CampAreaText etiqueta="Missatge" obligatori rows={5} maxLength={900} value={text} onChange={(e) => setText(e.target.value)} error={errors.text}
          ajuda={`Màxim 900 caràcters. Per WhatsApp s'envia en un sol paràgraf. ${text.length}/900`} />
        {exemple && (
          <div className="previsualitzacio-missatge">
            <p className="text-secundari">Així el rebrà per WhatsApp una persona usuària:</p>
            <blockquote>{exemple}</blockquote>
          </div>
        )}

        <fieldset className="camp">
          <legend>Com s'envia</legend>
          <label className="casella"><input type="checkbox" checked={canals.correu_responsables} onChange={(e) => setCanals({ ...canals, correu_responsables: e.target.checked })} /> Correu a les responsables</label>
          <label className="casella"><input type="checkbox" checked={canals.whatsapp_responsables} onChange={(e) => setCanals({ ...canals, whatsapp_responsables: e.target.checked })} /> WhatsApp a les responsables</label>
          <label className="casella"><input type="checkbox" checked={canals.whatsapp_persones} onChange={(e) => setCanals({ ...canals, whatsapp_persones: e.target.checked })} /> WhatsApp a totes les persones usuàries del casal</label>
          {errors.canals && <p className="camp__missatge" role="alert">{errors.canals}</p>}
        </fieldset>

        <fieldset className="camp">
          <legend>Casals ({triats.size} de {estat.casals.length} triats)</legend>
          {errors.casal_ids && <p className="camp__missatge" role="alert">{errors.casal_ids}</p>}
          <div className="barra-filtres">
            <label className="camp camp--en-linia"><span>Cerca</span>
              <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Casal o municipi" />
            </label>
            <label className="casella"><input type="checkbox" checked={totsVisibles} onChange={commutaVisibles} /> {filtre ? "Tots els que es veuen" : "Tots els casals"}</label>
          </div>
          <ul className="llista-neta llista-casals-comunicat">
            {visibles.map((k) => (
              <li key={k.id}>
                <label className="casella">
                  <input type="checkbox" checked={triats.has(k.id)} onChange={() => commuta(k.id)} />
                  <span>
                    <strong>{k.nom}</strong>{k.actiu ? "" : " (inactiu)"}
                    <span className="text-secundari bloc">
                      {k.responsables.length === 0 ? "Sense responsable" : k.responsables.map((r) => `${r.nom_visible}${r.te_mobil ? "" : " (sense mòbil)"}`).join(", ")}
                      {" · "}{k.persones} {k.persones === 1 ? "persona usuària" : "persones usuàries"}, {k.persones_mobil} amb mòbil
                      {" · "}{k.whatsapp ? ORIGEN_WHATSAPP[k.whatsapp] : "Sense número de WhatsApp"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {seleccio.length > 0 && (
          <p role="status">
            {seleccio.length} {seleccio.length === 1 ? "casal" : "casals"}: {responsables.length} {responsables.length === 1 ? "responsable" : "responsables"}
            {canals.whatsapp_persones ? ` i fins a ${persones} persones usuàries amb mòbil` : ""}.
          </p>
        )}
        <div className="botonera">
          <button type="submit" className="boto boto--whatsapp" disabled={enCurs}>Envia el comunicat</button>
        </div>
      </form>
      <DialegConfirmacio obert={confirmar} titol="Enviar el comunicat" textConfirmar="Envia" onCancelar={() => setConfirmar(false)} onConfirmar={() => void envia()}>
        <p>
          S'enviarà als {seleccio.length} {seleccio.length === 1 ? "casal triat" : "casals triats"}
          {canals.whatsapp_persones ? `, també per WhatsApp a fins a ${persones} persones usuàries` : ""}. Un cop enviat no es pot desfer.
        </p>
      </DialegConfirmacio>
    </Seccio>
  );
}

/** Sense servei de correu: un enllaç que obre el programa de correu amb les responsables en còpia oculta. */
function CorreuManual({ llista, assumpte, text }: { llista: { nom: string; email: string; casal: string }[]; assumpte: string; text: string }) {
  const enllac = `mailto:?bcc=${llista.map((r) => encodeURIComponent(r.email)).join(",")}&subject=${encodeURIComponent(assumpte)}&body=${encodeURIComponent(text)}`;
  return (
    <div className="avis avis--alerta">
      <p>El correu no surt sol perquè el servei de correu no està configurat. Obriu-lo i envieu-lo des del vostre programa (les {llista.length} responsables van en còpia oculta):</p>
      <a className="boto boto--petit" href={enllac}>Obre el correu</a>
      <details><summary>Adreces</summary><p className="trencable">{llista.map((r) => r.email).join(", ")}</p></details>
    </div>
  );
}

const textCanal = (c: EstatCanalComunicat | null) => {
  if (!c) return "—";
  if (CONTACTAT.includes(c.estat)) return c.estat === "llegit" ? "Llegit" : c.estat === "entregat" ? "Entregat" : "Enviat";
  if (c.estat === "pendent") return "Pendent";
  return c.motiu ? MOTIUS_COMUNICAT[c.motiu] : "No enviat";
};

/** Resultat per casal: persones contactades i les que no, amb el motiu i el telèfon per trucar-les. */
function Resultat({ id }: { id: string }) {
  const consulta = useConsulta((s) => serveiGestio.resultatComunicat(id, s), [id]);
  useEffect(() => { document.getElementById("resultat-comunicat")?.scrollIntoView({ block: "start" }); }, [consulta.tipus]);
  if (consulta.tipus === "carregant") return <Carregant text="Carregant el resultat…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const r: ResultatComunicat = consulta.dades;
  return (
    <section id="resultat-comunicat" aria-labelledby="titol-resultat" className="resultat-comunicat">
      <h2 id="titol-resultat">Resultat: {r.comunicat.assumpte}</h2>
      <p className="text-secundari">
        Enviat el {formataDataHora(r.comunicat.creat_el)}. Els estats d'entrega i lectura de WhatsApp s'actualitzen quan Meta els comunica:
        torneu a obrir el resultat més tard per veure'ls.
      </p>
      {r.casals.map((k) => (
        <Seccio key={k.casal_id} titol={`${k.casal}: ${k.persones.contactades} de ${k.persones.total} persones contactades`}>
          {k.responsables.length > 0 && (
            <ul className="llista-neta">
              {k.responsables.map((x, i) => (
                <li key={i}>Responsable {x.nom}: correu {textCanal(x.correu).toLowerCase()}, WhatsApp {textCanal(x.whatsapp).toLowerCase()}</li>
              ))}
            </ul>
          )}
          {r.comunicat.canals.whatsapp_persones && (
            <>
              <p>
                <strong>{k.persones.contactades}</strong> {k.persones.contactades === 1 ? "persona contactada" : "persones contactades"}
                {k.persones.llegides ? ` (${k.persones.llegides} l'han llegit)` : ""}
                {k.persones.pendents ? ` · ${k.persones.pendents} pendents d'enviar` : ""}
                {" · "}<strong>{k.persones.no_contactades.length}</strong> no s'han pogut contactar.
              </p>
              {k.persones.no_contactades.length > 0 && (
                <div className="taula-contenidor" tabIndex={0} role="region" aria-label={`Persones no contactades del ${k.casal}`}>
                  <table className="taula taula--densa">
                    <thead><tr><th scope="col">Persona</th><th scope="col">Motiu</th><th scope="col">Telèfon</th></tr></thead>
                    <tbody>
                      {k.persones.no_contactades.map((p, i) => (
                        <tr key={i}><td>{p.nom}</td><td>{p.motiu ? MOTIUS_COMUNICAT[p.motiu] : "No enviat"}</td><td>{p.telefon ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Seccio>
      ))}
    </section>
  );
}

function ConfigCentral({ estat, onDesat }: { estat: EstatComunicats; onDesat: () => void }) {
  const c = estat.config_central;
  const [v, setV] = useState({
    phone_number_id: c?.phone_number_id ?? "", numero_visible: c?.numero_visible ?? "", idioma: c?.idioma ?? "ca" as IdiomaWhatsapp,
    remitent: c?.remitent ?? "servei de Casals Cívics i Comunitaris", actiu: c?.actiu ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [comprovacio, setComprovacio] = useState("");

  async function desa(ev: FormEvent) {
    ev.preventDefault();
    setExit(""); setError(null);
    const r = configWhatsappCentral.safeParse({ ...v, numero_visible: v.numero_visible.trim() || null });
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    try {
      await serveiGestio.desarWhatsappCentral(r.data);
      setExit("Desat.");
      onDesat();
    } catch (err) { if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err; }
  }

  async function comprova() {
    setComprovacio("Comprovant…"); setError(null);
    try {
      const { numero } = await serveiGestio.comprovarWhatsappCentral();
      setComprovacio(`Connexió correcta: ${numero.numero ?? "número"}${numero.nom_verificat ? ` · ${numero.nom_verificat}` : ""}.`);
    } catch (err) { setComprovacio(""); if (err instanceof ErrorClientApi) setError(err); else throw err; }
  }

  return (
    <form onSubmit={(ev) => void desa(ev)} noValidate className="formulari">
      <p className="text-secundari">
        Un número de WhatsApp Business de la mateixa app de Meta que els casals, amb la plantilla «avis_general» aprovada
        (vegeu la configuració de WhatsApp Business d'un casal). Escriu a les responsables i a les persones dels casals sense número propi.
      </p>
      {exit && <AvisExit>{exit}</AvisExit>}
      {error && <MissatgeError error={error} />}
      <CampText etiqueta="Identificador del número de telèfon (Phone number ID)" obligatori inputMode="numeric" value={v.phone_number_id}
        onChange={(e) => setV({ ...v, phone_number_id: e.target.value })} error={errors.phone_number_id} />
      <CampText etiqueta="Número que veuen les persones" value={v.numero_visible} placeholder="+34 6XX XX XX XX"
        onChange={(e) => setV({ ...v, numero_visible: e.target.value })} error={errors.numero_visible} />
      <CampText etiqueta="Qui escriu (Us escrivim del…)" obligatori value={v.remitent}
        onChange={(e) => setV({ ...v, remitent: e.target.value })} error={errors.remitent} />
      <div className="camp">
        <label htmlFor="idioma-central">Idioma de la plantilla</label>
        <select id="idioma-central" value={v.idioma} onChange={(e) => setV({ ...v, idioma: e.target.value as IdiomaWhatsapp })}>
          <option value="ca">Català</option><option value="es">Castellà</option>
        </select>
      </div>
      <label className="casella"><input type="checkbox" checked={v.actiu} onChange={(e) => setV({ ...v, actiu: e.target.checked })} /> Actiu</label>
      <div className="botonera">
        <button type="submit" className="boto">Desa</button>
        {c && <button type="button" className="boto boto--secundari" onClick={() => void comprova()}>Comprova la connexió</button>}
      </div>
      {comprovacio && <p role="status">{comprovacio}</p>}
    </form>
  );
}
