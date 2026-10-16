# WhatsApp Business (API de Meta)

L'aplicació pot enviar els missatges de WhatsApp sols, des del número del casal, amb l'API
oficial de WhatsApp Business de Meta (Cloud API). Mentre no estigui configurada, les
comunicacions continuen sent semiautomàtiques: cada missatge obre WhatsApp amb el text escrit.

Què envia:

- **Comunicacions segons activitat**: a cada persona admesa (plantilla `placa_admesa`), en llista
  d'espera (`llista_espera`) o amb una plaça oferta (`oferta_placa`).
- **Comunicacions generals**: un avís redactat pel casal (`avis_general`), un sol cop per persona.
- **Baixa voluntària**: l'oferta de plaça a la persona següent de la llista d'espera surt sola
  (`oferta_placa`, amb els botons «Sí, la vull» / «No, gràcies»), si el casal ho té activat.

Què no fa:

- No desa cap telèfon ni el text de les respostes: el telèfon es llegeix de la sol·licitud en
  enviar, i de les respostes només es desa que n'hi ha hagut (o quin botó s'ha premut).
- Una resposta «No» no fa perdre la plaça: l'equip ho marca a la llista d'espera.
- Els telèfons fixos, sense telèfon o no vàlids, i els números que Meta indica que no tenen
  WhatsApp, passen al llistat de persones per trucar.

## Posada en marxa

1. **Compte de Meta Business** de l'entitat (business.facebook.com).
2. **App de Meta** (developers.facebook.com → Crea una app → tipus «Empresa») amb el producte
   **WhatsApp**. Cal associar-hi el compte de WhatsApp Business (WABA).
3. **Número de cada casal**: WhatsApp Manager → Números de telèfon → Afegeix. Si el número ja
   es fa servir a l'app WhatsApp Business del mòbil, cal fer l'alta amb l'opció de coexistència
   (per continuar llegint i responent des del mòbil) o deixar-lo d'usar a l'app.
4. **Testimoni permanent**: Configuració del negoci → Usuaris del sistema → afegeix un usuari
   del sistema, assigna-li l'app i el compte de WhatsApp i genera un testimoni amb els permisos
   `whatsapp_business_messaging` i `whatsapp_business_management`.
5. **Secrets del Worker** (mai al repositori, ni per correu ni per xat). Per a cada entorn:

   ```sh
   npx wrangler secret put WHATSAPP_TOKEN --env staging          # el testimoni del pas 4
   npx wrangler secret put WHATSAPP_APP_SECRET --env staging     # App → Configuració → Bàsica → Secret de l'app
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN --env staging   # un text llarg qualsevol, inventat
   ```

6. **Webhook**: App → WhatsApp → Configuració → URL de devolució de trucada
   `https://<domini>/api/whatsapp/webhook`, amb el mateix text de verificació del pas 5.
   Subscriviu-vos al camp **messages** (porta els avisos d'entrega i les respostes).
7. **Plantilles**: al panell, *Comunicacions → WhatsApp → Configuració de WhatsApp Business* hi ha
   les quatre plantilles amb el nom i el text exactes. Doneu-les d'alta a WhatsApp Manager amb
   categoria «Utilitat» i l'idioma del casal. Fins que Meta no les aprovi, l'enviament s'atura amb
   un avís i els missatges queden pendents per reprendre'ls.
8. **Al panell de cada casal**: a la mateixa pantalla, escriviu l'identificador del número
   (*Phone number ID*), activeu-lo i premeu «Comprova la connexió».

## Cost i consentiment

- Meta cobra cada conversa iniciada pel casal amb una plantilla, segons la categoria i el país
  (vegeu la pàgina de preus de WhatsApp Business Platform).
- Les persones han d'haver acceptat rebre missatges del casal per WhatsApp: cal que el text de
  privacitat del formulari d'inscripció ho digui.

## Detalls tècnics

- Client: `worker/lib/whatsapp-meta.ts` (Graph API v21.0). Servei: `worker/services/whatsapp.ts`.
- Els enviaments es fan per lots de 25 missatges per petició (`MIDA_LOT`); el panell demana
  els lots successius. Si Meta rebutja per un motiu general (testimoni, plantilla, límits),
  l'enviament s'atura i es pot reprendre.
- El webhook comprova la signatura `X-Hub-Signature-256` amb `WHATSAPP_APP_SECRET` i no
  registra mai el cos dels avisos.
- Taules: `whatsapp_config`, `whatsapp_enviaments`, `whatsapp_missatges` (migració 0024).
