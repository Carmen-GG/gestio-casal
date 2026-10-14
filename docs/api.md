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

## Previst
- Fase 2: autenticació, `/api/gestio/casals`, `/cicles`, `/activitats` (crear, editar, duplicar, arxivar, canviar estat).
- Fase 3: `POST /api/public/casals/{codi}/cicles/{cicleId}/sollicituds` amb capçalera `Idempotency-Key`.
- Fases 4–6: sol·licituds, importació/exportació, adjudicació, places, assistència, estadístiques, auditoria.
- Es publicarà una especificació OpenAPI quan hi hagi els endpoints de gestió.
