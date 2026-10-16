import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { analitzaTelefon, enllacWhatsapp, netejaParametre, textPlantilla } from "../../../shared/domain/whatsapp";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { ProgresWhatsapp, useEnviamentWhatsapp } from "../../components/EnviamentWhatsapp";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { PersonaComunicacio } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";

type Situacio = "admesa" | "espera";
type Persona = PersonaComunicacio & { activitats: string[] };

/**
 * Comunicacions generals per WhatsApp (petició de 2026-10-16): un mateix avís a les persones
 * de les activitats triades, una sola vegada per persona encara que en tingui diverses.
 * Amb WhatsApp Business actiu s'envia sol; si no, cada persona té el seu botó per obrir WhatsApp.
 */
export function ComunicacionsGenerals() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.comunicacions(casalId, cicleId, s), [casalId, cicleId]);
  const wa = useConsulta((s) => serveiGestio.resumWhatsapp(casalId, cicleId, s).catch(() => null), [casalId, cicleId, versio]);
  const enviament = useEnviamentWhatsapp(casalId);
  const [text, setText] = useState("");
  const [triades, setTriades] = useState<Set<string> | null>(null);
  const [situacions, setSituacions] = useState<Set<Situacio>>(new Set(["admesa"]));
  const [confirmar, setConfirmar] = useState(false);

  const persones = useMemo<Persona[]>(() => {
    if (consulta.tipus !== "dades") return [];
    const perClau = new Map<string, Persona>();
    for (const g of consulta.dades.activitats) {
      if (triades && !triades.has(g.activitat_id)) continue;
      for (const p of g.persones) {
        if (!situacions.has(p.situacio)) continue;
        // Mateix criteri que el servidor: una persona per telèfon (o per participant si no en té).
        const clau = analitzaTelefon(p.telefon).internacional ?? `p:${p.participant_id}`;
        const ja = perClau.get(clau);
        if (ja) ja.activitats.push(g.activitat);
        else perClau.set(clau, { ...p, activitats: [g.activitat] });
      }
    }
    const compara = new Intl.Collator("ca", { sensitivity: "base" }).compare;
    return [...perClau.values()].sort((a, b) => compara(a.cognoms, b.cognoms) || compara(a.nom, b.nom));
  }, [consulta, triades, situacions]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant les persones del cicle…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const resum = wa.tipus === "dades" ? wa.dades : null;
  const api = !!resum?.disponible;
  const idioma = resum?.idioma ?? "ca";
  const gestiona = pot("places.gestionar");
  const ambWhatsapp = persones.filter((p) => analitzaTelefon(p.telefon).internacional);
  const senseWhatsapp = persones.filter((p) => !analitzaTelefon(p.telefon).internacional);
  const textNet = text.trim();
  const missatgePer = (nom: string) => textPlantilla("avis_general", idioma, [netejaParametre(nom), d.casal, netejaParametre(textNet, 900)]);
  const totes = triades === null;
  const activa = (id: string) => totes || triades.has(id);
  const commuta = (id: string) => {
    const nou = new Set(totes ? d.activitats.map((g) => g.activitat_id) : triades);
    if (nou.has(id)) nou.delete(id); else nou.add(id);
    setTriades(nou.size === d.activitats.length ? null : nou);
  };
  const commutaSituacio = (s: Situacio) => {
    const nou = new Set(situacions);
    if (nou.has(s)) nou.delete(s); else nou.add(s);
    setSituacions(nou);
  };
  const generals = (resum?.enviaments ?? []).filter((e) => e.tipus === "general");

  async function envia() {
    setConfirmar(false);
    const r = await enviament.envia(() => serveiGestio.enviamentWhatsappGeneral(casalId, cicleId, {
      text: textNet, situacions: [...situacions], ...(totes ? {} : { activitat_ids: [...triades] }),
    }));
    if (r && !r.aturat) setText("");
    setVersio((v) => v + 1);
  }

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${cicleId}`}>Tornar al cicle «{d.cicle.nom}»</Link></p>
      <h1>Comunicacions generals</h1>
      <p className="text-secundari">
        Un mateix avís per WhatsApp a les persones de les activitats que trieu (per exemple, un dia de tancament o un canvi d'aula).
        Cada persona el rep una sola vegada encara que vagi a diverses activitats.
        {api ? " S'envia sol des del WhatsApp Business del casal." : " Sense WhatsApp Business actiu, cada persona té un botó que obre WhatsApp amb el missatge escrit."}
      </p>
      <ProgresWhatsapp estat={enviament.estat} error={enviament.error} onRepren={() => void enviament.repren().then(() => setVersio((v) => v + 1))} />

      {d.activitats.length === 0 ? <p>Encara no hi ha cap persona admesa ni en llista d'espera en aquest cicle.</p> : (
        <form className="formulari" onSubmit={(e) => { e.preventDefault(); if (api && textNet.length >= 5 && ambWhatsapp.length) setConfirmar(true); }}>
          <fieldset className="camp">
            <legend>Activitats</legend>
            <label className="casella"><input type="checkbox" checked={totes} onChange={() => setTriades(totes ? new Set() : null)} /> Totes les activitats</label>
            <div className="graella-caselles">
              {d.activitats.map((g) => (
                <label key={g.activitat_id} className="casella">
                  <input type="checkbox" checked={activa(g.activitat_id)} onChange={() => commuta(g.activitat_id)} /> {g.activitat}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="camp">
            <legend>A qui</legend>
            <label className="casella"><input type="checkbox" checked={situacions.has("admesa")} onChange={() => commutaSituacio("admesa")} /> Persones amb plaça</label>
            <label className="casella"><input type="checkbox" checked={situacions.has("espera")} onChange={() => commutaSituacio("espera")} /> Persones en llista d'espera</label>
          </fieldset>
          <div className="camp">
            <label htmlFor="text-general">Missatge</label>
            <textarea id="text-general" rows={5} maxLength={900} value={text} onChange={(e) => setText(e.target.value)}
              aria-describedby="ajuda-text-general" />
            <p id="ajuda-text-general" className="ajuda">
              Màxim 900 caràcters. WhatsApp Business l'envia en un sol paràgraf: els salts de línia es converteixen en espais. {text.length}/900
            </p>
          </div>
          {textNet && (
            <div className="previsualitzacio-missatge">
              <p className="text-secundari">Així el rebrà, per exemple, {persones[0]?.nom || "la persona"}:</p>
              <blockquote>{missatgePer(persones[0]?.nom || "Maria")}</blockquote>
            </div>
          )}
          <p role="status">
            <strong>{persones.length}</strong> {persones.length === 1 ? "persona" : "persones"}: {ambWhatsapp.length} amb mòbil
            {senseWhatsapp.length ? ` i ${senseWhatsapp.length} amb telèfon fix, sense telèfon o amb un número no vàlid (no rebran el missatge)` : ""}.
          </p>
          {gestiona && api && (
            <div className="botonera">
              <button type="submit" className="boto boto--whatsapp" disabled={textNet.length < 5 || ambWhatsapp.length === 0 || situacions.size === 0 || !!enviament.estat?.enCurs}>
                Envia per WhatsApp Business
              </button>
            </div>
          )}
        </form>
      )}

      {!api && gestiona && textNet.length >= 5 && ambWhatsapp.length > 0 && (
        <Seccio titol={`Enviament un per un (${ambWhatsapp.length})`}>
          <p className="text-secundari">Cada botó obre WhatsApp amb el missatge escrit per a aquella persona: només cal prémer Envia.</p>
          <ul className="llista-neta llista-enviament">
            {ambWhatsapp.map((p) => (
              <li key={p.placa_id}>
                <a className="boto boto--whatsapp boto--petit" target="_blank" rel="noopener noreferrer"
                  href={enllacWhatsapp(analitzaTelefon(p.telefon).internacional!, missatgePer(p.nom))}>
                  Obre WhatsApp<span className="visualment-amagat"> per a {p.nom} {p.cognoms} (s'obre en una finestra nova)</span>
                </a>{" "}
                {p.nom} {p.cognoms} <span className="text-secundari">· {p.activitats.join(", ")}</span>
              </li>
            ))}
          </ul>
        </Seccio>
      )}

      {senseWhatsapp.length > 0 && (
        <Seccio titol={`Persones per trucar (${senseWhatsapp.length})`} obertaInicial={false}>
          <ul className="llista-neta">
            {senseWhatsapp.map((p) => (
              <li key={p.placa_id}>{p.nom} {p.cognoms} · {p.telefon ?? "sense telèfon"} <span className="text-secundari">· {p.activitats.join(", ")}</span></li>
            ))}
          </ul>
        </Seccio>
      )}

      {generals.length > 0 && (
        <Seccio titol="Comunicacions generals enviades" obertaInicial={false}>
          <ul className="llista-neta llista-enviaments">
            {generals.map((e) => (
              <li key={e.id}>
                <strong>{formataDataHora(e.creat_el)}</strong> · enviats {(e.recompte.enviat ?? 0) + (e.recompte.entregat ?? 0) + (e.recompte.llegit ?? 0)},
                {" "}llegits {e.recompte.llegit ?? 0}{e.recompte.fallit ? `, no entregats ${e.recompte.fallit}` : ""}{e.recompte.pendent ? `, pendents ${e.recompte.pendent}` : ""}
                <div className="text-secundari">{e.text}</div>
              </li>
            ))}
          </ul>
        </Seccio>
      )}

      <DialegConfirmacio obert={confirmar} titol="Enviar la comunicació general" textConfirmar="Envia" onCancelar={() => setConfirmar(false)} onConfirmar={() => void envia()}>
        <p>S'enviarà a <strong>{ambWhatsapp.length}</strong> {ambWhatsapp.length === 1 ? "persona" : "persones"} des del WhatsApp Business del casal. Un cop enviat no es pot desfer.</p>
      </DialegConfirmacio>
    </div>
  );
}
