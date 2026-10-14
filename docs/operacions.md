# Operacions: còpies de seguretat i recuperació

## Còpies de seguretat de D1
- **Time Travel** (inclòs a D1): permet restaurar la base de dades a qualsevol minut dels
  darrers 30 dies (pla de pagament; 7 dies al pla gratuït).
  - Consultar el punt actual: `npx wrangler d1 time-travel info DB --env production`
  - Restaurar: `npx wrangler d1 time-travel restore DB --env production --timestamp=<ISO>`
- **Exportació periòdica** fora de Cloudflare:
  `npx wrangler d1 export DB --remote --env production --output=copia-AAAAMMDD.sql`.
  El fitxer conté dades personals: s'ha de desar xifrat i en una ubicació autoritzada.

## Fitxers de PG-Cartells (R2)
- Buckets: `casal-gestio-fitxers-staging` i `casal-gestio-fitxers-production` (binding `FITXERS`).
  Cal crear-los abans del primer desplegament: `npx wrangler r2 bucket create casal-gestio-fitxers-production`.
  Han de ser **privats** (sense domini públic ni accés `r2.dev`).
- R2 no té Time Travel. Els fitxers no s'esborren mai des de l'aplicació, però per tenir-ne còpia fora de
  Cloudflare cal copiar el bucket periòdicament (p. ex. `rclone sync` amb un testimoni d'API de R2 de
  només lectura, desat fora del repositori). Les fotografies poden mostrar persones: la còpia s'ha de desar
  en una ubicació autoritzada.
- D1 i R2 s'han de restaurar junts: un registre de `cartells_fitxers` apunta a una clau de R2.

## Abans de cada migració
1. Anotar el marcador de Time Travel (`time-travel info`); el flux de desplegament ho fa automàticament.
2. Aplicar la migració primer a staging i executar les proves.
3. Aplicar-la a producció.

## Recuperació davant d'errors
- Error de codi: tornar a desplegar la versió anterior (`npx wrangler rollback --env production`).
- Error de dades: restaurar amb Time Travel al marcador anterior i tornar a aplicar les
  operacions legítimes posteriors a partir del registre d'auditoria.
- Les migracions no es desfan automàticament: es corregeixen amb una migració nova.
