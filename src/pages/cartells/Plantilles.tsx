import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ETIQUETES_ESTACIO, ETIQUETES_ESTAT_PLANTILLA, ETIQUETES_TIPUS_PLANTILLA, type TipusPlantilla,
} from "../../../shared/domain/cartells";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiCartells } from "../../services/cartells";
import { useGestio, usePermisos } from "../gestio/context";
import { CarregaPlantilles } from "./CarregaPlantilles";
import { ImatgeFitxer } from "./ImatgeFitxer";

/** Biblioteca de plantilles: les comunes a tots els casals i les pròpies del casal. */
export function Plantilles() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const casal = jo.casals.find((c) => c.id === casalId);
  const [tipus, setTipus] = useState<TipusPlantilla | "">("");
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiCartells.plantilles(casalId, tipus || undefined, s), [casalId, tipus, versio], `${casalId}-${tipus}`);
  const potCarregar = pot("cartells.plantilles") || jo.pot_gestionar_plantilles_comunes;

  if (!casal || !pot("cartells.consultar")) return <p role="alert" className="avis avis--error">No teniu accés a PG-Cartells en aquest casal.</p>;

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cartells`}>PG-Cartells</Link> · {casal.nom}</p>
      <h1>Plantilles</h1>

      <Seccio titol="Biblioteca de plantilles">
        <div className="camp camp--compacte">
          <label htmlFor="filtre-tipus">Mostra</label>
          <select id="filtre-tipus" value={tipus} onChange={(e) => setTipus(e.target.value as TipusPlantilla | "")}>
            <option value="">Totes les plantilles</option>
            <option value="cartell">Cartells</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        {consulta.tipus === "carregant" && <Carregant />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (consulta.dades.plantilles.length === 0 ? (
          <p>Encara no hi ha cap plantilla{potCarregar ? ". Les podeu carregar a la secció següent." : " disponible."}</p>
        ) : (
          <ul className="graella-plantilles">
            {consulta.dades.plantilles.map((p) => (
              <li key={p.id} className="targeta targeta--plantilla">
                {p.previsualitzacio_id
                  ? <ImatgeFitxer casalId={casalId} fitxerId={p.previsualitzacio_id} alt="" className="targeta__imatge" />
                  : <div className="targeta__imatge imatge-fitxer--buida" aria-hidden="true" />}
                <Link to={`/gestio/${casalId}/cartells/plantilles/${p.id}`} className="targeta__titol">{p.nom}</Link>
                <p className="targeta__meta">
                  {ETIQUETES_TIPUS_PLANTILLA[p.tipus]}
                  {p.estacio ? ` · ${ETIQUETES_ESTACIO[p.estacio]}` : ""}
                  {` · ${p.casal_id === null ? "Comuna" : "Del casal"}`}
                </p>
                {p.estat !== "activa" && <span className={`etiqueta etiqueta--${p.estat}`}>{ETIQUETES_ESTAT_PLANTILLA[p.estat]}</span>}
              </li>
            ))}
          </ul>
        ))}
      </Seccio>

      {potCarregar && (
        <Seccio titol="Carrega plantilles" obertaInicial={consulta.tipus === "dades" && consulta.dades.plantilles.length === 0}>
          <CarregaPlantilles
            casalId={casalId}
            potCasal={pot("cartells.plantilles")}
            potComunes={jo.pot_gestionar_plantilles_comunes}
            onCarregades={() => setVersio((v) => v + 1)}
          />
        </Seccio>
      )}
    </div>
  );
}
