# API REST

Base: `/api`. Respostes JSON. Errors amb format comú:

```json
{ "error": { "codi": "no_trobat", "missatge": "No s'ha trobat el casal.", "id_peticio": "…" } }
```

| Codi HTTP | Ús |
|---|---|
| 400 | Dades no vàlides (`peticio_invalida`) |
| 401 / 403 | No autenticat / sense permís o origen no permès |
| 404 | Recurs inexistent o no visible per a qui el demana |
| 409 | Conflicte (transició no permesa, concurrència) |
| 413 | Petició massa gran |
| 428 | Cal confirmació explícita i motiu |
| 500 / 503 | Error intern (sense detalls tècnics) / base de dades no disponible |

## Endpoints implementats (Fase 1)

| Mètode | Ruta | Accés | Descripció |
|---|---|---|---|
| GET | `/api/salut` | Públic | Estat del servei i de la connexió amb la base de dades |
| GET | `/api/public/casals/{codi}/cicles` | Públic | Cicles visibles d'un casal actiu (des d'«Inscripcions obertes» fins a «Publicat») |
| GET | `/api/public/casals/{codi}/cicles/{cicleId}/activitats` | Públic | Activitats actives d'un cicle visible; només camps de difusió |

Les respostes públiques es construeixen camp a camp (llista blanca, `shared/api/public.ts`).

## Autenticació (Fase 2)

| Mètode | Ruta | Descripció |
|---|---|---|
| POST | `/api/auth/entrar` | `{ "testimoni": "…" }` → galeta de sessió. Desactivat a producció |
| POST | `/api/auth/sortir` | Revoca la sessió |
| GET | `/api/auth/jo` | Persona autenticada, casals i permisos |

## Gestió (Fase 2) — totes exigeixen sessió i el permís indicat al casal

| Mètode | Ruta | Permís |
|---|---|---|
| GET | `/api/gestio/casals` | (casals accessibles) |
| POST | `/api/gestio/casals` | `casal.configurar` global (administració central) |
| GET / PATCH | `/api/gestio/casals/{casalId}` | `casal.consultar` / `casal.configurar` |
| GET / POST | `/api/gestio/casals/{casalId}/cicles` | `cicles.consultar` / `cicles.gestionar` |
| GET / PATCH | `/api/gestio/casals/{casalId}/cicles/{cicleId}` | `cicles.consultar` / `cicles.gestionar` |
| POST | `/api/gestio/casals/{casalId}/cicles/{cicleId}/estat` | `cicles.gestionar` (428 si cal confirmació i motiu) |
| GET / POST | `/api/gestio/casals/{casalId}/cicles/{cicleId}/activitats` | `activitats.consultar` / `activitats.gestionar` |
| GET / PATCH | `/api/gestio/casals/{casalId}/activitats/{id}` | `activitats.consultar` / `activitats.gestionar` |
| POST | `/api/gestio/casals/{casalId}/activitats/{id}/estat` | `activitats.gestionar` |
| POST | `/api/gestio/casals/{casalId}/activitats/{id}/duplicar` | `activitats.gestionar` |
| GET | `/api/gestio/casals/{casalId}/historial/{casal\|cicle\|activitat}/{id}` | consulta de l'entitat |
| GET / POST | `/api/gestio/casals/{casalId}/usuaris` | `usuaris.gestionar` |
| POST | `/api/gestio/casals/{casalId}/usuaris/{assignacioId}/revocar` | `usuaris.gestionar` |
| GET | `/api/gestio/casals/{casalId}/auditoria` | `auditoria.consultar` |

Les modificacions porten `versio` (bloqueig optimista): si algú ha modificat el registre mentrestant, la
resposta és `409 conflicte_concurrencia`. Els cossos són estrictes: un camp no previst retorna `400`.

## Sol·licituds del formulari públic (Fase 3)

`POST /api/public/casals/{codi}/cicles/{cicleId}/sollicituds`, sense sessió, amb la capçalera
`Idempotency-Key` (16–64 caràcters; el navegador genera un UUID i el conserva entre reintents).

Cos (estricte, `shared/schemas/public.ts`):
`{ dades: { nom, cognom1, ...camps actius del cicle }, preferencies: [{ activitat_id, ordre }], acceptacio_privacitat: true }`.

| Resposta | Quan |
|---|---|
| `201` | Sol·licitud desada. Retorna `codi_confirmacio`, `rebuda_el`, `data_resolucio_prevista`, `cicle` i les preferències (sense dades personals) |
| `200` amb `repetida: true` | Reintent amb la mateixa clau i el mateix contingut: mateixa confirmació, no es duplica |
| `400 peticio_invalida` | Format, obligatoris, camps no demanats pel cicle, preferències (`detalls.preferencies`), activitat no disponible |
| `400 clau_idempotencia_requerida` / `peticio_rebutjada` | Sense clau / camp parany omplert |
| `404` | Casal o cicle inexistent o no publicat |
| `409 cicle_tancat` | Fora de l'estat «Inscripcions obertes» o de la finestra de dates (comprovat dins la transacció) |
| `409 privacitat_no_configurada` | El cicle no té el text de protecció de dades |
| `409 clau_idempotencia_reutilitzada` | Mateixa clau amb contingut diferent |
| `415` | El cos no és JSON |
| `429 massa_peticions` | Més de 10 enviaments per minut des del mateix origen de xarxa (binding `LIMIT_SOLLICITUDS`) |

Participant, sol·licitud, preferències i auditoria es desen en una sola transacció: o tot o res.
El número correlatiu i la data de recepció els assigna el servidor.

## Gestió de sol·licituds, importació i exportació (Fase 4)

Totes sota `/api/gestio/casals/{casalId}` i amb sessió. El servidor treu de les respostes les dades de
contacte si la persona no té `sollicituds.dades_contacte`; el DNI/NIE no surt mai sencer.

| Mètode | Ruta | Permís | Descripció |
|---|---|---|---|
| GET | `/cicles/{cicleId}/sollicituds?vista=&ordre=&dir=&q=&activitat=&estat=&pagina=&mida=` | `sollicituds.consultar` | Llistat. `vista`: `inscripcio`, `alfabetic` o `activitat` (agrupat). `q`: nom/cognoms sense accents o número |
| GET | `/sollicituds/{id}` | `sollicituds.consultar` | Detall amb preferències |
| PATCH | `/sollicituds/{id}/dades` | `sollicituds.gestionar` | Dades personals. Cal `versio_participant` i `motiu` |
| POST | `/sollicituds/{id}/estat` | `sollicituds.gestionar` | Rebuda, validada, pendent de revisió o anul·lada. Cal `versio` i `motiu` |
| PUT | `/sollicituds/{id}/preferencies` | `sollicituds.gestionar` | Només abans de l'adjudicació. Cal `versio` i `motiu` |
| GET | `/historial/sollicitud/{id}` | `sollicituds.consultar` | Historial. Per a dades personals només consta quins camps han canviat |
| GET | `/cicles/{cicleId}/duplicats` | `sollicituds.consultar` | Parelles possiblement duplicades, per revisar a mà |
| POST | `/cicles/{cicleId}/duplicats/revisio` | `sollicituds.gestionar` | Desa la decisió (`duplicat` / `no_duplicat`). No modifica cap sol·licitud |
| POST | `/cicles/{cicleId}/importacions/{sollicituds\|activitats}/previsualitzacio` | `dades.importar` (+ `activitats.gestionar`) | Valida les files ja mapades i en retorna el resultat |
| POST | `/cicles/{cicleId}/importacions/{sollicituds\|activitats}` | igual | Confirma: `clau`, `confirmacio: true` i `files_esperades` (les vàlides vistes). Només desa les vàlides |
| GET | `/cicles/{cicleId}/exportacions/sollicituds[?activitat=]` | `dades.exportar` + `sollicituds.consultar` | Taula per a XLSX (el navegador genera el fitxer). Queda auditada |

## Adjudicació i places (Fase 5)

Totes sota `/api/gestio/casals/{casalId}` i amb sessió. Les regles es descriuen a [adjudicacio.md](adjudicacio.md).

| Mètode | Ruta | Permís | Descripció |
|---|---|---|---|
| GET | `/cicles/{cicleId}/adjudicacio` | `sollicituds.consultar` | Paràmetres vigents, versions anteriors i execucions |
| PUT | `/cicles/{cicleId}/adjudicacio/parametres` | `adjudicacio.executar` | Desa una versió nova. Cal `versio_actual` (la vigent o `null`) |
| POST | `/cicles/{cicleId}/adjudicacio/propostes` | `adjudicacio.executar` | Calcula una proposta (cicle en procés d'adjudicació). `lletra` opcional amb el sorteig de lletra |
| GET | `/adjudicacions/{id}` | `sollicituds.consultar` | Proposta o adjudicació amb els resultats per activitat |
| POST | `/adjudicacions/{id}/confirmar` | `adjudicacio.confirmar` | `confirmacio: true`. Si substitueix una confirmada, cal `motiu` (428 si no hi és). 409 `proposta_obsoleta` si les dades han canviat |
| GET | `/adjudicacions/{id}/exportacio` | `dades.exportar` + `sollicituds.consultar` | Taula de resultats per a XLSX. Queda auditada |
| GET | `/cicles/{cicleId}/places` | `sollicituds.consultar` | Places per activitat amb ocupació |
| POST | `/places/{id}/moviments` | `places.gestionar` | `accio` (`renunciar`, `donar_baixa`, `oferir`, `acceptar_oferta`, `retornar_espera`, `admetre`), `versio` i `motiu`. 409 `sense_places_lliures` si no hi ha capacitat |
| GET | `/places/{id}/moviments` | `sollicituds.consultar` | Moviments de la plaça |
| GET | `/cicles/{cicleId}/exportacions/places?tipus=admesos\|espera` | `dades.exportar` + `sollicituds.consultar` | Taula per a XLSX. Queda auditada |

Canviar el cicle a «Adjudicat» des de l'API d'estats exigeix que hi hagi una adjudicació confirmada.

### Sorteig per activitat

| Mètode | Ruta | Permís | Descripció |
|---|---|---|---|
| GET | `/cicles/{cicleId}/sorteig` | `sollicituds.consultar` | Activitats que necessiten sorteig, sortejos vigents i anul·lats, i números assignats |
| POST | `/cicles/{cicleId}/sorteig/numeros` | `adjudicacio.executar` | Assigna un número aleatori a les sol·licituds que no en tenen. Els existents no canvien |
| POST | `/cicles/{cicleId}/activitats/{id}/sorteig` | `adjudicacio.executar` | Fa el sorteig al servidor o, amb `valor_manual`, en registra un de fet a mà (`motiu` opcional). 409 `sorteig_existent` si ja n'hi ha un de vigent |
| POST | `/cicles/{cicleId}/sortejos/{id}/anullacio` | `adjudicacio.executar` | Anul·la un sorteig amb `motiu`. No s'esborra |
| GET | `/cicles/{cicleId}/exportacions/numeros-sorteig` | `dades.exportar` + `sollicituds.consultar` | Llista de números per publicar-la. Queda auditada |
| GET | `/adjudicacions/{id}/exportacions/sense-activitat` | `dades.exportar` + `sollicituds.consultar` | Persones sense cap activitat. Queda auditada |

Calcular una proposta amb sorteig per activitat retorna 409 `sortejos_pendents` si falta el sorteig d'alguna activitat amb més sol·licituds que places, o `numeros_pendents` si falten números aleatoris.

## Assistència (Fase 6)

Totes sota `/api/gestio/casals/{casalId}` i amb sessió. Les regles es descriuen a [assistencia.md](assistencia.md).

| Mètode | Ruta | Permís | Descripció |
|---|---|---|---|
| GET | `/cicles/{cicleId}/assistencia` | `sollicituds.consultar` | Resum per activitat: sessions, fetes, mitjana i persones per sota del llindar |
| GET | `/activitats/{id}/assistencia` | `sollicituds.consultar` | Full de l'activitat: sessions, persones (admeses o amb marques) i marques |
| POST | `/activitats/{id}/sessions/generacio` | `assistencia.registrar` | Crea les sessions a partir dels dies i les dates de l'activitat. No duplica les existents |
| POST | `/activitats/{id}/sessions` | `assistencia.registrar` | Afegeix una sessió (`data`, `hora_inici` opcional). 409 `sessio_existent` |
| POST | `/sessions/{id}/cancellacio` | `assistencia.registrar` | `versio` i `motiu`. Només sessions previstes i sense marques |
| PUT | `/sessions/{id}/assistencia` | `assistencia.registrar` | `marques` (`placa_id`, `estat`, `versio` o `null` si és nova). Modificar una marca exigeix `motiu` (428). 409 si el cicle està bloquejat, la sessió és futura o cancel·lada, o hi ha un canvi concurrent |
| POST | `/places/{placaId}/baixa-assistencia` | `places.gestionar` | `versio` i `motiu` opcional. Baixa per assistència inferior al llindar; el servidor recalcula el percentatge. 409 `sense_llindar`, `no_sota_llindar`, `cicle_bloquejat`, `transicio_no_permesa` o `conflicte_concurrencia` |
| GET | `/cicles/{cicleId}/exportacions/graelles[?telefon=1]` | `dades.exportar` + `sollicituds.consultar` | Dades de les graelles (el navegador genera l'XLSX). El telèfon només hi és amb permís de dades de contacte. Queda auditada |
| GET | `/cicles/{cicleId}/exportacions/assistencia` | `dades.exportar` + `sollicituds.consultar` | Taula d'assistència per a XLSX. Queda auditada |

Cada registre queda a l'auditoria i cada modificació d'una marca, amb el motiu, a l'historial de la plaça (`/historial?entitat=placa&id=…`). El llindar d'assistència del cicle es desa amb `PATCH /cicles/{cicleId}` (`llindar_assistencia`, 1–100 o `null`). En crear un cicle, si no s'indica, és 80.

## Quadre de comandament

| Mètode | Ruta | Permís | Descripció |
|---|---|---|---|
| GET | `/cicles/{cicleId}/indicadors` | `sollicituds.consultar` | Indicadors del cicle calculats en el moment a partir de la base de dades |

Resposta:
- `inscripcions.estat`: `pendents`, `obertes`, `fora_de_termini` o `tancades`.
- `adjudicacio`: darrera proposta o adjudicació confirmada (`estat`, `versio`, `data`), o `sense_proposta`.
- `totals`: activitats actives, sol·licituds no anul·lades (i per estat), persones inscrites (participants diferents), places disponibles, ocupades (admeses + ofertes pendents) i lliures, persones admeses i en llista d'espera, activitats sense inscripcions i activitats amb més demanda que places.
- `activitats`: per a cada activitat activa, places, sol·licituds, sol·licituds en 1a preferència, admeses, ofertes pendents, llista d'espera, places lliures i els indicadors `sense_inscripcions` i `mes_demanda`.

Criteris:
- Una activitat té «més demanda que places» quan el nombre de sol·licituds no anul·lades que la inclouen en qualsevol preferència supera la capacitat.
- Les activitats inactives o en esborrany no es compten, i les arxivades tampoc.
- No es desa cap xifra: cada consulta torna a calcular-les.

## Previst
- Es publicarà una especificació OpenAPI quan hi hagi els endpoints de gestió.
