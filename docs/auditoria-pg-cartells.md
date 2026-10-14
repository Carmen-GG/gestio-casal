# Auditoria del repositori PG-Cartells

**Data:** 14/10/2026 · **Abast:** lectura, sense cap modificació.

## Repositori examinat
- `Carmen-GG/PGEC-Cartells` (privat): **el repositori és buit**. No té cap commit ni cap branca
  (`git ls-remote` no retorna cap referència). Darrera activitat registrada: 31/07/2026.
- Altres repositoris accessibles (`plataforma-dorada`, `plataformadorada`,
  `plataformadorada-octubre`) corresponen al projecte Plataforma Dorada i no contenen codi de
  PG-Cartells ni de GestorCartellsCCC.

## Recursos aportats el 14/10/2026 (zip al projecte)

Carmen ha aportat dos paquets de plantilles. No hi ha codi.

| Paquet | Fitxers | Format | Variants |
|---|---|---|---|
| Bases Cartells cicles de programació | 12 PDF | **A3** (297 × 420 mm), 1 pàgina | 4 estacions (estiu, hivern, primavera, tardor) × titular d'1, 2 o 3 línies |
| Bases Instagram cicles programació | 12 PDF | 2048 × 2048 pt (quadrat) | 4 estacions × titular d'1 línia, 2 línies, o 2 línies amb codi QR |

### Constatacions tècniques
- Totes les plantilles són **formularis PDF (AcroForm)** exportats d'Illustrator 27.6, amb camps amb nom:
  - Cartells: `Tipus d'acte`, `Destinataris`, `Titular linia 1..3`, `Dates`, `Horaris`, `Nom CC1`, `Nom CC2`,
    `Adreça` (text) i `Imatge_af_image`, `Logo_af_image1`, `Logo_af_image2` (imatge).
  - Instagram: `Texto1..Texto7` (text), `Imatge_af_image` i, a les variants QR, `Codi QR` (imatge).
- Això permet generar els materials **omplint els camps** de la plantilla original, sense redibuixar-la:
  es conserven mida, marges, posicions, colors, logos fixos i jerarquia visual. La biblioteca `pdf-lib`
  (compatible amb Workers i navegador) pot omplir camps de text, inserir imatges als botons i aplanar el resultat.
- **Tipografia:** els camps fan servir Myriad Pro Condensed i Myriad Pro Bold Condensed, que **no estan
  incrustades** al PDF i són de llicència comercial d'Adobe. Per escriure-hi cal el fitxer de la font amb una
  llicència que permeti incrustar-la, o acordar una substitució (p. ex. Roboto Condensed, que la plantilla ja
  fa servir i és de llicència oberta).
- Les plantilles porten **dades i imatges d'exemple** (Casal Santa Coloma de Gramenet – Albert Francàs, fotos
  de mostra, logos de Fundació «la Caixa» i Paeria de Cervera) que s'hauran de buidar o substituir.
- La sortida d'Instagram ha de ser una imatge (PNG/JPEG): caldrà rasteritzar el PDF omplert (al navegador
  amb pdf.js, o al servidor) a 1080 × 1080 px o la mida que es decideixi.
- L'encàrrec parla de cartells A4; les plantilles són A3. Es pot generar A3 i, si cal, una versió A4 a escala.

## Conclusió
No es pot fer l'inventari demanat (tecnologies, plantilles A4 i d'Instagram, PDF de mostra,
importació d'Excel, fotografies, QR, historial, dependències i llicències) perquè no hi ha
cap fitxer a examinar. Seguint l'encàrrec, **no es reconstrueix res des de zero** ni s'inventen
plantilles fins que el codi i els recursos originals estiguin disponibles.

## Què cal per continuar
- El codi i els recursos originals (per exemple, pujant-los a `PGEC-Cartells` o compartint
  la carpeta del projecte), incloses les 12 plantilles A4 i les 12 d'Instagram si existeixen.

## Pla d'integració previst (pendent de confirmar amb l'auditoria)
1. Inventari de recursos i regles de negoci; conservar plantilles i recursos gràfics originals.
2. Si l'original és Python/PySide6/SQLite: conservar regles i recursos, no l'arquitectura d'escriptori.
3. Taules noves referenciant `casals`, `cicles`, `activitats` i `usuaris` (cap duplicat).
4. R2 per a fitxers; metadades i permisos a D1.
5. Generació de PDF i imatges: avaluar `pdf-lib` (funciona a Workers) per a PDF vectorials i
   renderització d'imatges al navegador o amb Cloudflare Browser Rendering, segons com estiguin
   definides les plantilles originals.
6. Permisos `cartells.*` i rol `difusio_casal`, ja definits a la migració 0001.
