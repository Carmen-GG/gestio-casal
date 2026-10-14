# Seguretat i protecció de dades

Revisió feta el 14/10/2026 sobre el mòdul d'inscripcions (fases 1 a 6, regla d'adjudicació i quadre de comandament). Cal repetir-la abans de desplegar a producció i després de cada canvi important.

## Mesures implementades

| Àmbit | Com es fa |
|---|---|
| Autenticació | Accés amb un enllaç d'un sol ús; al servidor només es desa el resum SHA-256 del codi. Sessió amb galeta `__Host-` HttpOnly, Secure i SameSite=Strict. Els permisos es tornen a carregar a cada petició. L'accés per enllaç està desactivat a producció ([autenticacio.md](autenticacio.md)). |
| Autorització | Cada ruta de gestió exigeix un permís sobre el casal de la ruta (`casalAutoritzat`). Cada entitat es carrega amb `casal_id = ?` abans de fer-hi res. |
| Accés entre casals | Revisat ruta per ruta, també amb els identificadors que arriben dins del cos: no s'ha trobat cap camí per llegir ni modificar dades d'un altre casal. |
| Validació | Tots els cossos es validen al servidor amb zod en mode estricte (es rebutgen camps no previstos). Els identificadors de ruta han de ser UUID. |
| SQL | Totes les consultes són preparades. Les parts dinàmiques són constants del codi o llistes de columnes permeses (`assignacionsUpdate`). |
| CSRF i CORS | Les peticions que modifiquen dades exigeixen JSON (cal preflight) i es rebutgen si l'`Origin` no és el propi o un de permès (`ALLOWED_ORIGINS`). La galeta és SameSite=Strict. |
| Abusos | El formulari públic té un límit de 10 enviaments per minut per origen de xarxa i una clau d'idempotència. El cos de les peticions té un màxim de 256 KB, tant si s'indica la mida com si no. |
| Capçaleres | L'API respon amb CSP `default-src 'none'`, `nosniff`, `no-referrer`, `no-store` i CORP. Els recursos estàtics porten CSP, `X-Frame-Options` i `Permissions-Policy` (`public/_headers`). |
| Dades personals | Sense el permís `sollicituds.dades_contacte`, només es veuen el nom i els cognoms; el document sempre surt emmascarat. Les exportacions només inclouen telèfon i correu amb aquest permís, i mai el document, l'adreça ni la data de naixement. L'historial desa quins camps han canviat, no els valors. |
| Registres | L'únic registre del servidor és el d'errors inesperats: tipus d'error, missatge i id de petició, mai el cos de la petició. |
| Secrets | Cap secret al repositori (revisat amb una cerca de patrons). Els secrets es configuren a Cloudflare. |
| Dependències | `npm audit`: 0 vulnerabilitats. |

## Accessibilitat
S'han revisat amb axe-core (WCAG 2.1 A i AA) 12 pantalles a Chromium, amb dades fictícies:
- inici, cicles públics, formulari d'inscripció i accés;
- inici del panell, casal, dos cicles amb totes les seccions obertes, detall de sol·licitud, assistència, pantalla de sorteig i persones autoritzades.

Resultat: cap incidència. axe només detecta una part dels problemes d'accessibilitat; falta una prova amb lector de pantalla i navegació només amb teclat feta per una persona.

## Riscos coneguts i reforços pendents
- **Repositoris sense filtre de casal:** alguns mètodes interns (sessions, marques, moviments, resultats, sortejos…) reben l'id d'una entitat ja comprovada i no tornen a filtrar per casal. Avui sempre els precedeix una càrrega amb `casal_id`. Si s'afegeix una ruta nova, cal fer aquesta càrrega primer.
- **Accés per enllaç sense límit:** `/auth/entrar` no té limitació de peticions. Els codis són de 256 bits i caduquen, i a producció està desactivat; quan hi hagi Microsoft Entra ID, deixarà d'existir.
- **Text de privacitat:** és provisional i està pendent de validació jurídica ([validacio-institucional.md](validacio-institucional.md)).
- **Còpies de seguretat:** depenen de Time Travel de D1 ([operacions.md](operacions.md)). Cal comprovar la retenció del pla contractat.
