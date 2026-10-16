import { normalitzaParametres, type ParametresAdjudicacio, type ResultatMotor } from "../../../shared/domain/adjudicacio";
import type { EstatPlaca } from "../../../shared/schemas/adjudicacio";
import type {
  ConfiguracioAdjudicacio, DadesMotor, Execucio, FilaPlaca, FilaResultat, MovimentPlaca, Placa, RepositoriAdjudicacio, SorteigActivitat,
} from "../tipus";
import { participantDeFila, SELECT_PARTICIPANT } from "./gestio-sollicituds";
import { comOperacio, jsonObjecte } from "./util";

/** Mida dels blocs JSON que s'insereixen amb json_each (límit de mida de fila de D1). */
const BLOC = 2000;

const blocs = <T>(llista: T[]) => Array.from({ length: Math.ceil(llista.length / BLOC) }, (_, i) => llista.slice(i * BLOC, (i + 1) * BLOC));

/** La plaça té una renúncia o baixa registrada a mà (no per una substitució): no es torna a adjudicar. */
const EXCLOSA = (alies: string) => `${alies}.estat IN ('renuncia', 'baixa')
  AND (SELECT m.execucio_id FROM moviments_places m WHERE m.placa_id = ${alies}.id ORDER BY m.id DESC LIMIT 1) IS NULL`;

/**
 * La mateixa persona en dos cicles (participants `p` i `p0` del mateix casal): el mateix registre,
 * el mateix codi intern o el mateix document. Si dues persones comparteixen document, les
 * distingeix la data de naixement. Ni el nom ni el telèfon serveixen (hi ha gent gran que
 * comparteix telèfon). Criteri validat pel casal (14/10/2026), documentat a docs/adjudicacio.md.
 */
const MATEIXA_PERSONA = `(p0.id = p.id
  OR (p.codi_participant_intern IS NOT NULL AND p0.codi_participant_intern = p.codi_participant_intern)
  OR (p.document_identitat IS NOT NULL AND p0.document_identitat IS NOT NULL
      AND upper(replace(replace(p0.document_identitat, ' ', ''), '-', '')) = upper(replace(replace(p.document_identitat, ' ', ''), '-', ''))
      AND (p.data_naixement IS NULL OR p0.data_naixement IS NULL OR p0.data_naixement = p.data_naixement)))`;

/** Activitat equivalent en el cicle anterior: enllaç explícit, mateix codi extern o mateix nom. */
const ACTIVITAT_EQUIVALENT = `(json_extract(a.configuracio_continuitat, '$.activitat_anterior_id') = a0.id
  OR (a.codi_extern IS NOT NULL AND a.codi_extern = a0.codi_extern)
  OR lower(trim(a.nom)) = lower(trim(a0.nom)))`;

type FilaExecucio = Omit<Execucio, "resum"> & { resum: string };
const mapaExecucio = (f: FilaExecucio): Execucio => ({ ...f, resum: jsonObjecte(f.resum) });

const SELECT_EXECUCIO = `SELECT e.id, e.casal_id, e.cicle_id, e.configuracio_id, c.versio AS configuracio_versio, e.versio, e.estat,
  e.lletra_sorteig, e.llavor_desempat, e.motiu, e.resum, e.executada_per, e.executada_el, e.confirmada_per, e.confirmada_el,
  e.substituida_per_execucio
  FROM execucions_adjudicacio e JOIN configuracions_adjudicacio c ON c.id = e.configuracio_id`;

export class D1RepositoriAdjudicacio implements RepositoriAdjudicacio {
  constructor(private readonly db: D1Database) {}

  private mapaConfig(f: Omit<ConfiguracioAdjudicacio, "parametres"> & { parametres: string }): ConfiguracioAdjudicacio {
    return { ...f, parametres: normalitzaParametres(jsonObjecte(f.parametres) as unknown as ParametresAdjudicacio) };
  }

  async configuracioVigent(cicleId: string) {
    const f = await this.db.prepare("SELECT * FROM configuracions_adjudicacio WHERE cicle_id = ? ORDER BY versio DESC LIMIT 1")
      .bind(cicleId).first<Omit<ConfiguracioAdjudicacio, "parametres"> & { parametres: string }>();
    return f ? this.mapaConfig(f) : null;
  }

  async configuracions(cicleId: string) {
    const { results } = await this.db.prepare("SELECT * FROM configuracions_adjudicacio WHERE cicle_id = ? ORDER BY versio DESC")
      .bind(cicleId).all<Omit<ConfiguracioAdjudicacio, "parametres"> & { parametres: string }>();
    return results.map((f) => this.mapaConfig(f));
  }

  operacioDesarConfiguracio(d: { id: string; cicle_id: string; versio: number; versio_anterior: number | null; parametres: ParametresAdjudicacio; usuari_id: string }, ara: string) {
    // La UNIQUE (cicle_id, versio) impedeix dues versions iguals; la condició impedeix saltar-se'n una.
    return comOperacio(this.db.prepare(
      `INSERT INTO configuracions_adjudicacio (id, cicle_id, versio, parametres, creat_per, creat_el)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (SELECT MAX(versio) FROM configuracions_adjudicacio WHERE cicle_id = ?) IS ?`,
    ).bind(d.id, d.cicle_id, d.versio, JSON.stringify(d.parametres), d.usuari_id, ara, d.cicle_id, d.versio_anterior));
  }

  async dadesMotor(casalId: string, cicleId: string): Promise<DadesMotor> {
    const [sollicituds, preferencies, activitats, cicle] = await this.db.batch([
      this.db.prepare(`SELECT s.id, s.participant_id, s.numero, s.rebuda_el, s.estat, p.clau_ordenacio, ns.numero AS numero_sorteig
                       FROM sollicituds s JOIN participants p ON p.id = s.participant_id
                       LEFT JOIN numeros_sorteig ns ON ns.sollicitud_id = s.id AND ns.cicle_id = s.cicle_id
                       WHERE s.casal_id = ? AND s.cicle_id = ? ORDER BY s.numero`).bind(casalId, cicleId),
      this.db.prepare(`SELECT pr.sollicitud_id, pr.activitat_id, pr.ordre FROM preferencies pr
                       JOIN sollicituds s ON s.id = pr.sollicitud_id
                       WHERE s.casal_id = ? AND s.cicle_id = ? ORDER BY pr.sollicitud_id, pr.ordre`).bind(casalId, cicleId),
      this.db.prepare(`SELECT id, nom, capacitat, estat, minim_participants, simbol_grup AS grup FROM activitats WHERE casal_id = ? AND cicle_id = ? AND estat <> 'arxivada'
                       ORDER BY nom COLLATE NOCASE, id`).bind(casalId, cicleId),
      this.db.prepare("SELECT limits_grups FROM cicles WHERE id = ? AND casal_id = ?").bind(cicleId, casalId),
    ]);
    const prefs = new Map<string, { activitat_id: string; ordre: number }[]>();
    for (const p of preferencies!.results as { sollicitud_id: string; activitat_id: string; ordre: number }[]) {
      prefs.set(p.sollicitud_id, [...(prefs.get(p.sollicitud_id) ?? []), { activitat_id: p.activitat_id, ordre: p.ordre }]);
    }
    return {
      sollicituds: (sollicituds!.results as DadesMotor["sollicituds"]).map((s) => ({ ...s, preferencies: prefs.get(s.id) ?? [] })),
      activitats: (activitats!.results as Omit<DadesMotor["activitats"][number], "disponible">[])
        .map((a) => ({ ...a, disponible: a.estat === "activa" })),
      limits_grups: jsonObjecte((cicle!.results[0] as { limits_grups?: string } | undefined)?.limits_grups ?? "{}") as Record<string, number>,
    };
  }

  /** Cicle anterior: el més recent del casal, anterior a aquest, amb una adjudicació confirmada. */
  private async cicleAnterior(casalId: string, cicleId: string) {
    return this.db.prepare(
      `SELECT c.id, c.nom FROM cicles c, cicles actual
       WHERE actual.id = ? AND actual.casal_id = ? AND c.casal_id = actual.casal_id AND c.id <> actual.id
         AND c.data_inici < actual.data_inici
         AND EXISTS (SELECT 1 FROM execucions_adjudicacio e WHERE e.cicle_id = c.id AND e.estat = 'confirmada')
       ORDER BY c.data_inici DESC LIMIT 1`,
    ).bind(cicleId, casalId).first<{ id: string; nom: string }>();
  }

  /** Parelles sol·licitud-activitat d'aquest cicle amb una plaça del cicle anterior que compleix `condicioPlaca`. */
  private async parellesAnteriors(casalId: string, cicleId: string, anteriorId: string, condicioPlaca: string, params: unknown[] = []) {
    const { results } = await this.db.prepare(
      `SELECT DISTINCT s.id AS sollicitud_id, a.id AS activitat_id
       FROM sollicituds s
       JOIN participants p ON p.id = s.participant_id
       JOIN preferencies pr ON pr.sollicitud_id = s.id
       JOIN activitats a ON a.id = pr.activitat_id
       JOIN sollicituds s0 ON s0.cicle_id = ? AND s0.casal_id = s.casal_id
       JOIN participants p0 ON p0.id = s0.participant_id
       JOIN places pl ON pl.sollicitud_id = s0.id
       JOIN activitats a0 ON a0.id = pl.activitat_id
       WHERE s.cicle_id = ? AND s.casal_id = ? AND ${condicioPlaca} AND ${MATEIXA_PERSONA} AND ${ACTIVITAT_EQUIVALENT}`,
    ).bind(anteriorId, cicleId, casalId, ...params).all<{ sollicitud_id: string; activitat_id: string }>();
    return new Set(results.map((r) => `${r.sollicitud_id}:${r.activitat_id}`));
  }

  async continuitat(casalId: string, cicleId: string) {
    const anterior = await this.cicleAnterior(casalId, cicleId);
    if (!anterior) return { parelles: new Set<string>(), cicle_anterior: null };
    return { parelles: await this.parellesAnteriors(casalId, cicleId, anterior.id, "pl.estat = 'admesa'"), cicle_anterior: anterior };
  }

  async esperaAnterior(casalId: string, cicleId: string, preferenciaMaxima: number) {
    const anterior = await this.cicleAnterior(casalId, cicleId);
    if (!anterior) return { parelles: new Set<string>(), cicle_anterior: null };
    // Va quedar en llista d'espera (sense arribar a tenir plaça) havent triat l'activitat com a preferència 1..N.
    return {
      parelles: await this.parellesAnteriors(casalId, cicleId, anterior.id, "pl.estat = 'llista_espera' AND pl.preferencia <= ?", [preferenciaMaxima]),
      cicle_anterior: anterior,
    };
  }

  async numerosSorteig(cicleId: string) {
    const { results } = await this.db.prepare(
      "SELECT sollicitud_id, numero, assignat_el FROM numeros_sorteig WHERE cicle_id = ? ORDER BY numero",
    ).bind(cicleId).all<{ sollicitud_id: string; numero: number; assignat_el: string }>();
    return results;
  }

  async llistaNumerosSorteig(casalId: string, cicleId: string) {
    const { results } = await this.db.prepare(
      `SELECT ns.numero, s.numero AS numero_sollicitud, ${SELECT_PARTICIPANT}
       FROM numeros_sorteig ns JOIN sollicituds s ON s.id = ns.sollicitud_id JOIN participants p ON p.id = s.participant_id
       WHERE ns.cicle_id = ? AND s.casal_id = ? ORDER BY ns.numero`,
    ).bind(cicleId, casalId).all<Record<string, unknown>>();
    return results.map((f) => ({ numero: f.numero as number, numero_sollicitud: f.numero_sollicitud as number, participant: participantDeFila(f) }));
  }

  operacionsAssignarNumeros(d: { casal_id: string; cicle_id: string; assignacions: { sollicitud_id: string; numero: number }[]; usuari_id: string }, ara: string) {
    // La UNIQUE (cicle_id, numero) i la clau primària fan fallar tot el lot si algú n'ha assignat mentrestant.
    return blocs(d.assignacions).map((bloc) => comOperacio(this.db.prepare(
      `INSERT INTO numeros_sorteig (cicle_id, sollicitud_id, numero, assignat_per, assignat_el)
       SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), ?, ?
       FROM json_each(?)
       WHERE EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces')`,
    ).bind(d.cicle_id, d.usuari_id, ara, JSON.stringify(bloc.map((a) => [a.sollicitud_id, a.numero])), d.cicle_id, d.casal_id)));
  }

  async sortejos(cicleId: string): Promise<SorteigActivitat[]> {
    const { results } = await this.db.prepare(
      `SELECT so.*, a.nom AS activitat, u.nom_visible AS realitzat_per_nom FROM sortejos_adjudicacio so
       JOIN activitats a ON a.id = so.activitat_id
       LEFT JOIN usuaris u ON u.id = so.realitzat_per
       WHERE so.cicle_id = ? ORDER BY so.realitzat_el DESC, so.id`,
    ).bind(cicleId).all<SorteigActivitat>();
    return results;
  }

  operacioNouSorteig(d: Omit<SorteigActivitat, "estat" | "anullat_per" | "anullat_el" | "motiu_anullacio" | "activitat" | "realitzat_per_nom"> & { operacio: string }) {
    // L'índex únic de sortejos vigents impedeix dos sortejos de la mateixa activitat.
    return comOperacio(this.db.prepare(
      `INSERT INTO sortejos_adjudicacio (id, casal_id, cicle_id, activitat_id, tipus, valor, rang_maxim, numeracio, origen, motiu,
         realitzat_per, realitzat_el, darrera_operacio)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces')
         AND EXISTS (SELECT 1 FROM activitats WHERE id = ? AND cicle_id = ? AND estat = 'activa')`,
    ).bind(d.id, d.casal_id, d.cicle_id, d.activitat_id, d.tipus, d.valor, d.rang_maxim, d.numeracio, d.origen, d.motiu,
      d.realitzat_per, d.realitzat_el, d.operacio, d.cicle_id, d.casal_id, d.activitat_id, d.cicle_id));
  }

  operacioAnullarSorteig(d: { id: string; casal_id: string; cicle_id: string; motiu: string; usuari_id: string; operacio: string }, ara: string) {
    return comOperacio(this.db.prepare(
      `UPDATE sortejos_adjudicacio SET estat = 'anullat', anullat_per = ?, anullat_el = ?, motiu_anullacio = ?, darrera_operacio = ?
       WHERE id = ? AND casal_id = ? AND estat = 'vigent'
         AND EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces')`,
    ).bind(d.usuari_id, ara, d.motiu, d.operacio, d.id, d.casal_id, d.cicle_id, d.casal_id));
  }

  async parellesExcloses(cicleId: string) {
    const { results } = await this.db.prepare(
      `SELECT pl.sollicitud_id, pl.activitat_id FROM places pl JOIN activitats a ON a.id = pl.activitat_id
       WHERE a.cicle_id = ? AND ${EXCLOSA("pl")}`,
    ).bind(cicleId).all<{ sollicitud_id: string; activitat_id: string }>();
    return new Set(results.map((r) => `${r.sollicitud_id}:${r.activitat_id}`));
  }

  async execucions(casalId: string, cicleId: string) {
    const { results } = await this.db.prepare(`${SELECT_EXECUCIO} WHERE e.casal_id = ? AND e.cicle_id = ? ORDER BY e.versio DESC`)
      .bind(casalId, cicleId).all<FilaExecucio>();
    return results.map(mapaExecucio);
  }

  async execucio(casalId: string, id: string) {
    const f = await this.db.prepare(`${SELECT_EXECUCIO} WHERE e.casal_id = ? AND e.id = ?`).bind(casalId, id).first<FilaExecucio>();
    return f ? mapaExecucio(f) : null;
  }

  async execucioConfirmada(cicleId: string) {
    const f = await this.db.prepare(`${SELECT_EXECUCIO} WHERE e.cicle_id = ? AND e.estat = 'confirmada'`).bind(cicleId).first<FilaExecucio>();
    return f ? mapaExecucio(f) : null;
  }

  async maxVersioExecucio(cicleId: string) {
    const f = await this.db.prepare("SELECT COALESCE(MAX(versio), 0) AS n FROM execucions_adjudicacio WHERE cicle_id = ?")
      .bind(cicleId).first<{ n: number }>();
    return f?.n ?? 0;
  }

  async resultats(execucioId: string): Promise<FilaResultat[]> {
    const { results } = await this.db.prepare(
      `SELECT r.*, s.numero, ${SELECT_PARTICIPANT}
       FROM resultats_adjudicacio r
       JOIN sollicituds s ON s.id = r.sollicitud_id
       JOIN participants p ON p.id = s.participant_id
       WHERE r.execucio_id = ? ORDER BY r.activitat_id, r.resultat, r.posicio_espera, p.clau_ordenacio, s.numero`,
    ).bind(execucioId).all<Record<string, unknown>>();
    return results.map((f) => ({
      sollicitud_id: f.sollicitud_id as string, activitat_id: f.activitat_id as string, preferencia: f.preferencia as number,
      resultat: f.resultat as FilaResultat["resultat"], posicio_espera: f.posicio_espera as number | null,
      ordre_adjudicacio: f.ordre_adjudicacio as number, per_continuitat: f.per_continuitat === 1, per_espera_anterior: f.per_espera_anterior === 1,
      motiu: f.motiu as string | null, numero: f.numero as number, participant: participantDeFila(f),
    }));
  }

  operacionsNovaProposta(d: {
    id: string; casal_id: string; cicle_id: string; configuracio_id: string; versio: number;
    lletra: string | null; llavor: string | null; resum: Record<string, unknown>; usuari_id: string; operacio: string;
    resultats: ResultatMotor[];
  }, ara: string) {
    // El cicle ha de ser en procés d'adjudicació i la configuració ha de ser la vigent.
    const condicio = `EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces')
      AND ? = (SELECT id FROM configuracions_adjudicacio WHERE cicle_id = ? ORDER BY versio DESC LIMIT 1)`;
    const params = [d.cicle_id, d.casal_id, d.configuracio_id, d.cicle_id];
    return [
      comOperacio(this.db.prepare(`UPDATE execucions_adjudicacio SET estat = 'descartada'
                                   WHERE cicle_id = ? AND estat = 'proposta' AND ${condicio}`).bind(d.cicle_id, ...params)),
      comOperacio(this.db.prepare(
        `INSERT INTO execucions_adjudicacio (id, casal_id, cicle_id, configuracio_id, versio, estat, lletra_sorteig, llavor_desempat,
           resum, executada_per, executada_el, darrera_operacio)
         SELECT ?, ?, ?, ?, ?, 'proposta', ?, ?, ?, ?, ?, ? WHERE ${condicio}`,
      ).bind(d.id, d.casal_id, d.cicle_id, d.configuracio_id, d.versio, d.lletra, d.llavor, JSON.stringify(d.resum),
        d.usuari_id, ara, d.operacio, ...params)),
      ...blocs(d.resultats).map((bloc) => comOperacio(this.db.prepare(
        `INSERT INTO resultats_adjudicacio (execucio_id, sollicitud_id, activitat_id, preferencia, resultat, posicio_espera,
           ordre_adjudicacio, per_continuitat, motiu, per_espera_anterior)
         SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
           json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
           json_extract(value, '$[8]')
         FROM json_each(?)
         WHERE EXISTS (SELECT 1 FROM execucions_adjudicacio WHERE id = ? AND darrera_operacio = ?)`,
      ).bind(d.id, JSON.stringify(bloc.map((r) => [r.sollicitud_id, r.activitat_id, r.preferencia, r.resultat, r.posicio_espera,
        r.ordre_adjudicacio, r.per_continuitat ? 1 : 0, r.motiu, r.per_espera_anterior ? 1 : 0])), d.id, d.operacio))),
    ];
  }

  operacionsConfirmar(d: {
    execucio_id: string; cicle_id: string; casal_id: string; anterior_id: string | null; motiu: string | null; usuari_id: string; operacio: string;
    places_noves: { id: string; sollicitud_id: string; activitat_id: string }[];
  }, ara: string) {
    const E = d.execucio_id;
    const previa = `EXISTS (SELECT 1 FROM execucions_adjudicacio WHERE id = ? AND estat = 'proposta')
      AND EXISTS (SELECT 1 FROM cicles WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces')`;
    const paramsPrevia = [E, d.cicle_id, d.casal_id];
    // Les sentències posteriors només s'apliquen si la confirmació (amb aquest testimoni) ha tingut efecte.
    const confirmada = "EXISTS (SELECT 1 FROM execucions_adjudicacio WHERE id = ? AND darrera_operacio = ? AND estat = 'confirmada')";
    const paramsConfirmada = [E, d.operacio];
    const textMoviment = d.anterior_id
      ? `Substitució de l'adjudicació confirmada: ${d.motiu ?? ""}`.trim()
      : "Adjudicació confirmada";
    const ops = [];
    if (d.anterior_id) {
      ops.push(this.db.prepare(`UPDATE execucions_adjudicacio SET estat = 'substituida', substituida_per_execucio = ?
                                WHERE id = ? AND estat = 'confirmada' AND ${previa}`).bind(E, d.anterior_id, ...paramsPrevia));
    }
    // L'índex únic de confirmades fa fallar tot el lot si una altra execució ja és confirmada.
    ops.push(this.db.prepare(
      `UPDATE execucions_adjudicacio SET estat = 'confirmada', confirmada_per = ?, confirmada_el = ?, motiu = ?, darrera_operacio = ?
       WHERE id = ? AND ${previa}`,
    ).bind(d.usuari_id, ara, d.motiu, d.operacio, E, ...paramsPrevia));
    // El cicle passa a «adjudicat».
    ops.push(this.db.prepare(
      `UPDATE cicles SET estat = 'adjudicat', versio = versio + 1, darrera_operacio = ?, actualitzat_el = ?
       WHERE id = ? AND casal_id = ? AND estat = 'adjudicacio_en_proces' AND ${confirmada}`,
    ).bind(d.operacio, ara, d.cicle_id, d.casal_id, ...paramsConfirmada));
    // Places existents (substitució): primer el moviment amb l'estat anterior, després el canvi.
    const nouResultat = `(SELECT r.resultat FROM resultats_adjudicacio r WHERE r.execucio_id = ? AND r.sollicitud_id = pl.sollicitud_id
                          AND r.activitat_id = pl.activitat_id AND r.resultat IN ('admesa', 'llista_espera'))`;
    const novaPosicio = `(SELECT r.posicio_espera FROM resultats_adjudicacio r WHERE r.execucio_id = ? AND r.sollicitud_id = pl.sollicitud_id
                          AND r.activitat_id = pl.activitat_id AND r.resultat = 'llista_espera')`;
    ops.push(this.db.prepare(
      `INSERT INTO moviments_places (placa_id, estat_anterior, estat_nou, motiu, usuari_id, creat_el, execucio_id)
       SELECT pl.id, pl.estat, COALESCE(${nouResultat}, 'baixa'), ?, ?, ?, ?
       FROM places pl JOIN activitats a ON a.id = pl.activitat_id
       WHERE a.cicle_id = ? AND NOT (${EXCLOSA("pl")})
         AND (pl.estat IS NOT COALESCE(${nouResultat}, 'baixa') OR pl.posicio_espera IS NOT ${novaPosicio})
         AND ${confirmada}`,
    ).bind(E, textMoviment, d.usuari_id, ara, E, d.cicle_id, E, E, ...paramsConfirmada));
    ops.push(this.db.prepare(
      `UPDATE places AS pl SET estat = COALESCE(${nouResultat}, 'baixa'), posicio_espera = ${novaPosicio},
         preferencia = COALESCE((SELECT r.preferencia FROM resultats_adjudicacio r WHERE r.execucio_id = ?
           AND r.sollicitud_id = pl.sollicitud_id AND r.activitat_id = pl.activitat_id), pl.preferencia),
         execucio_origen_id = ?, versio = pl.versio + 1, darrera_operacio = ?, actualitzat_el = ?
       WHERE pl.activitat_id IN (SELECT id FROM activitats WHERE cicle_id = ?) AND NOT (${EXCLOSA("pl")}) AND ${confirmada}`,
    ).bind(E, E, E, E, d.operacio, ara, d.cicle_id, ...paramsConfirmada));
    // Places noves.
    for (const bloc of blocs(d.places_noves)) {
      ops.push(this.db.prepare(
        `INSERT INTO places (id, casal_id, activitat_id, sollicitud_id, estat, posicio_espera, preferencia, execucio_origen_id,
           actualitzat_el, versio, darrera_operacio)
         SELECT json_extract(j.value, '$[0]'), ?, r.activitat_id, r.sollicitud_id, r.resultat, r.posicio_espera, r.preferencia, ?, ?, 1, ?
         FROM json_each(?) j
         JOIN resultats_adjudicacio r ON r.execucio_id = ? AND r.sollicitud_id = json_extract(j.value, '$[1]')
           AND r.activitat_id = json_extract(j.value, '$[2]') AND r.resultat IN ('admesa', 'llista_espera')
         WHERE NOT EXISTS (SELECT 1 FROM places x WHERE x.activitat_id = r.activitat_id AND x.sollicitud_id = r.sollicitud_id)
           AND ${confirmada}`,
      ).bind(d.casal_id, E, ara, d.operacio, JSON.stringify(bloc.map((p) => [p.id, p.sollicitud_id, p.activitat_id])), E,
        ...paramsConfirmada));
    }
    ops.push(this.db.prepare(
      `INSERT INTO moviments_places (placa_id, estat_anterior, estat_nou, motiu, usuari_id, creat_el, execucio_id)
       SELECT pl.id, NULL, pl.estat, ?, ?, ?, ? FROM places pl
       WHERE pl.execucio_origen_id = ? AND pl.darrera_operacio = ?
         AND NOT EXISTS (SELECT 1 FROM moviments_places m WHERE m.placa_id = pl.id) AND ${confirmada}`,
    ).bind(textMoviment, d.usuari_id, ara, E, E, d.operacio, ...paramsConfirmada));
    return ops.map(comOperacio);
  }

  async places(casalId: string, cicleId: string, activitatId?: string): Promise<FilaPlaca[]> {
    const { results } = await this.db.prepare(
      `SELECT pl.*, s.numero, ${SELECT_PARTICIPANT}
       FROM places pl
       JOIN activitats a ON a.id = pl.activitat_id
       JOIN sollicituds s ON s.id = pl.sollicitud_id
       JOIN participants p ON p.id = s.participant_id
       WHERE pl.casal_id = ? AND a.cicle_id = ? ${activitatId ? "AND pl.activitat_id = ?" : ""}
       ORDER BY a.nom COLLATE NOCASE, pl.activitat_id,
         CASE pl.estat WHEN 'admesa' THEN 1 WHEN 'oferta_pendent' THEN 2 WHEN 'llista_espera' THEN 3 ELSE 4 END,
         pl.posicio_espera, p.clau_ordenacio, s.numero`,
    ).bind(casalId, cicleId, ...(activitatId ? [activitatId] : [])).all<Record<string, unknown>>();
    return results.map((f) => ({
      id: f.id as string, activitat_id: f.activitat_id as string, sollicitud_id: f.sollicitud_id as string,
      estat: f.estat as EstatPlaca, posicio_espera: f.posicio_espera as number | null, preferencia: f.preferencia as number,
      versio: f.versio as number, execucio_origen_id: f.execucio_origen_id as string, actualitzat_el: f.actualitzat_el as string,
      numero: f.numero as number, participant: participantDeFila(f),
    }));
  }

  async placa(casalId: string, id: string) {
    return this.db.prepare(
      `SELECT pl.id, pl.activitat_id, pl.sollicitud_id, pl.estat, pl.posicio_espera, pl.preferencia, pl.versio, pl.execucio_origen_id,
         pl.actualitzat_el, a.cicle_id, a.capacitat
       FROM places pl JOIN activitats a ON a.id = pl.activitat_id WHERE pl.casal_id = ? AND pl.id = ?`,
    ).bind(casalId, id).first<Placa & { cicle_id: string; capacitat: number }>();
  }

  async moviments(placaId: string) {
    const { results } = await this.db.prepare("SELECT * FROM moviments_places WHERE placa_id = ? ORDER BY id").bind(placaId).all<MovimentPlaca>();
    return results;
  }

  operacioMoviment(d: { placa_id: string; versio: number; des: EstatPlaca; cap: EstatPlaca; ocupa: boolean; operacio: string }, ara: string) {
    const capacitat = d.ocupa
      ? `AND (SELECT COUNT(*) FROM places x WHERE x.activitat_id = places.activitat_id AND x.estat IN ('admesa', 'oferta_pendent'))
             < (SELECT capacitat FROM activitats WHERE id = places.activitat_id)`
      : "";
    return comOperacio(this.db.prepare(
      `UPDATE places SET estat = ?, versio = versio + 1, darrera_operacio = ?, actualitzat_el = ?
       WHERE id = ? AND versio = ? AND estat = ?
         AND EXISTS (SELECT 1 FROM activitats a JOIN cicles c ON c.id = a.cicle_id
                     WHERE a.id = places.activitat_id AND c.estat IN ('adjudicat', 'publicat'))
         ${capacitat}`,
    ).bind(d.cap, d.operacio, ara, d.placa_id, d.versio, d.des));
  }

  operacioRegistreMoviment(d: { placa_id: string; des: EstatPlaca; cap: EstatPlaca; motiu: string; usuari_id: string; operacio: string }, ara: string) {
    return comOperacio(this.db.prepare(
      `INSERT INTO moviments_places (placa_id, estat_anterior, estat_nou, motiu, usuari_id, creat_el)
       SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND darrera_operacio = ?)`,
    ).bind(d.placa_id, d.des, d.cap, d.motiu, d.usuari_id, ara, d.placa_id, d.operacio));
  }
}
