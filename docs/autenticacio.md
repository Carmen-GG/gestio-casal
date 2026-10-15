# Autenticació i autorització

## Perfils
| Perfil | Com s'identifica | Què pot fer |
|---|---|---|
| Persona no autenticada | — | Àrea pública: consultar cicles i activitats publicades (i, a la Fase 3, enviar sol·licituds) |
| Personal d'un casal | Sessió del panell | Segons el rol al casal: `gestor_casal`, `consulta_casal`, `difusio_casal` |
| Administració central | Sessió del panell | Rol `admin_central` (abast global). Només s'ha d'assignar amb autorització expressa |

Els permisos de cada rol són a la taula `rols_permisos` (migració 0001). El servidor els torna a llegir a
**cada petició**: una revocació té efecte immediat. Cada ruta de `/api/gestio/casals/{casalId}/…`
comprova el permís concret en aquell casal, i els repositoris filtren sempre per casal.

## Sessions
- Galeta `__Host-casal_sessio`: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. No és accessible des de JavaScript.
- A la base de dades només se'n desa el resum SHA-256 (`sessions_usuari`).
- Caducitat absoluta: 8 hores. Caducitat per inactivitat: 60 minuts. «Tanca la sessió» la revoca al servidor.
- Protecció CSRF: `SameSite=Strict`, comprovació de l'origen a totes les peticions d'escriptura i
  obligació d'enviar JSON (un formulari d'un altre lloc no ho pot fer sense una consulta prèvia CORS, que es denega).

## Contrasenya (decisió del 2026-10-15)
Cada persona pot fixar una **contrasenya que no caduca** a «El meu compte» (`/gestio/compte`) i després
entrar amb el seu correu i aquesta contrasenya (`POST /api/auth/entrar-contrasenya`).
- Es desa només el resum PBKDF2-SHA256 (100.000 iteracions, sal aleatòria de 16 bytes) a `usuaris.contrasenya_resum`.
- Mínim 12 caràcters. Per canviar-la cal la contrasenya actual. El canvi queda a l'auditoria (`usuari.contrasenya`).
- Error genèric si el correu o la contrasenya no són correctes (no revela si el correu existeix) i límit
  d'intents per origen (`LIMIT_ENTRADA`, 10 per minut).
- La primera vegada s'entra amb un codi d'accés (secció següent) per poder fixar la contrasenya.
- La sessió continua caducant per inactivitat (60 minuts) i al cap de 8 hores; la contrasenya no.

## Codi d'accés d'un sol ús (entorns local i staging)
Per a la primera entrada, una persona amb accés a Cloudflare genera un **enllaç d'un sol ús**:

```bash
# Local
node scripts/acces-dev.mjs --email persona@exemple.cat --nom "Nom Cognom" --rol gestor_casal --casal CAN-BOADA
# Staging (cal `npx wrangler login`)
node scripts/acces-dev.mjs --entorn staging --url https://<domini-staging> --email … --nom … --rol admin_central
```

- L'enllaç caduca (30 minuts per defecte) i només es pot fer servir una vegada.
- El codi viatja al fragment de l'URL (`#testimoni=…`): el navegador no l'envia al servidor ni queda als
  registres, i la pàgina l'esborra de l'adreça immediatament.
- Els intents fallits queden a l'auditoria (`sessio.inici`, resultat `denegat`).
- **A producció aquest mètode està desactivat** (`APP_ENV=production` → `404`).

## Microsoft Entra ID (pendent)
L'arquitectura ja ho preveu: `usuaris.proveidor_identitat = 'entra_id'` i `subjecte_extern` (identificador `oid`).
Caldrà:
1. Registrar l'aplicació a Entra ID (l'organització), amb URL de retorn `https://<domini>/api/auth/entra/retorn`.
2. Desar `ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID` i `ENTRA_CLIENT_SECRET` com a secrets de Cloudflare.
3. Implementar el flux OpenID Connect (codi d'autorització + PKCE) al Worker; en validar el testimoni
   d'identitat, s'associa la persona per `oid` i es crea la mateixa sessió descrita més amunt.
Els rols i casals continuen gestionant-se a la plataforma (o es poden mapar a grups d'Entra, si es decideix).
