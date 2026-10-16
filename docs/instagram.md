# Instagram

Publicació al compte d'Instagram de cada casal de les imatges fetes a PG-Cartells (petició de 2026-10-16).

## Principi

L'aplicació **no publica mai sola**. Una persona fa la imatge a «Nou material», prem «Prepara la publicació a
Instagram», revisa la previsualització i el text, i confirma «Publica ara» en un diàleg que mostra el compte
de destinació. El servidor exigeix aquesta confirmació (`confirmo: true`) i no publica dues vegades la mateixa
publicació.

## Flux

1. **Nou material** (plantilla d'Instagram) → «Genera la previsualització» → «Prepara la publicació a Instagram».
   La imatge es converteix a JPEG (Instagram no accepta PNG), es desa a R2 com a material del casal i es crea
   una publicació en estat *pendent* amb un text proposat (títol, destinataris, dates, horari, lloc i adreça
   d'inscripció).
2. **Comunicacions › Instagram › publicació**: previsualització com es veurà a Instagram, edició del text
   (màxim 2.200 caràcters, 30 etiquetes i 20 mencions), i dues maneres de publicar:
   - **Publica a Instagram** (si el compte està connectat): diàleg de confirmació i publicació directa.
   - **Publicar des del mòbil** (sempre): «Comparteix a Instagram» (menú de compartir del mòbil, copia el text),
     «Descarrega la imatge», «Copia el text» i «Marca com a publicada» amb l'enllaç opcional.
3. Estats: pendent → publicada / publicada a mà / descartada. Si Instagram falla, queda «No s'ha pogut publicar»
   amb el motiu i es pot tornar a provar.

## Connexió del compte (persona responsable del casal)

Fa servir l'**API d'Instagram amb inici de sessió d'Instagram** de Meta (`graph.instagram.com`), que no
necessita pàgina de Facebook. Cal:

1. Un compte d'Instagram **professional** (empresa o creador) del casal. Es canvia gratis a l'app d'Instagram:
   *Configuració › Tipus de compte i eines › Canvia a compte professional*.
2. Una **aplicació de Meta** (gratuïta) a <https://developers.facebook.com/apps> de tipus *Empresa*, amb el producte
   **Instagram › API setup with Instagram login**. En mode de desenvolupament n'hi ha prou: no cal revisió de
   Meta si el compte del casal hi està afegit com a *Instagram tester* (Rols de l'app) i ha acceptat la invitació
   des d'Instagram (*Configuració › Aplicacions i llocs web › Invitacions de provador*).
3. Al pas «Generate access tokens», afegir el compte del casal i **generar el testimoni** (permisos
   `instagram_business_basic` i `instagram_business_content_publish`).
4. A l'aplicació: **Comunicacions › Instagram › Connecta el compte d'Instagram** i enganxar-hi el testimoni.

El servidor comprova el testimoni amb Instagram (`/me`), el renova (dura 60 dies i es torna a renovar sol quan
es publica si fa més d'una setmana) i el desa **xifrat** amb AES-GCM a `instagram_comptes`. No es retorna mai
per l'API ni surt als registres. Permisos: connectar/desconnectar = `casal.configurar`; preparar i publicar =
`instagram.publicar` (responsable del casal, difusió i superadministració).

## Com rep Instagram la imatge

Instagram descarrega la imatge des d'una adreça pública. Mentre es publica, el servidor obre una adreça temporal
`/api/public/instagram/imatges/<testimoni aleatori>.jpg` vàlida 15 minuts i només per a aquella publicació
(a la base de dades se'n desa només el resum). En acabar, l'adreça es tanca. Per això la publicació directa
només funciona des d'un entorn amb adreça pública (staging o producció), no des de `localhost`.

## Configuració del servidor

- Secret del Worker **`INSTAGRAM_CLAU`**: clau de xifratge dels testimonis. El workflow de desplegament la crea
  sola la primera vegada (no es mostra mai) i no la torna a canviar. Si es canviés, caldria tornar a connectar
  els comptes. En local, a `.dev.vars`.
- Sense aquesta clau, la pàgina ho indica i només es pot publicar des del mòbil.
- Migració `0024_instagram.sql`: permís `instagram.publicar`, taules `instagram_comptes` i `instagram_publicacions`
  (les publicacions no s'esborren: es descarten).

## Límits coneguts

- Només imatges soles (no carrusels, vídeos ni històries).
- Instagram permet fins a 100 publicacions per API cada 24 hores per compte.
- Si es publica i després se suprimeix a Instagram, l'aplicació no se n'assabenta.
