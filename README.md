# Casal · Gestió integral d'inscripcions i activitats

Plataforma web per gestionar les inscripcions, adjudicacions, llistes d'espera i assistència
de les activitats dels Casals Cívics i Comunitaris, i (pròximament) el mòdul de difusió
PG-Cartells. Casal inicial: Casal Cívic i Comunitari Terrassa – Can Boada.

> **Estat:** Fase 2 (autenticació, autoritzacions i gestió de casals, cicles i activitats).
> Encara no hi ha formulari d'inscripció (Fase 3). No s'ha desplegat a cap entorn de Cloudflare.
> Vegeu «Limitacions conegudes».

## Tecnologies
React 19 + TypeScript + Vite · Cloudflare Workers (Hono) amb Static Assets · Cloudflare D1 ·
Vitest dins del runtime de Workers. Detalls: [`docs/arquitectura.md`](docs/arquitectura.md).

## Requisits previs
- Node.js 22 o superior i npm.
- Per desplegar: un compte de Cloudflare autoritzat (vegeu [`docs/validacio-institucional.md`](docs/validacio-institucional.md)).

## Instal·lació i execució local
```bash
npm ci                     # instal·la dependències (.npmrc activa legacy-peer-deps)
cp .dev.vars.example .dev.vars   # secrets locals (de moment no n'hi ha cap d'obligatori)
npm run db:migrate:local   # crea la base de dades D1 local i aplica les migracions
npm run db:seed:local      # carrega dades FICTÍCIES de prova (casal Can Boada i un cicle)
npm run dev                # http://localhost:5173 (frontend + API al mateix servidor)
```
Proveu `http://localhost:5173/inscripcio/CAN-BOADA` i `http://localhost:5173/api/salut`.

Per entrar al panell de gestió (`/gestio`), genereu un enllaç d'un sol ús:
```bash
node scripts/acces-dev.mjs --email persona@exemple.cat --nom "Persona de prova" --rol gestor_casal --casal CAN-BOADA
```
Detalls: [`docs/autenticacio.md`](docs/autenticacio.md).

## Proves
```bash
npm test          # proves de domini, base de dades i API (D1 local, migracions reals)
npm run typecheck
npm run build
```

## Variables i secrets
| Nom | Tipus | On |
|---|---|---|
| `APP_ENV` | variable | `wrangler.jsonc` per entorn |
| `ALLOWED_ORIGINS` | variable | `wrangler.jsonc`; buit = només el mateix origen |
| `VITE_CASAL_PER_DEFECTE` | variable pública del frontend | `.env.local` (vegeu `.env.example`) |
| `SESSION_SECRET` (Fase 2) | **secret** | `.dev.vars` en local; `npx wrangler secret put SESSION_SECRET --env staging` |

No es desa cap secret al repositori. Tot el que comença per `VITE_` és públic.

## Configuració de Cloudflare
1. Crear les bases de dades (una per entorn), preferentment amb jurisdicció UE:
   ```bash
   npx wrangler d1 create casal-gestio-staging --jurisdiction eu
   npx wrangler d1 create casal-gestio-production --jurisdiction eu
   ```
2. Copiar cada `database_id` a `wrangler.jsonc` (substituint `SUBSTITUIR-PER-ID-…`). No són secrets.
3. Aplicar les migracions: `npm run db:migrate:staging` (i `db:migrate:production` quan toqui).
4. Configurar els secrets amb `npx wrangler secret put … --env <entorn>`.

## Desplegament
- **Secrets del repositori** (GitHub → Settings → Secrets and variables → Actions):
  `CLOUDFLARE_API_TOKEN` (plantilla «Edit Cloudflare Workers» + D1: Edit + Workers R2 Storage: Edit,
  només per al compte) i `CLOUDFLARE_ACCOUNT_ID`. Mai es posen al repositori.
- **Primer cop per entorn:** flux `Preparació de Cloudflare` (manual). Crea la base de dades D1 i el
  bucket R2 privat si no existeixen i mostra el `database_id`, que s'ha de posar a `wrangler.jsonc`.
- **Sense R2:** si R2 no està activat al compte (al token només es pot triar «Read»), es pot preparar i
  desplegar només Inscripcions: executar la preparació amb «Crea també el bucket R2» desmarcat i treure
  `r2_buckets` de l'entorn a `wrangler.jsonc`. PG-Cartells respon llavors «emmagatzematge no configurat»
  (503) fins que s'activi R2 i es torni a afegir el bucket.
- **Desplegament** (GitHub Actions, recomanat): flux `Desplegament` (manual). Fa proves, marca un punt de
  restauració, aplica migracions, compila, desplega i comprova que `/api/salut` respon amb la base de
  dades connectada. Es recomana protegir l'entorn `production` amb aprovació manual a GitHub.
- **Des d'un terminal** (Linux/macOS): `npm run deploy:staging` o `npm run deploy:production`
  (cal haver iniciat sessió amb `npx wrangler login`).
- **Domini:** a Cloudflare, Workers & Pages → `casal-gestio` → Settings → Domains & Routes →
  afegir el domini personalitzat. Si el frontend i l'API comparteixen domini, `ALLOWED_ORIGINS` pot quedar buit.

## Connexió amb GitHub
La CI (`.github/workflows/ci.yml`) s'executa a cada *push* i *pull request* sense secrets.
El desplegament només s'executa manualment.

## Migracions
Fitxers numerats a `db/migrations`. Mai es modifica una migració ja aplicada: cada canvi és
una migració nova. Procediment i còpies de seguretat: [`docs/operacions.md`](docs/operacions.md).

## Documentació
- [Arquitectura](docs/arquitectura.md) i [decisions (ADR)](docs/adr/)
- [Model de dades](docs/model-dades.md)
- [API](docs/api.md)
- [Autenticació i autorització](docs/autenticacio.md)
- [Operacions, còpies i recuperació](docs/operacions.md)
- [Seguretat i protecció de dades](docs/seguretat.md)
- [Requisits pendents de validació institucional](docs/validacio-institucional.md)
- [Auditoria de PG-Cartells](docs/auditoria-pg-cartells.md)
- [PG-Cartells: plantilles i fitxers](docs/cartells.md)

## Limitacions conegudes
- Sense formulari d'inscripció (Fase 3). L'autenticació corporativa (Entra ID) està preparada però no implementada.
- Sense limitació de peticions ni protecció antibots als endpoints públics (Fase 3: Rate Limiting de
  Cloudflare i Turnstile).
- El flux de desplegament no s'ha pogut executar: falten el compte i els identificadors de Cloudflare.
- Mòdul PG-Cartells en curs: plantilles fetes; generadors, fotografies i historial pendents ([cartells.md](docs/cartells.md)).
- Les regles d'adjudicació oficials s'han de validar abans d'implementar-les com a configuració.
