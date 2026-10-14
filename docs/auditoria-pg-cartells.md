# Auditoria del repositori PG-Cartells

**Data:** 14/10/2026 · **Abast:** lectura, sense cap modificació.

## Repositori examinat
- `Carmen-GG/PGEC-Cartells` (privat): **el repositori és buit**. No té cap commit ni cap branca
  (`git ls-remote` no retorna cap referència). Darrera activitat registrada: 31/07/2026.
- Altres repositoris accessibles (`plataforma-dorada`, `plataformadorada`,
  `plataformadorada-octubre`) corresponen al projecte Plataforma Dorada i no contenen codi de
  PG-Cartells ni de GestorCartellsCCC.

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
