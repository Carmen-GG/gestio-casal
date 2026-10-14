# Arquitectura

Plataforma única **Casal · Gestió integral d'inscripcions i activitats**, amb dos mòduls
funcionals (Inscripcions i PG-Cartells) que comparteixen infraestructura, autenticació,
casals, cicles i activitats.

## Visió general

```
Navegador (React + TS + Vite)
   │  mateix origen: https://domini/...
   ▼
Cloudflare Worker «casal-gestio»
   ├── Static Assets ──► SPA (àrea pública /inscripcio/..., panell /gestio)
   └── /api/* (Hono) ──► middleware: id de petició · capçaleres · CORS/CSRF · mida màxima
                          ├── /api/public/*     sense autenticació, llista blanca de camps
                          ├── /api/gestio/*     (Fase 2) sessió + rol + casal a cada petició
                          └── /api/cartells/*   (mòdul PG-Cartells, després de l'auditoria)
                                   │
                          serveis (lògica de negoci, adjudicació, validacions definitives)
                                   │
                          repositoris (interfícies) ──► implementació D1
                                   │
                    Cloudflare D1 (SQL)          Cloudflare R2 (fitxers; mòdul PG-Cartells)
```

## Decisions principals

| Tema | Decisió | Motiu |
|---|---|---|
| Allotjament | Un sol Worker amb Static Assets serveix el frontend i l'API | Cloudflare recomana Workers + Static Assets per a aplicacions noves; un sol origen evita CORS i simplifica CSRF i cookies. Pages continua sent possible (vegeu ADR 0001). |
| API | Hono sobre Workers | Enrutador petit, sense dependències, tipat i provat a Workers. |
| Base de dades | D1 amb migracions SQL versionades (`db/migrations`) | Requisit inicial; SQL estàndard, fàcil de migrar. |
| Accés a dades | Capa de repositoris (`worker/repositories/tipus.ts`) | Els serveis no coneixen D1; per migrar a PostgreSQL n'hi ha prou amb noves implementacions (ADR 0003). |
| Integritat | Restriccions, claus foranes compostes i *triggers* a la base de dades | Les regles crítiques (preferències úniques, activitat del mateix cicle, auditoria inalterable) no depenen només del codi. |
| Atomicitat | Lots de D1 (`batch`) + testimoni d'operació | Dada, historial i auditoria s'escriuen junts; si hi ha un conflicte de concurrència no queda historial fals. |
| Proves | Vitest dins del runtime de Workers amb D1 local (`@cloudflare/vitest-plugin`) | Les proves executen les migracions reals i el mateix motor SQL que producció. |
| Validació | Esquemes compartits a `shared/` per al frontend i el servidor | La validació del navegador és ajuda; el servidor torna a validar-ho tot. |
| Fitxers (PG-Cartells) | R2 per a fotografies, plantilles i materials; D1 només desa metadades | Evita blocs grans a la base de dades. S'activarà quan s'implementi el mòdul. |
| PDF i imatges | A decidir després d'auditar PG-Cartells (vegeu `auditoria-pg-cartells.md`) | Algunes biblioteques no funcionen a Workers; cal veure les plantilles originals. |

## Estructura del repositori

```
casal-gestio/
├── src/                 Frontend React
│   ├── components/      Components reutilitzables (disseny, estats de càrrega i error)
│   ├── hooks/           Hooks (consultes amb càrrega/error/cancel·lació)
│   ├── pages/           Pàgines (àrea pública; panell de gestió a partir de la Fase 2)
│   ├── services/        Client HTTP únic i serveis per recurs
│   └── utils/           Format de dates i horaris en català
├── shared/              Codi compartit frontend/servidor
│   ├── api/             Contractes de les respostes de l'API
│   └── domain/          Regles de domini pures (estats de cicle, ordenació alfabètica)
├── worker/              API (Cloudflare Worker)
│   ├── app.ts           Composició de l'aplicació i gestió centralitzada d'errors
│   ├── middleware/      Seguretat (CORS/CSRF, capçaleres, mida, id de petició)
│   ├── routes/          Rutes HTTP
│   ├── services/        Lògica de negoci
│   ├── repositories/    Interfícies + implementació D1
│   └── lib/             Utilitats (identificadors, rellotge injectable)
├── db/
│   ├── migrations/      Migracions SQL versionades
│   └── seeds/           Dades fictícies per a l'entorn local
├── tests/               Proves (domini, base de dades, API)
├── docs/                Documentació
├── public/              Recursos estàtics i capçaleres de seguretat (_headers)
├── .github/workflows/   CI i desplegament
├── wrangler.jsonc       Configuració Cloudflare (local, staging, producció)
└── .env.example, .dev.vars.example
```

Les carpetes del panell de gestió (`src/pages/gestio`, `worker/routes/gestio`) i del mòdul
PG-Cartells (`src/modules/cartells`, `worker/routes/cartells`) es crearan quan tinguin codi
real, no abans.

## Entorns

| Entorn | Worker | Base de dades | Ús |
|---|---|---|---|
| local | `vite dev` (workerd) | D1 local (Miniflare, `.wrangler/`) | Desenvolupament i proves |
| staging | `casal-gestio-staging` | `casal-gestio-staging` | Proves d'acceptació amb dades fictícies |
| production | `casal-gestio` | `casal-gestio-production` | Només després de la validació institucional |

## Multicasal

Totes les taules amb dades d'un casal porten `casal_id`, i les relacions entre cicles,
activitats, sol·licituds i preferències fan servir claus foranes compostes
(`(cicle_id, casal_id)`), de manera que la base de dades impedeix barrejar dades de casals.
Els repositoris sempre filtren per casal. Els permisos (Fase 2) s'avaluaran per rol **i** per casal
a cada petició.

## Integració de PG-Cartells

Vegeu `docs/auditoria-pg-cartells.md`. El mòdul reutilitzarà casals, cicles, activitats,
usuaris i permisos (ja hi ha permisos `cartells.*` i el rol `difusio_casal`), i afegirà les seves
pròpies taules (plantilles, recursos, continguts, materials i versions) i R2.
