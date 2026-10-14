# PG-Cartells

Mòdul de materials de difusió. Fa servir els mateixos casals, usuaris i permisos que Inscripcions.
Al menú del panell, quan hi ha un casal triat, apareixen els dos mòduls: **Inscripcions** i **PG-Cartells**
(aquest últim només amb el permís `cartells.consultar`).

## Estat
| Part | Estat |
|---|---|
| Emmagatzematge de fitxers (R2) i metadades (D1) | Fet |
| Plantilles: càrrega, biblioteca, fitxa, rols dels camps, estats | Fet |
| Generador de cartells PDF, imatges d'Instagram i codis QR | Fet (sense desar historial encara) |
| Fotografies, historial de materials, importació d'Excel | Pendent |

## Plantilles originals
Les 24 plantilles aportades (12 de cartell A3 i 12 d'Instagram de 2048 × 2048 pt) són **formularis PDF**
fets amb Illustrator. Els materials s'obtindran **omplint els camps** del PDF original, de manera que es
conserven la mida, els marges, els colors, els logotips fixos i la posició de cada element.

- El PDF original es desa a R2 **sense cap canvi**. Es pot descarregar des de la fitxa de la plantilla.
- En carregar-lo, el navegador llegeix els camps (nom, posició, cos de lletra, negreta, alineació i color)
  i desa també una imatge petita del disseny base, sense els textos ni les fotos d'exemple que porten
  les plantilles, per a la biblioteca.
- Les plantilles **no es guarden al repositori**: pesen uns 90 MB en total i porten fotos i logotips
  d'exemple d'altres entitats. Es carreguen des del panell (vegeu més avall).

### Rols dels camps
Cada camp del PDF rep un «rol», que diu quin contingut hi va: tipus d'acte, destinataris, títol (1 a 3 línies),
dates, horaris, nom del casal (2 línies), adreça, peu (Instagram), fotografia, logotips 1 i 2 i codi QR.

- **Cartells:** els camps tenen noms descriptius (`Titular linia 1`, `Dates`, `Nom CC1`…) i el rol surt del nom.
- **Instagram:** els camps es diuen `Texto1..Texto7`, i el mateix nom **no** vol dir el mateix a totes
  les variants (p. ex. `Texto5` és el títol a la tardor amb 2 línies i l'horari a l'estiu amb 1 línia).
  El rol es dedueix de la posició i la mida de la lletra (`shared/domain/cartells.ts`, amb proves amb
  els camps reals).
- A la fitxa de la plantilla es veu on és cada camp sobre el disseny i es pot corregir el rol.
- Una plantilla només es pot activar si té el títol (totes les línies), la fotografia i, si és de QR, el codi QR.

### Estats
`esborrany` → `activa` → `arxivada` (i tornar a esborrany). Les persones sense el permís
`cartells.plantilles` només veuen les actives. Una plantilla no s'esborra mai.

### Àmbit
- **Comuna** (`casal_id` nul): la veuen tots els casals. Només la carrega i modifica l'administració
  central (`cartells.plantilles` global).
- **Del casal**: només la veu aquell casal. La pot carregar qui tingui `cartells.plantilles` al casal.

## Procediment per carregar les plantilles originals (o afegir-ne de noves)
1. Entrar al panell amb un usuari d'administració central.
2. Triar el casal, **PG-Cartells → Plantilles → Carrega plantilles**.
3. Triar «A tots els casals», seleccionar tots els PDF i prémer **Carrega**. Cada fitxer es processa un per un
   i la taula diu el resultat: carregada i activada, carregada en esborrany (amb el motiu) o ja carregada.
4. Si alguna queda en esborrany, obrir-ne la fitxa, revisar els rols i activar-la.

El nom del fitxer original (`base_<estació>_DSI_[QR_]<n>L_<CAR|IG>.pdf`) dona el tipus, l'estació,
el nombre de línies del títol i si porta QR. Si el nom no segueix aquest patró, el tipus es dedueix
de la forma de la pàgina i les dades es poden corregir a la fitxa.

Tornar a carregar el mateix fitxer no crea cap duplicat: es reconeix pel resum SHA-256 del contingut.

## Generador de materials
**PG-Cartells → Nou material** (permís `cartells.generar`).

1. **Contingut:** es tria el cicle i l'activitat, o «contingut lliure».
2. **Plantilla:** qualsevol plantilla activa (comuna o del casal). Es veu el disseny base i com es lliura.
3. **Textos:** es proposen a partir de l'activitat i es poden editar. Editar-los **no canvia l'activitat**.
   «Recupera els textos proposats» desfà les edicions.
4. **Imatges i codi QR:** fotografia i logotips es trien de l'ordinador (JPEG, PNG o WebP). L'adreça del
   QR és, per defecte, el formulari públic d'inscripció del cicle (`/inscripcio/<codi del casal>/<cicle>`).
5. **Genera la previsualització**, revisar els avisos i **Descarrega**.

### Textos proposats (`shared/domain/cartells-contingut.ts`)
| Camp | Origen |
|---|---|
| Tipus d'acte | Categoria de l'activitat, en majúscules |
| Destinataris | Buit: s'escriu a mà (l'activitat no té aquesta dada) |
| Títol 1-3 | Nom de l'activitat repartit en tantes línies com té la plantilla, tan iguals com es pugui |
| Dates | Dates de l'activitat o, si no en té, les del cicle: «Del 12 de gener al 23 de març de 2027» |
| Horaris | Horari escrit a mà de l'activitat, o dies i hores: «Dilluns i dimecres, de 10.00 a 11.30 h» |
| Nom del casal 1-2 | Nom del casal tallat just abans del municipi |
| Adreça | Adreça del casal i municipi |
| Peu (Instagram) | Nom del casal i adreça, en dues línies |

### Com es fa el fitxer (`src/cartells/composicio.ts`)
Tot es fa **al navegador**: ni les fotografies ni els textos s'envien al servidor en aquesta fase.

- Es carrega el PDF original de la plantilla i se'n treuen els camps del formulari (amb els textos,
  fotos i logotips d'exemple). El disseny base queda intacte.
- Els textos es dibuixen com a **text vectorial** amb la lletra Roboto Condensed incrustada
  (llicència SIL Open Font License, paquet `@fontsource/roboto-condensed`), amb el cos, la negreta,
  l'alineació i el color del camp original. Si un text no hi cap, el cos es redueix; per sota del 70 %
  del cos original surt un avís.
- La fotografia omple la seva àrea i es retalla el que sobra; els logotips hi caben sencers. Abans,
  la imatge es gira segons la càmera i es redueix a 3.000 px com a màxim.
- El codi QR es dibuixa amb quadrats vectorials. **Només conté l'adreça web**: no s'hi posa cap dada personal.
- **Cartell:** PDF A4 (la plantilla A3 es redueix sense rasteritzar res). Es pot comprovar que el text
  es pot seleccionar i copiar.
- **Instagram:** imatge PNG de 1080 × 1080 px, dibuixada a partir del PDF compost.
- Avisos: textos buits, text massa reduït, caràcters que la lletra no té, fotografia o QR que falten.

L'historial de materials generats, el desament de fotografies amb les seves autoritzacions i la
reutilització de fotos entre cicles són la fase següent.

## Fitxers
| Ús | Tipus acceptats | Mida màxima | Permís per pujar-lo (casal / comú) |
|---|---|---|---|
| `plantilla` | PDF | 15 MB | `cartells.plantilles` / `cartells.plantilles` global |
| `previsualitzacio` | PNG, JPEG | 2 MB | `cartells.plantilles` / `cartells.plantilles` global |
| `fotografia`, `logotip` | JPEG, PNG | 10 MB / 2 MB | `cartells.fotografies` / `cartells.recursos_comuns` global |
| `material` | PDF, PNG, JPEG | 20 MB | `cartells.generar` / `cartells.recursos_comuns` global |

- El servidor comprova la signatura del fitxer (no es refia del tipus que diu el navegador), la mida
  mentre el llegeix i el permís.
- El bucket R2 és **privat**: els fitxers només es baixen a través de l'API, amb sessió i permís.
  Des d'un casal es poden baixar els fitxers del casal i els comuns, mai els d'un altre casal.
- Els fitxers són immutables: no s'esborren ni se substitueixen. Un canvi és un fitxer nou.

## Rols per defecte
El rol `difusio_casal` pot consultar, crear, generar i pujar fotografies. El rol `gestor_casal` només
**consulta** PG-Cartells: si una mateixa persona fa les dues feines, cal assignar-li també `difusio_casal`.
Administrar plantilles (`cartells.plantilles`) i recursos comuns és de l'administració central.

## Decisions tècniques
- **Lectura i previsualització al navegador** (pdf-lib i pdf.js, carregats només en aquesta part del panell):
  llegir un PDF de 5 MB consumeix més CPU de la que permet un Worker per petició.
- pdf.js es fa servir en la versió «legacy», que funciona també en navegadors que no són els més recents.
- **Tipografia:** les plantilles fan servir Myriad Pro, que no s'hi inclou i té llicència d'Adobe. Per
  decisió del 14/10/2026, els textos s'escriuran amb Roboto Condensed (llicència oberta).
