# ADR 0001 · Un sol Worker amb Static Assets per al frontend i l'API

**Estat:** acceptada (Fase 1)

## Context
L'encàrrec proposa Cloudflare Pages per al frontend i Workers per a l'API. Cloudflare ofereix
avui Workers amb *Static Assets*, que serveix una SPA i una API des del mateix Worker.

## Decisió
Desplegar un únic Worker (`wrangler.jsonc`) que serveix els fitxers de `dist/client` i executa
primer el codi del Worker per a `/api/*` (`run_worker_first`).

## Conseqüències
- Mateix origen per al frontend i l'API: CORS restrictiu per defecte, cookies de sessió
  `SameSite=Strict` possibles i menys superfície CSRF.
- Un sol desplegament i una sola configuració d'entorns.
- Si l'organització exigeix Pages, l'API es pot moure a Pages Functions o mantenir-se com a
  Worker separat amb una ruta `/api/*` al mateix domini; el codi de `worker/` no canvia.
