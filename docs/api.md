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

## Previst
- Fases 4–6: sol·licituds, importació/exportació, adjudicació, places, assistència, estadístiques, auditoria.
- Es publicarà una especificació OpenAPI quan hi hagi els endpoints de gestió.
